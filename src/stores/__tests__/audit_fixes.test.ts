import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: {},
}));

import { useTableStore } from '../useTableStore';
import { useAuthStore } from '../useAuthStore';
import { INITIAL_PROFILES, INITIAL_TABLES } from '../../lib/mockData';
import { computeTabTotals, sumMoney } from '../../lib/utils';
import type { Tab } from '../../types/domain';

function makeTab(overrides: Partial<Tab> = {}): Tab {
  const now = new Date().toISOString();
  return {
    id: 'tab-1',
    shift_id: 'shift-1',
    table_id: INITIAL_TABLES[0]!.id,
    customer_name: 'Teste',
    people_count: 2,
    status: 'OPEN',
    opened_by: 'u1',
    closed_by: null,
    subtotal: 100,
    service_fee: 10,
    service_fee_enabled: true,
    discount: 0,
    total: 110,
    notes: null,
    opened_at: now,
    closed_at: null,
    updated_at: now,
    updated_by: 'u1',
    version: 3,
    ...overrides,
  };
}

describe('Correções da auditoria', () => {
  beforeEach(() => {
    useTableStore.setState({ tables: INITIAL_TABLES, tabs: [], orders: [], orderItems: [], payments: [] });
    useAuthStore.setState({ currentProfile: INITIAL_PROFILES[0]! });
  });

  it('calcula valores em centavos sem erro de ponto flutuante', () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(computeTabTotals(33.33, true, 0)).toEqual({ subtotal: 33.33, service_fee: 3.33, discount: 0, total: 36.66 });
    expect(computeTabTotals(50, false, 80).total).toBe(0);
  });

  it('mantém a taxa de serviço desligada pelo caixa', () => {
    useTableStore.setState({ tabs: [makeTab()] });
    useTableStore.getState().updateTabBillAdjustments('tab-1', { includeServiceFee: false });
    const tab = useTableStore.getState().tabs[0]!;
    expect(tab.service_fee_enabled).toBe(false);
    expect(tab.service_fee).toBe(0);
    expect(tab.total).toBe(100);
  });

  it('ignora evento remoto com versão mais antiga que a local', () => {
    useTableStore.setState({ tabs: [makeTab({ version: 5, customer_name: 'Local' })] });
    useTableStore.getState().applyRemoteTabChange('UPDATE', makeTab({ version: 4, customer_name: 'Remoto antigo' }));
    expect(useTableStore.getState().tabs[0]!.customer_name).toBe('Local');

    useTableStore.getState().applyRemoteTabChange('UPDATE', makeTab({ version: 6, customer_name: 'Remoto novo' }));
    expect(useTableStore.getState().tabs[0]!.customer_name).toBe('Remoto novo');
  });

  it('só gerência reabre comanda, com motivo', () => {
    useTableStore.setState({ tabs: [makeTab({ status: 'CLOSED' })] });
    const caixa = INITIAL_PROFILES.find((p) => p.role === 'CAIXA')!;
    useAuthStore.setState({ currentProfile: caixa });
    expect(() => useTableStore.getState().reopenTabAtomic('tab-1', caixa.id, 'erro')).toThrow(/gerência/);

    useAuthStore.setState({ currentProfile: INITIAL_PROFILES[0]! });
    expect(() => useTableStore.getState().reopenTabAtomic('tab-1', 'm', '  ')).toThrow(/motivo/);
    useTableStore.getState().reopenTabAtomic('tab-1', 'm', 'Pagamento lançado errado');
    expect(useTableStore.getState().tabs[0]!.status).toBe('OPEN');
  });

  it('remove pagamento cancelado recebido de outro caixa', () => {
    const payment = { id: 'p1', shift_id: 's', tab_id: 'tab-1', amount: 50, method: 'PIX' as const, status: 'PAID' as const, external_reference: null, notes: null, received_by: 'u', paid_at: '' };
    useTableStore.getState().applyRemotePaymentChange('INSERT', payment);
    expect(useTableStore.getState().payments).toHaveLength(1);
    useTableStore.getState().applyRemotePaymentChange('UPDATE', { ...payment, status: 'CANCELLED' });
    expect(useTableStore.getState().payments).toHaveLength(0);
  });
});
