import { createClient } from '@supabase/supabase-js';
import { resolvePrinter } from './config.js';
import { buildTicket } from './tickets.js';
import { sendRaw, writeSimulated } from './transport.js';

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
 * Consome a fila print_queue do Supabase:
 *  - acorda imediatamente em cada INSERT (Realtime)
 *  - e faz polling periódico como garantia (queda de internet, Realtime fora)
 */
export class PrintWorker {
  constructor(config) {
    if (!config.supabaseUrl || !config.serviceRoleKey) {
      throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env do printer-bridge.');
    }
    this.config = config;
    this.supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.running = false;
    this.busy = false;
    this.again = false;
    this.stats = { printed: 0, failed: 0, lastError: null, lastJobAt: null, startedAt: new Date().toISOString() };
  }

  async start() {
    this.running = true;
    log(`[bridge] Iniciado em modo ${this.config.mode.toUpperCase()} como "${this.config.workerName}".`);

    this.channel = this.supabase
      .channel('print-queue-bridge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'print_queue' }, () => this.tick())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'print_queue' }, (payload) => {
        if (payload.new?.status === 'PENDING') this.tick();
      })
      .subscribe((status) => log(`[bridge] Realtime: ${status}`));

    this.timer = setInterval(() => this.tick(), this.config.pollIntervalMs);
    await this.tick();
  }

  async stop() {
    this.running = false;
    clearInterval(this.timer);
    if (this.channel) await this.supabase.removeChannel(this.channel);
  }

  async tick() {
    if (!this.running) return;
    if (this.busy) { this.again = true; return; }
    this.busy = true;
    try {
      do {
        this.again = false;
        const { data: jobs, error } = await this.supabase.rpc('claim_print_jobs', {
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

  async handle(job) {
    const label = `${job.kind} #${job.order_number} [${job.sector}]`;
    try {
      const result = await printJob(job, this.config);
      await this.complete(job.id, true, null, result.printer);
      this.stats.printed++;
      this.stats.lastJobAt = new Date().toISOString();
      log(`[bridge] ✔ ${label} -> ${result.detail}`);
    } catch (err) {
      await this.complete(job.id, false, err.message, null);
      this.stats.failed++;
      this.stats.lastError = err.message;
      log(`[bridge] ✖ ${label} (tentativa ${job.attempts}): ${err.message}`);
    }
  }

  async complete(id, success, error, printer) {
    const { error: rpcError } = await this.supabase.rpc('complete_print_job', {
      p_job_id: id,
      p_success: success,
      p_error: error,
      p_printer: printer,
    });
    if (rpcError) log('[bridge] Não foi possível atualizar o status do cupom:', rpcError.message);
  }
}
