import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase', () => ({ isSupabaseConfigured: false, supabase: {} }));

import { buildCashFlow, buildProfit, sumBy, type FinanceDataset } from '../financeData';

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

  it('calcula bruto, líquido e lucro sem descontar a compra de mercadoria duas vezes', () => {
    const item = (product_id: string, product_name: string, quantity: number, day: string, cancelled = false) => ({ at: at(day), product_id, product_name, quantity, total: 0, sector: 'GRILL', cancelled, channel: 'SALAO' as const, waiter_id: null });
    const { total, buckets, missingCost } = buildProfit({
      ...base,
      sales: [{ id: 's', at: at('2026-10-01'), amount: 300, method: 'PIX', channel: 'SALAO' }, { id: 'd', at: at('2026-10-02'), amount: 100, method: 'DINHEIRO', channel: 'DELIVERY' }],
      tabs: [{ closed_at: at('2026-10-01'), total: 300, people: 2, discount: 10, service_fee: 27 }],
      driverPayouts: [{ at: at('2026-10-02'), total: 15 }],
      productCosts: { picanha: 20 },
      items: [item('picanha', 'Picanha', 3, '2026-10-01'), item('picanha', 'Picanha', 9, '2026-10-01', true), item('suco', 'Suco', 2, '2026-10-02')],
      entries: [
        entry({ amount: 50, category: 'Energia e água', paid_at: at('2026-10-02') }),
        entry({ amount: 500, category: 'Carnes e insumos', paid_at: at('2026-10-02') }),
        entry({ amount: 70, category: 'Aluguel' }), // não paga: fora do lucro
      ],
    });
    expect(total).toMatchObject({ gross: 400, discounts: 10, drivers: 15, net: 385, productCost: 60, expenses: 50, merchandise: 500, profit: 275 });
    expect(buckets[0]).toMatchObject({ gross: 300, net: 300, productCost: 60, profit: 240 });
    expect(buckets[1]).toMatchObject({ gross: 100, drivers: 15, expenses: 50, profit: 35 });
    expect(missingCost).toEqual(['Suco']);
  });

  it('soma por chave em ordem decrescente', () => {
    expect(sumBy([{ k: 'a', v: 1 }, { k: 'b', v: 5 }, { k: 'a', v: 2 }], (r) => r.k, (r) => r.v)).toEqual([{ name: 'b', total: 5 }, { name: 'a', total: 3 }]);
  });
});
