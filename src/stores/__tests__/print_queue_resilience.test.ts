import { describe, it, expect, beforeEach } from 'vitest';
import { usePrintStore } from '../usePrintStore';
import { useSettingsStore } from '../useSettingsStore';
import { appStorage } from '../../lib/storage';

describe('Fila de Impressão Térmica e Resiliência Anti-Queda de Energia', () => {
  beforeEach(() => {
    appStorage.clear();
    useSettingsStore.getState().resetToDefaults();
    usePrintStore.setState({ jobs: [] });
  });

  it('1. Deve enfileirar comanda com chave de idempotência única por setor', () => {
    const store = usePrintStore.getState();

    const { job, isDuplicate } = store.enqueuePrintJob({
      order_id: 'ord-1001',
      order_number: 42,
      sector: 'GRILL',
      origin: 'SALAO',
      table_number: 5,
      items: [
        { name: 'Espeto de Picanha', quantity: 2, doneness: 'AO_PONTO' }
      ]
    });

    expect(isDuplicate).toBe(false);
    expect(job.idempotency_key).toBe('ORD-ord-1001-GRILL');
    expect(job.status).toBe('PENDING');
    expect(job.is_reprint).toBe(false);
  });

  it('2. NUNCA deve permitir comanda duplicada se o mesmo pedido for reenviado', () => {
    const store = usePrintStore.getState();

    // Primeira tentativa
    const firstAttempt = store.enqueuePrintJob({
      order_id: 'ord-1002',
      order_number: 43,
      sector: 'GRILL',
      origin: 'SALAO',
      table_number: 8,
      items: [{ name: 'Espeto de Alcatra', quantity: 1, doneness: 'BEM_PASSADA' }]
    });

    expect(firstAttempt.isDuplicate).toBe(false);

    // Segunda tentativa simultânea ou repetida com o mesmo order_id e setor
    const secondAttempt = store.enqueuePrintJob({
      order_id: 'ord-1002',
      order_number: 43,
      sector: 'GRILL',
      origin: 'SALAO',
      table_number: 8,
      items: [{ name: 'Espeto de Alcatra', quantity: 1, doneness: 'BEM_PASSADA' }]
    });

    expect(secondAttempt.isDuplicate).toBe(true);
    expect(secondAttempt.job.id).toBe(firstAttempt.job.id);
    // Deve haver apenas 1 job na fila
    expect(usePrintStore.getState().jobs.length).toBe(1);
  });

  it('3. Deve separar comandas independentes para Churrasqueira (GRILL) e Cozinha (KITCHEN)', () => {
    const store = usePrintStore.getState();

    // Comanda Churrasqueira
    const grillJob = store.enqueuePrintJob({
      order_id: 'ord-1003',
      order_number: 44,
      sector: 'GRILL',
      origin: 'SALAO',
      table_number: 2,
      items: [{ name: 'Espeto de Tulipa', quantity: 3, doneness: null }]
    });

    // Comanda Cozinha
    const kitchenJob = store.enqueuePrintJob({
      order_id: 'ord-1003',
      order_number: 44,
      sector: 'KITCHEN',
      origin: 'SALAO',
      table_number: 2,
      items: [{ name: 'Mandioca Cozida', quantity: 1, notes: 'Sem cheiro verde' }]
    });

    expect(grillJob.job.sector).toBe('GRILL');
    expect(kitchenJob.job.sector).toBe('KITCHEN');
    expect(grillJob.job.idempotency_key).toBe('ORD-ord-1003-GRILL');
    expect(kitchenJob.job.idempotency_key).toBe('ORD-ord-1003-KITCHEN');
    expect(usePrintStore.getState().jobs.length).toBe(2);
  });

  it('4. Recuperação pós-queda de energia: job interrompido deve virar 2ª VIA para não duplicar preparo', () => {
    const store = usePrintStore.getState();

    const { job } = store.enqueuePrintJob({
      order_id: 'ord-1004',
      order_number: 45,
      sector: 'GRILL',
      origin: 'SALAO',
      table_number: 4,
      items: [{ name: 'Picanha', quantity: 2, doneness: 'AO_PONTO' }]
    });

    // Simula a queda de energia enquanto o job estava no meio do envio para a impressora
    store.simulateBlackoutRecovery();

    const recoveredJob = usePrintStore.getState().jobs.find(j => j.id === job.id);
    expect(recoveredJob).toBeDefined();
    expect(recoveredJob?.is_reprint).toBe(true);
    expect(recoveredJob?.reprint_reason).toContain('desligamento abrupto');

    // Ao gerar o texto para a bobina térmica, deve conter o aviso ostensivo de 2ª VIA
    const ticketText = store.formatTicketText(recoveredJob!);
    expect(ticketText).toContain('*** 2ª VIA - REIMPRESSAO ***');
    expect(ticketText).toContain('PONTO: [ AO PONTO ]');
  });

  it('5. Reimpressão manual deve gerar comanda carimbada como 2ª VIA', () => {
    const store = usePrintStore.getState();

    const { job } = store.enqueuePrintJob({
      order_id: 'ord-1005',
      order_number: 46,
      sector: 'KITCHEN',
      origin: 'SALAO',
      table_number: 3,
      items: [{ name: 'Batata Frita Especial', quantity: 1 }]
    });

    const reprint = store.reprintJob(job.id, 'Garçom solicitou cópia física');
    expect(reprint.is_reprint).toBe(true);
    expect(reprint.reprint_reason).toBe('Garçom solicitou cópia física');

    const ticketText = store.formatTicketText(reprint);
    expect(ticketText).toContain('*** 2ª VIA - REIMPRESSAO ***');
    expect(ticketText).toContain('Garçom solicitou cópia física');
  });

  it('6. retryAllFailedJobs deve reenviar todos os cupons que falharam durante a queda de energia', async () => {
    usePrintStore.setState({
      jobs: [
        {
          id: 'job-f1',
          order_id: 'ord-101',
          order_number: 101,
          sector: 'GRILL',
          origin: 'SALAO',
          table_number: 1,
          items: [{ name: 'Espeto de Cupim', quantity: 1 }],
          status: 'FAILED',
          idempotency_key: 'ORD-101-GRILL',
          is_reprint: false,
          attempts: 3,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_error: 'Tempo esgotado ao falar com 192.168.3.17:9100',
        },
        {
          id: 'job-f2',
          order_id: 'ord-102',
          order_number: 102,
          sector: 'KITCHEN',
          origin: 'DELIVERY',
          customer_name: 'Marcos',
          items: [{ name: 'Farofa e Vinagrete', quantity: 2 }],
          status: 'FAILED',
          idempotency_key: 'ORD-102-KITCHEN',
          is_reprint: false,
          attempts: 3,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_error: 'Tempo esgotado ao falar com 192.168.3.12:9100',
        },
      ],
    });

    expect(usePrintStore.getState().jobs.filter((j) => j.status === 'FAILED').length).toBe(2);

    const retriedCount = await usePrintStore.getState().retryAllFailedJobs();
    expect(retriedCount).toBe(2);

    const jobs = usePrintStore.getState().jobs;
    expect(jobs.some((j) => j.status === 'FAILED')).toBe(false);
    expect(jobs.every((j) => ['PENDING', 'PRINTING', 'PRINTED'].includes(j.status))).toBe(true);
    expect(jobs.every((j) => !j.last_error)).toBe(true);
  });

  it('7. dismissFailedJobs deve registrar IDs dispensados sem excluir cupons', () => {
    usePrintStore.setState({
      jobs: [
        {
          id: 'job-f3',
          order_id: 'ord-103',
          order_number: 103,
          sector: 'GRILL',
          origin: 'SALAO',
          table_number: 10,
          items: [{ name: 'Picanha', quantity: 1 }],
          status: 'FAILED',
          idempotency_key: 'ORD-103-GRILL',
          is_reprint: false,
          attempts: 3,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      dismissedFailedJobIds: [],
    });

    usePrintStore.getState().dismissFailedJobs();
    expect(usePrintStore.getState().dismissedFailedJobIds).toContain('job-f3');
    expect(usePrintStore.getState().jobs.length).toBe(1);
  });
});
