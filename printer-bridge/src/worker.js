import { createClient } from '@supabase/supabase-js';
import { resolvePrinter } from './config.js';
import { buildTicket } from './tickets.js';
import { sendRaw, writeSimulated, probe } from './transport.js';

const log = (...args) => console.log(new Date().toLocaleTimeString('pt-BR'), ...args);

/** Imprime (ou simula) um único job. Lança erro em caso de falha. */
export async function printJob(job, config) {
  const { target, address } = resolvePrinter(config, job.sector);
  const receipt = buildTicket(job, config);

  if (config.mode === 'simulate') {
    const file = await writeSimulated(config.outputDir, target, job, receipt);
    return { printer: `SIMULADO:${target}`, detail: file };
  }

  if (!address) {
    throw new Error(`Nenhuma impressora configurada para ${target}. Defina PRINTER_${target} no .env.`);
  }
  await sendRaw(address, receipt.toBuffer(), config.printTimeoutMs);
  return { printer: `${target}@${address.label}`, detail: address.label };
}

/**
 * Espeto "com acompanhamento": a churrasqueira faz o espeto e a cozinha monta
 * arroz, vinagrete, farofa e purê. Gera uma cópia do cupom para a COZINHA só com esses itens.
 */
export function sideDishCopy(job) {
  if (job.sector !== 'GRILL' || !['ORDER', 'CANCEL'].includes(job.kind)) return null;
  const items = (job.items || []).filter((item) =>
    /acompanhamento/i.test(item.name || '') ||
    /(?:arroz|bai[aã]o|pur[eê]|vinagrete|farofa|salada|mandioca|batata|fritas)/i.test(item.notes || '')
  );
  if (!items.length) return null;
  return { ...job, id: `${job.id}-acomp`, sector: 'KITCHEN', items };
}

/**
 * Via do motoboy (cupom de expedição): só para entrega no endereço; retirada não tem.
 * Sai na CHURRASQUEIRA quando o pedido tem espeto; se for só cozinha/bar, sai na COZINHA.
 * Devolve null quando não deve imprimir.
 */
export function deliverySummarySector(orderType, itemSectors) {
  if (orderType === 'PICKUP') return null;
  return (itemSectors || []).includes('GRILL') || !(itemSectors || []).length ? 'GRILL' : 'KITCHEN';
}

/**
 * Consome a fila print_queue do Supabase:
 *  - acorda imediatamente em cada INSERT (Realtime)
 *  - e faz polling periódico como garantia (queda de internet, Realtime fora)
 */
export class PrintWorker {
  constructor(config) {
    this.restricted = Boolean(config.anonKey && config.printerEmail && config.printerPassword);
    if (!config.supabaseUrl || (!this.restricted && !config.serviceRoleKey)) {
      throw new Error('Defina no .env: SUPABASE_URL + SUPABASE_ANON_KEY + PRINTER_EMAIL + PRINTER_PASSWORD (recomendado) ou SUPABASE_SERVICE_ROLE_KEY.');
    }
    this.config = config;
    this.supabase = createClient(config.supabaseUrl, this.restricted ? config.anonKey : config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: this.restricted },
    });
    // No acesso restrito as RPCs passam pelos wrappers printer_* (checam se o usuário é a impressora)
    this.rpcName = (name) => (this.restricted ? `printer_${name}` : name);
    this.running = false;
    this.busy = false;
    this.again = false;
    this.stats = { printed: 0, failed: 0, lastError: null, lastJobAt: null, startedAt: new Date().toISOString() };
    this.latestProbe = null;
    this.heartbeatTimer = null;
  }

  async start() {
    this.running = true;
    if (this.restricted) {
      const { error } = await this.supabase.auth.signInWithPassword({
        email: this.config.printerEmail,
        password: this.config.printerPassword,
      });
      if (error) throw new Error(`Login do usuário da impressora falhou: ${error.message}`);
      log(`[bridge] Logado com acesso restrito (${this.config.printerEmail}).`);
    }
    log(`[bridge] Iniciado em modo ${this.config.mode.toUpperCase()} como "${this.config.workerName}".`);

    this.channel = this.supabase
      .channel('print-queue-bridge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'print_queue' }, () => this.tick())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'print_queue' }, (payload) => {
        if (payload.new?.status === 'PENDING') this.tick();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'restaurant_settings' }, () => {
        this.templatesAt = 0;
        log('[bridge] Modelos de impressão invalidados (config alterada).');
      })
      .subscribe((status) => {
        log(`[bridge] Realtime: ${status}`);
        if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          log('[bridge] ⚠ WebSocket desconectado — operando em modo polling até reconexão.');
        } else if (status === 'SUBSCRIBED') {
          log('[bridge] ✔ WebSocket conectado.');
        }
      });

    this.timer = setInterval(() => this.tick(), this.config.pollIntervalMs);

    // 1. Teste de conexão inicial com as impressoras ao iniciar o bridge
    log('[bridge] 🔍 Testando conexão com as impressoras (Cozinha e Churrasqueira)...');
    try {
      const initialStatus = await this.probeAndReportHeartbeat();
      if (initialStatus) {
        const grill = initialStatus.grill_online ? `ONLINE (${initialStatus.grill_latency_ms}ms)` : `OFFLINE (${initialStatus.grill_error || 'sem sinal'})`;
        const kitchen = initialStatus.kitchen_online ? `ONLINE (${initialStatus.kitchen_latency_ms}ms)` : `OFFLINE (${initialStatus.kitchen_error || 'sem sinal'})`;
        log(`[bridge] 🖨️  Churrasqueira: ${grill} | Cozinha: ${kitchen}`);
      }
    } catch (e) {
      log('[bridge] Erro no teste inicial:', e.message);
    }

    // 2. Monitoramento contínuo das impressoras a cada 20 segundos
    this.heartbeatTimer = setInterval(() => this.probeAndReportHeartbeat(), 20000);

    await this.tick();
  }

  async stop() {
    this.running = false;
    clearInterval(this.timer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.channel) await this.supabase.removeChannel(this.channel);
  }

  /** Testa o socket TCP de cada impressora e publica o status em tempo real no Supabase. */
  async probeAndReportHeartbeat() {
    try {
      const grillResult = this.config.printers.GRILL ? await probe(this.config.printers.GRILL) : { ok: false, error: 'não configurada' };
      const kitchenResult = this.config.printers.KITCHEN ? await probe(this.config.printers.KITCHEN) : { ok: false, error: 'não configurada' };

      this.latestProbe = {
        GRILL: { address: this.config.printers.GRILL?.label ?? null, ...grillResult },
        KITCHEN: { address: this.config.printers.KITCHEN?.label ?? null, ...kitchenResult },
        at: new Date().toISOString(),
      };

      const payload = {
        id: 'default',
        worker_name: this.config.workerName,
        mode: this.config.mode,
        last_heartbeat: new Date().toISOString(),
        grill_online: Boolean(grillResult.ok),
        grill_ip: this.config.printers.GRILL?.label ?? null,
        grill_latency_ms: grillResult.ms ?? null,
        grill_error: grillResult.error ? String(grillResult.error) : null,
        kitchen_online: Boolean(kitchenResult.ok),
        kitchen_ip: this.config.printers.KITCHEN?.label ?? null,
        kitchen_latency_ms: kitchenResult.ms ?? null,
        kitchen_error: kitchenResult.error ? String(kitchenResult.error) : null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await this.supabase.from('printer_status').upsert(payload);
      if (error) {
        log('[bridge] Falha ao gravar status no banco:', error.message);
      }
      return payload;
    } catch (err) {
      log('[bridge] Erro no teste de conexao das impressoras:', err.message);
      return null;
    }
  }

  async tick() {
    if (!this.running) return;
    if (this.busy) { this.again = true; return; }

    // Salvaguarda: em modo LIVE, se nenhuma impressora física responder ao teste na rede local,
    // NÃO consome a fila. Isso evita que um computador fora da rede da loja (ex.: notebook em casa)
    // sequestre os cupons e marque pedidos como FAILED após 3 tentativas de timeout.
    if (this.config.mode === 'live' && this.latestProbe) {
      const anyOnline = Object.values(this.latestProbe).some((p) => p && typeof p === 'object' && p.ok);
      if (!anyOnline) {
        return;
      }
    }
    this.busy = true;
    try {
      do {
        this.again = false;
        const { data: jobs, error } = await this.supabase.rpc(this.rpcName('claim_print_jobs'), {
          p_worker: this.config.workerName,
          p_limit: 10,
        });
        if (error) throw new Error(`Falha ao buscar fila: ${error.message}`);
        if (jobs?.length) {
          // Setores diferentes em paralelo; mesma impressora é serializada no transporte
          await Promise.all(jobs.map((job) => this.handle(job)));
          this.again = true;
        }
      } while (this.again && this.running);
    } catch (err) {
      this.stats.lastError = err.message;
      log('[bridge] ERRO:', err.message);
    } finally {
      this.busy = false;
    }
  }

  /** Modelos de impressão salvos no painel (cache de 30s; em falha usa o último/padrão). */
  async loadTemplates() {
    if (this.templatesAt && Date.now() - this.templatesAt < 30000) return this.templates;
    const { data, error } = await this.supabase.from('restaurant_settings').select('print_templates, print_paper_width').limit(1).maybeSingle();
    if (error) log('[bridge] Modelos de impressão indisponíveis, usando padrão:', error.message);
    else {
      this.templates = data?.print_templates || null;
      // Largura escolhida no painel: 58mm = 32 colunas; 80mm = valor do .env (padrão 48)
      this.paperColumns = data?.print_paper_width === '58mm' ? 32 : null;
    }
    this.templatesAt = Date.now();
    return this.templates;
  }

  /** Setor onde sai a via do motoboy (ver deliverySummarySector). */
  async summarySector(job) {
    const orderType = job.payload?.order_type;
    const { data, error } = await this.supabase.from('delivery_order_items').select('sector').eq('delivery_order_id', job.order_id);
    if (error) log('[bridge] Setores do pedido indisponíveis, via do motoboy vai para a churrasqueira:', error.message);
    return deliverySummarySector(orderType, (data || []).map((row) => row.sector));
  }

  /** Dados do cliente para a etiqueta de delivery (nome, telefone, endereço, pagamento). */
  async enrich(job) {
    if (job.kind !== 'ORDER' || job.origin !== 'DELIVERY') return job;
    const { data, error } = await this.supabase
      .from('delivery_orders')
      .select('customer_name, phone, address_street, address_number, address_neighborhood, address_complement, address_reference, payment_method, cash_change_for, paid_at, subtotal, delivery_fee, total, notes, created_at')
      .eq('id', job.order_id)
      .maybeSingle();
    if (error) log('[bridge] Sem dados do cliente para a etiqueta:', error.message);
    return data ? { ...job, delivery: data } : job;
  }

  async handle(job) {
    const label = `${job.kind} #${job.order_number} [${job.sector}]`;
    const maxRetries = 3;
    const attempt = (job.attempts || 0) + 1;
    try {
      // Delivery: o resumo é a via do entregador (churrasqueira/cozinha). Retirada já tem os
      // dados no cupom do setor: expedição separada só se PRINT_DELIVERY_SUMMARY=true no .env
      if (job.kind === 'DELIVERY_SUMMARY') {
        const sector = await this.summarySector(job);
        if (!sector && process.env.PRINT_DELIVERY_SUMMARY !== 'true') {
          await this.complete(job.id, true, null, 'DISPENSADO');
          log(`[bridge] – ${label} dispensado (retirada no balcão, sem motoboy)`);
          return;
        }
        if (sector) job = { ...job, sector };
      }
      const templates = await this.loadTemplates();
      const printConfig = { ...this.config, templates, ...(this.paperColumns ? { paperColumns: this.paperColumns } : {}) };
      const enriched = await this.enrich(job);
      const result = await printJob(enriched, printConfig);
      await this.complete(job.id, true, null, result.printer);
      this.stats.printed++;
      this.stats.lastJobAt = new Date().toISOString();
      log(`[bridge] ✔ ${label} -> ${result.detail}`);
      const copy = sideDishCopy(enriched);
      if (copy) {
        // Falha na cópia não desfaz o cupom da churrasqueira (já impresso)
        try {
          const copyResult = await printJob(copy, printConfig);
          log(`[bridge] ✔ ${job.kind} #${job.order_number} [ACOMPANHAMENTO -> KITCHEN] -> ${copyResult.detail}`);
        } catch (copyErr) {
          this.stats.lastError = copyErr.message;
          log(`[bridge] ✖ Cópia dos acompanhamentos #${job.order_number} falhou: ${copyErr.message}`);
        }
      }
    } catch (err) {
      if (attempt < maxRetries) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        log(`[bridge] ↻ ${label} falhou (tentativa ${attempt}/${maxRetries}), retentando em ${backoffMs}ms: ${err.message}`);
        setTimeout(() => {
          this.supabase.rpc(this.rpcName('requeue_print_job'), { p_job_id: job.id, p_error: err.message }).then(({ error }) => {
            if (error) log('[bridge] ERRO ao re-enfileirar:', error.message);
          });
        }, backoffMs);
      } else {
        await this.complete(job.id, false, err.message, null);
        this.stats.failed++;
        this.stats.lastError = err.message;
        log(`[bridge] ✖ ${label} falha permanente após ${maxRetries} tentativas: ${err.message}`);
      }
    }
  }

  async complete(id, success, error, printer) {
    const { error: rpcError } = await this.supabase.rpc(this.rpcName('complete_print_job'), {
      p_job_id: id,
      p_success: success,
      p_error: error,
      p_printer: printer,
    });
    if (rpcError) log('[bridge] Não foi possível atualizar o status do cupom:', rpcError.message);
  }
}
