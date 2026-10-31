import { describe, it, expect, beforeEach } from 'vitest';
import { useTableStore } from '../../../stores/useTableStore';
import { RestaurantTable, Tab, Order } from '../../../types/domain';

describe('Troca de Mesa pelo Garçom (transferTableAtomic)', () => {
  const now = new Date().toISOString();

  const table1: RestaurantTable = {
    id: 'tbl-1',
    number: 1,
    status: 'OCUPADA',
    capacity: 4,
    active: true,
    created_at: now,
    updated_at: now,
    updated_by: 'waiter-1',
    version: 1,
  };

  const table2: RestaurantTable = {
    id: 'tbl-2',
    number: 2,
    status: 'LIVRE',
    capacity: 4,
    active: true,
    created_at: now,
    updated_at: now,
    updated_by: 'waiter-1',
    version: 1,
  };

  const table3: RestaurantTable = {
    id: 'tbl-3',
    number: 3,
    status: 'OCUPADA',
    capacity: 6,
    active: true,
    created_at: now,
    updated_at: now,
    updated_by: 'waiter-1',
    version: 1,
  };

  const tab1: Tab = {
    id: 'tab-1',
    table_id: 'tbl-1',
    shift_id: 'shift-1',
    customer_name: 'Cliente Mesa 1',
    people_count: 2,
    status: 'OPEN',
    subtotal: 50,
    service_fee: 5,
    service_fee_enabled: true,
    discount: 0,
    total: 55,
    opened_by: 'waiter-1',
    opened_at: now,
    closed_at: null,
    closed_by: null,
    updated_at: now,
    updated_by: 'waiter-1',
    notes: null,
    version: 1,
  };

  const tab3: Tab = {
    id: 'tab-3',
    table_id: 'tbl-3',
    shift_id: 'shift-1',
    customer_name: 'Cliente Mesa 3',
    people_count: 4,
    status: 'OPEN',
    subtotal: 100,
    service_fee: 10,
    service_fee_enabled: true,
    discount: 0,
    total: 110,
    opened_by: 'waiter-1',
    opened_at: now,
    closed_at: null,
    closed_by: null,
    updated_at: now,
    updated_by: 'waiter-1',
    notes: null,
    version: 1,
  };

  const order1: Order = {
    id: 'ord-1',
    tab_id: 'tab-1',
    table_id: 'tbl-1',
    shift_id: 'shift-1',
    order_number: 1,
    status: 'OPEN',
    notes: null,
    idempotency_key: null,
    created_at: now,
    updated_at: now,
    created_by: 'waiter-1',
    updated_by: 'waiter-1',
    version: 1,
    items: [],
  };

  beforeEach(() => {
    useTableStore.setState({
      tables: [table1, table2, table3],
      tabs: [tab1, tab3],
      orders: [order1],
      orderItems: [],
      payments: [],
    });
  });

  it('transfere comanda com sucesso da Mesa 1 para a Mesa 2 livre', () => {
    const { transferTableAtomic } = useTableStore.getState();

    transferTableAtomic('tab-1', 'tbl-2', 'waiter-1');

    const state = useTableStore.getState();
    const sourceTable = state.tables.find((t) => t.id === 'tbl-1')!;
    const targetTable = state.tables.find((t) => t.id === 'tbl-2')!;
    const tab = state.tabs.find((t) => t.id === 'tab-1')!;
    const order = state.orders.find((o) => o.id === 'ord-1')!;

    // Mesa 1 é liberada
    expect(sourceTable.status).toBe('LIVRE');
    expect(sourceTable.current_tab).toBeUndefined();

    // Mesa 2 fica ocupada com a comanda
    expect(targetTable.status).toBe('OCUPADA');
    expect(targetTable.current_tab?.id).toBe('tab-1');

    // Comanda agora aponta para Mesa 2
    expect(tab.table_id).toBe('tbl-2');
    expect(tab.version).toBe(2);

    // Pedido também é atualizado para Mesa 2 (para visualização no KDS)
    expect(order.table_id).toBe('tbl-2');
  });

  it('bloqueia transferência para uma mesa que já está ocupada', () => {
    const { transferTableAtomic } = useTableStore.getState();

    expect(() => {
      transferTableAtomic('tab-1', 'tbl-3', 'waiter-1');
    }).toThrow(/ocupada/i);
  });

  it('bloqueia transferência para a mesma mesa', () => {
    const { transferTableAtomic } = useTableStore.getState();

    expect(() => {
      transferTableAtomic('tab-1', 'tbl-1', 'waiter-1');
    }).toThrow(/já está nesta mesa/i);
  });

  it('bloqueia transferência de comanda inexistente ou fechada', () => {
    const { transferTableAtomic } = useTableStore.getState();

    expect(() => {
      transferTableAtomic('tab-inexistente', 'tbl-2', 'waiter-1');
    }).toThrow(/não encontrada/i);
  });
});
