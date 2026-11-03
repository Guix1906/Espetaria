import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Vários garçons ao mesmo tempo: rede ruim, deadlock no estoque e eventos fora de ordem não podem perder pedido nem apagar a tela. */

type Result = { data: unknown; error: { message?: string; code?: string } | null };
const db = vi.hoisted(() => ({
  rpc: vi.fn(),
  tables: {} as Record<string, Result>,
  inCalls: [] as { table: string; size: number }[],
}));

vi.mock('../supabase', () => {
  const query = (table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'or', 'order', 'limit', 'maybeSingle', 'gte']) builder[method] = () => builder;
    builder.in = (_column: string, ids: string[]) => { db.inCalls.push({ table, size: ids.length }); return builder; };
    builder.then = (resolve: (r: Result) => unknown) => resolve(db.tables[table] ?? { data: [], error: null });
    return builder;
  };
  return {
    isSupabaseConfigured: true,
    supabase: {
      rpc: db.rpc,
      from: query,
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
    },
  };
});

const { callRpc, friendlyRpcError, useRemoteErrorStore } = await import('../remote');
const { syncService } = await import('../syncService');
const { useTableStore } = await import('../../stores/useTableStore');

const ok = (data: unknown): Result => ({ data, error: null });
const fail = (code: string, message = 'erro'): Result => ({ data: null, error: { code, message } });

describe('callRpc com vários aparelhos', () => {
  beforeEach(() => {
    db.rpc.mockReset();
    db.tables = {};
    useRemoteErrorStore.setState({ lastError: null });
  });

  it('repete quando dois garçons travam o mesmo estoque (deadlock) e o pedido entra', async () => {
    db.rpc.mockResolvedValueOnce(fail('40P01', 'deadlock detected')).mockResolvedValueOnce(ok({ order_id: 'o1' }));
    await expect(callRpc('create_order_atomic', {}, 'teste')).resolves.toEqual({ order_id: 'o1' });
    expect(db.rpc).toHaveBeenCalledTimes(2);
    expect(useRemoteErrorStore.getState().lastError).toBeNull();
  });

  it('resposta perdida: a repetição que esbarra no próprio pagamento conta como sucesso', async () => {
    db.rpc.mockResolvedValueOnce(fail('', 'TypeError: Failed to fetch')).mockResolvedValueOnce(fail('23505', 'duplicate key'));
    await expect(callRpc('add_payment_atomic', {}, 'teste')).resolves.toEqual({ duplicate: true });
    expect(useRemoteErrorStore.getState().lastError).toBeNull();
  });

  it('regra de negócio não repete e avisa quem está atendendo', async () => {
    db.rpc.mockResolvedValue(fail('P0001', 'Estoque insuficiente para "Picanha"'));
    await expect(callRpc('create_order_atomic', {}, 'teste')).resolves.toBeNull();
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(useRemoteErrorStore.getState().lastError).toContain('Estoque insuficiente');
  });

  it('item alterado em outro aparelho só atualiza a tela, sem aviso vermelho', async () => {
    db.rpc.mockResolvedValue(fail('40001', 'CONFLITO: versão'));
    await expect(callRpc('update_order_item_status', {}, 'teste')).resolves.toBeNull();
    expect(useRemoteErrorStore.getState().lastError).toBeNull();
  });

  it('mensagens técnicas viram texto simples', () => {
    expect(friendlyRpcError('x', { message: 'TypeError: Failed to fetch' })).toContain('internet');
    expect(friendlyRpcError('x', { code: 'PGRST202', message: 'Could not find the function' })).toContain('não foi ativada');
  });
});

describe('hydrateAll', () => {
  const table = { id: 't1', number: 1, status: 'OCUPADA', active: true };
  const tab = { id: 'tab1', table_id: 't1', status: 'OPEN', subtotal: 10, service_fee: 0, discount: 0, total: 10 };

  beforeEach(() => {
    db.inCalls = [];
    db.tables = { restaurant_tables: ok([table]), tabs: ok([tab]), shifts: ok(null) };
    useTableStore.setState({ tables: [], tabs: [], orders: [], orderItems: [], payments: [] });
  });

  it('falha ao buscar comandas não apaga mesas e pedidos da tela', async () => {
    const keptOrder = { id: 'o1', tab_id: 'tab1' };
    useTableStore.setState({ tabs: [tab], orders: [keptOrder], orderItems: [{ id: 'i1', order_id: 'o1' }] } as never);
    db.tables.tabs = fail('', 'TypeError: Failed to fetch');
    await syncService.hydrateAll();
    const state = useTableStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.orders).toHaveLength(1);
    expect(state.orderItems).toHaveLength(1);
  });

  it('noite cheia: busca os itens em partes de no máximo 100 pedidos', async () => {
    db.tables.orders = ok(Array.from({ length: 250 }, (_, i) => ({ id: `o${i}`, tab_id: 'tab1', status: 'CONFIRMED' })));
    await syncService.hydrateAll();
    const itemCalls = db.inCalls.filter((c) => c.table === 'order_items');
    expect(itemCalls).toHaveLength(3);
    expect(Math.max(...itemCalls.map((c) => c.size))).toBeLessThanOrEqual(100);
    expect(useTableStore.getState().orders).toHaveLength(250);
  });
});

describe('eventos entre aparelhos', () => {
  const baseItem = { id: 'i1', order_id: 'o1', status: 'IN_PREPARATION', sector: 'GRILL', version: 1 };
  const baseOrder = { id: 'o1', tab_id: 'tab1', table_id: 't1', status: 'IN_PREPARATION', version: 1 };

  beforeEach(() => {
    db.rpc.mockReset();
    db.rpc.mockResolvedValue(ok({}));
    useTableStore.setState({
      tables: [{ id: 't1', number: 1, status: 'OCUPADA', version: 1 }],
      tabs: [{ id: 'tab1', table_id: 't1', status: 'OPEN', subtotal: 50, total: 50, discount: 0, service_fee: 0, version: 3 }],
      orders: [baseOrder],
      orderItems: [baseItem],
      payments: [],
    } as never);
  });

  it('trocar de mesa: mesa antiga livre não tira os espetos da churrasqueira', () => {
    useTableStore.getState().applyRemoteTableUpdate({ id: 't1', number: 1, status: 'LIVRE' });
    const state = useTableStore.getState();
    expect(state.orderItems[0]!.status).toBe('IN_PREPARATION');
    expect(state.orders[0]!.status).toBe('IN_PREPARATION');
  });

  it('mesa liberada com a comanda encerrada encerra os pedidos', () => {
    useTableStore.setState({ tabs: [{ ...useTableStore.getState().tabs[0]!, status: 'CLOSED' }] });
    useTableStore.getState().applyRemoteTableUpdate({ id: 't1', number: 1, status: 'LIVRE' });
    const state = useTableStore.getState();
    expect(state.orderItems[0]!.status).toBe('DELIVERED');
    expect(state.orders[0]!.status).toBe('CLOSED');
  });

  it('conta dividida: depois de receber uma parte, o caixa ainda vê o que outro garçom lançou', () => {
    useTableStore.getState().addPaymentAtomic('s1', 'tab1', 10, 'PIX', 'u1');
    useTableStore.getState().addPaymentAtomic('s1', 'tab1', 10, 'DINHEIRO', 'u1');
    const tab = useTableStore.getState().tabs[0]!;
    useTableStore.getState().applyRemoteTabChange('UPDATE', { ...tab, subtotal: 80, total: 80, version: 4 });
    expect(useTableStore.getState().tabs[0]!.total).toBe(80);
  });
});

describe('consulta de segurança com tempo real caído', () => {
  it('mesa aberta em outro aparelho chega com os pedidos, sem "Sem pedido"', async () => {
    const { useShiftStore } = await import('../../stores/useShiftStore');
    useShiftStore.setState({ currentShift: { id: 's1', status: 'ABERTO' } as never });
    useTableStore.setState({ tabs: [], orders: [], orderItems: [] });
    db.tables = {
      shifts: ok({ id: 's1', status: 'ABERTO' }),
      tabs: ok([{ id: 'tab1', status: 'OPEN', table_id: 'mesa4', shift_id: 's1', opened_at: new Date().toISOString(), people_count: 1, subtotal: 0, total: 0 }]),
      restaurant_tables: ok([{ id: 'mesa4', number: 4, status: 'OCUPADA' }]),
      orders: ok([{ id: 'o1', tab_id: 'tab1', table_id: 'mesa4', status: 'IN_PREPARATION', order_number: 1, version: 1 }]),
      order_items: ok([{ id: 'i1', order_id: 'o1', product_name: 'Long neck', quantity: 1, unit_price: 10, status: 'DELIVERED', version: 1 }]),
    };
    await syncService.pollOperationalDelta(true);
    const state = useTableStore.getState();
    expect(state.tabs.map((t) => t.id)).toContain('tab1');
    expect(state.getTabOrderItems('tab1').map((i) => i.id)).toEqual(['i1']);
  });
});
