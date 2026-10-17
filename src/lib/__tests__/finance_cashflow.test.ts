import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase', () => ({ isSupabaseConfigured: false, supabase: {} }));

import { buildCashFlow, sumBy, type FinanceDataset } from '../financeData';

const base: FinanceDataset = {
  from: '2026-10-01', to: '2026-10-05', sales: [], items: [], deliveries: [], losses: [], shifts: [], tabs: [], entries: [], openTabsTotal: 0, staff: {},
};
const at = (d: string) => new Date(`${d}T15:00:00`).toISOString();
const entry = (over: Partial<FinanceDataset['entries'][number]>) => ({ id: Math.random().toString(), kind: 'PAGAR' as const, description: 'x', category: 'Outros', amount: 100, due_date: '2026-10-02', paid_at: null, payment_method: null, supplier: null, notes: null, created_at: at('2026-10-01'), ...over });

describe('Fluxo de caixa', () => {
  it('separa realizado de previsto e acumula o saldo só com o realizado', () => {
    const flow = buildCashFlow({
      ...base,
      sales: [{ id: 's', at: at('2026-10-01'), amount: 500, method: 'PIX', channel: 'SALAO' }, { id: 's', at: at('2026-10-02'), amount: 200, method: 'PIX', channel: 'DELIVERY' }],
      deliveries: [{ at: at('2026-10-03'), total: 80, fee: 8, neighborhood: 'Centro', status: 'OUT_FOR_DELIVERY', paid: false, method: 'DINHEIRO' }],
      entries: [
        entry({ amount: 300, paid_at: at('2026-10-02') }),
        entry({ amount: 1000, due_date: '2026-10-04' }),
        entry({ kind: 'RECEBER', amount: 400, due_date: '2026-10-05' }),
      ],
    });
    expect(flow).toHaveLength(5);
    expect(flow[0]).toMatchObject({ inflow: 500, outflow: 0, balance: 500 });
    expect(flow[1]).toMatchObject({ inflow: 200, outflow: 300, balance: 400 });
    expect(flow[2]).toMatchObject({ inflowForecast: 80, balance: 400 });
    expect(flow[3]).toMatchObject({ outflowForecast: 1000, balance: 400 });
    expect(flow[4]).toMatchObject({ inflowForecast: 400, balance: 400 });
    // projetado = realizado + previsto: 400 + 80 - 1000 + 400
    expect(flow[4]!.projected).toBe(-120);
  });

  it('conta vencida antes do período aparece como previsto no primeiro dia', () => {
    const flow = buildCashFlow({ ...base, entries: [entry({ amount: 250, due_date: '2026-09-20' })] });
    expect(flow[0]!.outflowForecast).toBe(250);
  });

  it('agrupa por mês em períodos longos', () => {
    const flow = buildCashFlow({ ...base, from: '2026-01-01', to: '2026-06-30' });
    expect(flow).toHaveLength(6);
  });

  it('agrupa por semana (segunda a domingo) e por ano', () => {
    const sales = [{ id: 's', at: at('2026-10-05'), amount: 10, method: 'PIX', channel: 'SALAO' as const }, { id: 's', at: at('2026-10-11'), amount: 20, method: 'PIX', channel: 'SALAO' as const }, { id: 's', at: at('2026-10-12'), amount: 5, method: 'PIX', channel: 'SALAO' as const }];
    const weeks = buildCashFlow({ ...base, from: '2026-10-05', to: '2026-10-18', sales }, 'week');
    expect(weeks.map((w) => w.inflow)).toEqual([30, 5]);
    expect(buildCashFlow({ ...base, from: '2025-12-01', to: '2026-01-31', sales }, 'year')).toHaveLength(2);
  });

  it('soma por chave em ordem decrescente', () => {
    expect(sumBy([{ k: 'a', v: 1 }, { k: 'b', v: 5 }, { k: 'a', v: 2 }], (r) => r.k, (r) => r.v)).toEqual([{ name: 'b', total: 5 }, { name: 'a', total: 3 }]);
  });
});
