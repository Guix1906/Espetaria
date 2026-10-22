import { create } from 'zustand';
import { PrintJob, PrintJobItem } from '../types/domain';
import { ProductionSector } from '../types/enums';
import { generateId } from '../lib/utils';
import { logger } from '../lib/logger';
import { useSettingsStore } from './useSettingsStore';
import { appStorage } from '../lib/storage';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { callRpc } from '../lib/remote';

const STORAGE_KEY = 'espetaria_print_queue_v1';

export interface CreatePrintJobInput {
  order_id: string;
  order_number: number;
  sector: ProductionSector;
  origin: 'SALAO' | 'DELIVERY';
  table_number?: number;
  customer_name?: string;
  items: PrintJobItem[];
}

/** Converte uma linha da tabela print_queue para o formato da interface. */
function fromRow(row: Record<string, unknown>): PrintJob {
  return {
    ...(row as unknown as PrintJob),
    table_number: (row.table_number as number | null) ?? undefined,
    customer_name: (row.customer_name as string | null) ?? undefined,
    reprint_reason: (row.reprint_reason as string | null) ?? undefined,
    last_error: (row.last_error as string | null) ?? undefined,
    printed_at: (row.printed_at as string | null) ?? undefined,
  };
}

interface PrintState {
  jobs: PrintJob[];
  /** Carrega os cupons recentes do banco (modo Supabase). */
  loadRemoteJobs: () => Promise<void>;
  /** Aplica INSERT/UPDATE vindo do Realtime (modo Supabase). */
  applyRemoteJob: (row: Record<string, unknown>) => void;
  /** Cupom de teste real para o setor (NONE = caixa/expedição). */
  sendTestPrint: (sector: ProductionSector) => Promise<void>;
  /** Imprime a conta da mesa (conferência) na churrasqueira. Retorna false se o banco recusar. */
  printBill: (tableId: string) => Promise<boolean>;
  enqueuePrintJob: (input: CreatePrintJobInput) => { job: PrintJob; isDuplicate: boolean };
  processJob: (jobId: string) => Promise<boolean>;
  reprintJob: (jobId: string, reason?: string) => PrintJob;
  retryJob: (jobId: string) => void;
  clearPrintedJobs: () => Promise<boolean>;
  /** Exclui cupons da fila (no banco, com Supabase). Retorna false se o banco recusar. */
  deleteJobs: (jobIds: string[]) => Promise<boolean>;
  /** Realtime: cupom excluído em outro aparelho. */
  removeRemoteJob: (jobId: string) => void;
  simulateBlackoutRecovery: () => void;
  formatTicketText: (job: PrintJob) => string;
}

const loadInitialQueue = (): PrintJob[] => {
  try {
    const raw = appStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: PrintJob[] = JSON.parse(raw);

    // Detecção de recuperação pós-queda de energia:
    // Se o sistema reiniciou e algum job estava no estado 'PRINTING' (interrompido no meio),
    // ele é marcado com aviso explícito de 2ª via/recuperação para não duplicar na cozinha!
    return parsed.map((job) => {
      if (job.status === 'PRINTING') {
        logger.warn({
          context: 'PrintStore',
          message: `Job ${job.id} recuperado após desligamento abrupto. Marcado como 2ª Via para evitar preparo duplicado.`,
          data: { idempotency_key: job.idempotency_key }
        });
        return {
          ...job,
          status: 'PENDING',
          is_reprint: true,
          reprint_reason: 'Recuperado após desligamento abrupto/queda de energia',
          attempts: job.attempts + 1,
        };
      }
      return job;
    });
  } catch (err) {
    logger.error({ context: 'PrintStore', message: 'Erro ao carregar fila de impressão', data: { err } });
    return [];
  }
};

const saveQueue = (jobs: PrintJob[]) => {
  try {
    appStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  } catch (err) {
    logger.error({ context: 'PrintStore', message: 'Erro ao salvar fila de impressão', data: { err } });
  }
};

export const usePrintStore = create<PrintState>((set, get) => ({
  // Com Supabase, a fila oficial é a tabela print_queue (gerada pelo banco)
  jobs: isSupabaseConfigured ? [] : loadInitialQueue(),

  loadRemoteJobs: async () => {
    if (!isSupabaseConfigured) return;
    const since = new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('print_queue')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      logger.warn({ context: 'PrintStore', message: 'Erro ao carregar fila de impressão', error });
      return;
    }
    set({ jobs: (data || []).map(fromRow) });
  },

  applyRemoteJob: (row) => {
    const job = fromRow(row);
    const others = get().jobs.filter((j) => j.id !== job.id);
    set({ jobs: [job, ...others].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 200) });
  },

  sendTestPrint: async (sector) => {
    if (!isSupabaseConfigured) {
      get().enqueuePrintJob({
        order_id: generateId(), order_number: 0, sector, origin: 'SALAO', customer_name: 'Teste',
        items: [{ name: 'Teste de impressão', quantity: 1, doneness: null, notes: null }],
      });
      return;
    }
    await callRpc('enqueue_test_print', { p_sector: sector }, 'PrintStore');
  },

  printBill: async (tableId) => {
    // Modo demonstração: sem banco, não há cupom real de conta
    if (!isSupabaseConfigured) return true;
    return (await callRpc('enqueue_bill_print', { p_table_id: tableId, p_reprint: true }, 'PrintStore')) !== null;
  },

  enqueuePrintJob: (input) => {
    // Com Supabase, o próprio banco gera os cupons na transação do pedido.
    // Nada é enfileirado pelo navegador (evita cupom duplicado ou perdido).
    if (isSupabaseConfigured) {
      const placeholder: PrintJob = {
        id: `server-${input.order_id}-${input.sector}`, ...input, status: 'PENDING',
        idempotency_key: `ORD-${input.order_id}-${input.sector}`, is_reprint: false, attempts: 0,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      return { job: placeholder, isDuplicate: false };
    }


    const idempotencyKey = `ORD-${input.order_id}-${input.sector}`;
    const existing = get().jobs.find((j) => j.idempotency_key === idempotencyKey);

    // Proteção estrita contra duplicação de pedidos:
    if (existing) {
      logger.warn({
        context: 'PrintStore',
        message: `Tentativa de impressão duplicada bloqueada para chave: ${idempotencyKey}`,
        data: { status: existing.status }
      });
      return { job: existing, isDuplicate: true };
    }

    const settings = useSettingsStore.getState().settings;

    // Verifica se a impressora deste setor está habilitada
    const isSectorEnabled =
      input.sector === 'GRILL' ? settings.printer_grill_enabled :
      input.sector === 'KITCHEN' ? settings.printer_kitchen_enabled :
      input.sector === 'BAR' ? true :
      settings.printer_cashier_enabled;

    const newJob: PrintJob = {
      id: generateId(),
      order_id: input.order_id,
      order_number: input.order_number,
      sector: input.sector,
      origin: input.origin,
      table_number: input.table_number,
      customer_name: input.customer_name,
      items: input.items,
      status: isSectorEnabled ? 'PENDING' : 'PRINTED', // Se impressora desativada, conclui direto
      idempotency_key: idempotencyKey,
      is_reprint: false,
      attempts: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const updatedList = [newJob, ...get().jobs];
    saveQueue(updatedList);
    set({ jobs: updatedList });

    logger.info({
      context: 'PrintStore',
      message: `Comanda enfileirada com sucesso para setor ${input.sector} (#${input.order_number})`,
      data: { idempotency_key: idempotencyKey }
    });

    // Se auto_print_orders estiver ativo, executa o job
    if (settings.auto_print_orders && isSectorEnabled) {
      setTimeout(() => {
        get().processJob(newJob.id);
      }, 100);
    }

    return { job: newJob, isDuplicate: false };
  },

  processJob: async (jobId) => {
    const job = get().jobs.find((j) => j.id === jobId);
    if (!job || job.status === 'PRINTED') return false;

    // Com Supabase quem imprime é o printer-bridge; aqui só pedimos novo envio
    if (isSupabaseConfigured) {
      if (job.status !== 'FAILED') return false;
      return (await callRpc('retry_print_job', { p_job_id: jobId }, 'PrintStore')) !== null;
    }

    // Marca como PRINTING
    const printingJobs = get().jobs.map((j) =>
      j.id === jobId ? { ...j, status: 'PRINTING' as const, attempts: j.attempts + 1, updated_at: new Date().toISOString() } : j
    );
    saveQueue(printingJobs);
    set({ jobs: printingJobs });

    try {
      // Simulação de envio seguro para impressora térmica com ACK de hardware
      await new Promise((resolve) => setTimeout(resolve, 350));

      const printedJobs = get().jobs.map((j) =>
        j.id === jobId
          ? {
              ...j,
              status: 'PRINTED' as const,
              printed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              last_error: undefined,
            }
          : j
      );
      saveQueue(printedJobs);
      set({ jobs: printedJobs });

      logger.info({
        context: 'PrintStore',
        message: `Comanda #${job.order_number} (${job.sector}) impressa com sucesso no dispositivo físico.`,
      });

      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Falha na comunicação com a impressora térmica';
      const failedJobs = get().jobs.map((j) =>
        j.id === jobId
          ? {
              ...j,
              status: 'FAILED' as const,
              last_error: errorMsg,
              updated_at: new Date().toISOString(),
            }
          : j
      );
      saveQueue(failedJobs);
      set({ jobs: failedJobs });
      return false;
    }
  },

  reprintJob: (jobId, reason = 'Reimpressão solicitada pelo operador') => {
    const target = get().jobs.find((j) => j.id === jobId);
    if (!target) throw new Error('Comanda não encontrada para reimpressão.');

    if (isSupabaseConfigured) {
      void callRpc('reprint_print_job', { p_job_id: jobId, p_reason: reason }, 'PrintStore');
      return { ...target, is_reprint: true, reprint_reason: reason, status: 'PENDING' };
    }

    // Cria nova comanda explicitamente marcada como 2ª VIA
    const reprintJob: PrintJob = {
      ...target,
      id: generateId(),
      idempotency_key: `${target.idempotency_key}-REP-${Date.now()}`,
      status: 'PENDING',
      is_reprint: true,
      reprint_reason: reason,
      attempts: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      printed_at: undefined,
    };

    const updatedList = [reprintJob, ...get().jobs];
    saveQueue(updatedList);
    set({ jobs: updatedList });

    logger.info({
      context: 'PrintStore',
      message: `2ª Via gerada para comanda #${target.order_number} (${target.sector}). Motivo: ${reason}`,
    });

    get().processJob(reprintJob.id);
    return reprintJob;
  },

  retryJob: (jobId) => {
    const updated = get().jobs.map((j) =>
      j.id === jobId ? { ...j, status: 'PENDING' as const, last_error: undefined } : j
    );
    saveQueue(updated);
    set({ jobs: updated });
    get().processJob(jobId);
  },

  clearPrintedJobs: () => get().deleteJobs(get().jobs.filter((j) => j.status === 'PRINTED').map((j) => j.id)),

  deleteJobs: async (jobIds) => {
    const ids = new Set(jobIds);
    if (!ids.size) return true;
    const previous = get().jobs;
    const remaining = previous.filter((j) => !ids.has(j.id));
    set({ jobs: remaining });
    if (!isSupabaseConfigured) { saveQueue(remaining); return true; }
    // Banco exclui de verdade (cupom aguardando não sai mais); se recusar, volta a lista
    const ok = (await callRpc('delete_print_jobs', { p_job_ids: [...ids] }, 'PrintStore')) !== null;
    if (!ok) set({ jobs: previous });
    return ok;
  },

  removeRemoteJob: (jobId) => set({ jobs: get().jobs.filter((j) => j.id !== jobId) }),

  simulateBlackoutRecovery: () => {
    // Simula um travamento / falta de luz no meio de uma impressão
    if (get().jobs.length === 0) return;
    const first = get().jobs[0]!;
    const simulated = get().jobs.map((j) =>
      j.id === first.id
        ? {
            ...j,
            status: 'PRINTING' as const,
            printed_at: undefined,
          }
        : j
    );
    saveQueue(simulated);
    // Recarrega aplicando a regra de detecção pós-queda
    set({ jobs: loadInitialQueue() });
  },

  formatTicketText: (job) => {
    const settings = useSettingsStore.getState().settings;
    const width = settings.print_paper_width === '58mm' ? 32 : 42;
    const divider = '='.repeat(width);
    const subDivider = '-'.repeat(width);

    const sectorTitle =
      job.sector === 'GRILL' ? '*** CHURRASQUEIRA / BRASA ***' :
      job.sector === 'KITCHEN' ? '*** COZINHA & CUBAS ***' :
      job.sector === 'BAR' ? '*** BAR & BEBIDAS ***' :
      '*** CONFERENCIA GERAL ***';

    const originText = job.origin === 'DELIVERY'
      ? `DELIVERY - ${job.customer_name || 'Cliente'}`
      : `MESA ${job.table_number ?? 'S/N'}${job.customer_name ? ` (${job.customer_name})` : ''}`;

    const dateStr = new Date(job.created_at).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    let output = '';
    output += `${divider}\n`;
    output += `${settings.name.toUpperCase().padStart(Math.floor((width + settings.name.length) / 2))}\n`;
    output += `${sectorTitle.padStart(Math.floor((width + sectorTitle.length) / 2))}\n`;
    output += `${divider}\n`;

    if (job.is_reprint) {
      output += `\n******************************************\n`;
      output += `     *** 2ª VIA - REIMPRESSAO ***         \n`;
      if (job.reprint_reason) {
        output += `  ${job.reprint_reason}\n`;
      }
      output += `******************************************\n\n`;
    }

    output += `PEDIDO: #${job.order_number}   HORA: ${dateStr}\n`;
    output += `LOCAL : ${originText}\n`;
    output += `${subDivider}\n`;
    output += `QTD  ITEM / ESPECIFICACAO\n`;
    output += `${subDivider}\n`;

    job.items.forEach((item) => {
      const qtyStr = `${item.quantity}x`.padEnd(5);
      output += `${qtyStr}${item.name.toUpperCase()}\n`;
      if (item.doneness) {
        const donenessLabel =
          item.doneness === 'MAL_PASSADA' ? 'MAL PASSADA' :
          item.doneness === 'AO_PONTO_PARA_MAL' ? 'AO PONTO P/ MAL' :
          item.doneness === 'AO_PONTO' ? 'AO PONTO' :
          item.doneness === 'AO_PONTO_PARA_BEM' ? 'AO PONTO P/ BEM' :
          'BEM PASSADA';
        output += `     PONTO: [ ${donenessLabel} ]\n`;
      }
      if (item.notes) {
        output += `     OBS  : ${item.notes}\n`;
      }
    });

    output += `${subDivider}\n`;
    output += `IDEMPOTENCY: ${job.idempotency_key.slice(-16)}\n`;
    output += `${divider}\n\n`;

    return output;
  },
}));
