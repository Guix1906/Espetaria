import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FeedbackProvider } from '../../../components/ui/FeedbackProvider';
import type { FinanceDataset } from '../../../lib/financeData';
import { CashFlow, Overview } from '../FinanceView';

const data: FinanceDataset = {
  from: '2026-10-01', to: '2026-10-17',
  sales: [
    { id: 's1', at: '2026-10-12T21:00:00Z', amount: 120, method: 'PIX', channel: 'SALAO' },
    { id: 's2', at: '2026-10-12T22:00:00Z', amount: 80, method: 'DINHEIRO', channel: 'SALAO' },
    { id: 's3', at: '2026-10-13T20:00:00Z', amount: 55, method: 'CARTAO_ENTREGA', channel: 'DELIVERY' },
  ],
  items: [], deliveries: [{ at: '2026-10-13T20:00:00Z', total: 55, fee: 5, neighborhood: 'Centro', status: 'DELIVERED', paid: true, method: 'CARTAO_ENTREGA' }],
  losses: [], shifts: [], tabs: [],
  entries: [
    { id: 'e1', kind: 'PAGAR', description: 'Carvão', category: 'Carvão e gás', amount: 90, due_date: '2026-10-10', paid_at: '2026-10-10T12:00:00Z', payment_method: 'PIX', supplier: null, notes: null, created_at: '2026-10-09T12:00:00Z' },
    { id: 'e2', kind: 'RECEBER', description: 'Evento', category: 'Outros', amount: 300, due_date: '2026-10-20', paid_at: null, payment_method: null, supplier: null, notes: null, created_at: '2026-10-09T12:00:00Z' },
  ],
  openTabsTotal: 40,
  staff: {},
};

const render = (node: JSX.Element) => renderToStaticMarkup(<FeedbackProvider>{node}</FeedbackProvider>);

describe('Financeiro com dados reais', () => {
  it('visão geral mostra a receber e a pagar separados', () => {
    const html = render(<Overview data={data} />);
    expect(html).toContain('A receber');
    expect(html).toContain('A pagar');
  });
  it('fluxo de caixa agrupa as vendas por dia e canal', () => {
    const html = render(<CashFlow data={data} reload={() => {}} />);
    expect(html).toContain('Vendas do salão');
    expect(html).toContain('Vendas do delivery');
    expect(html).toContain('2 vendas');
    expect(html).toContain('Carvão');
  });
});
