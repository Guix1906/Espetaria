import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/supabase', () => ({ isSupabaseConfigured: false, supabase: {} }));
vi.mock('../../../lib/realtime', () => ({ realtimeService: { broadcastNewOrder: vi.fn(), broadcastOrderReady: vi.fn(), broadcastStockChange: vi.fn() } }));
vi.mock('../../../lib/audio', () => ({ audioService: { playOrderReadySound: vi.fn(), playNewOrderSound: vi.fn() } }));

import { INITIAL_PRODUCTS, INITIAL_TABLES } from '../../../lib/mockData';
import { useStockStore } from '../../../stores/useStockStore';
import { useTableStore } from '../../../stores/useTableStore';

const product = INITIAL_PRODUCTS.find((p) => p.id === 'prod-picanha')!;
const table = INITIAL_TABLES[0]!;

describe('Excluir (anular) comanda', () => {
  beforeEach(() => {
    useTableStore.setState({ tables: INITIAL_TABLES, tabs: [], orders: [], orderItems: [], payments: [] });
    useStockStore.setState({ products: INITIAL_PRODUCTS, dailyPrepStock: [], stockMovements: [] });
    useStockStore.getState().initShiftStock('s1', [{ productId: product.id, quantity: 10 }], 'u1');
  });

  it('cancela os itens, devolve o estoque, estorna pagamento e libera a mesa', () => {
    const tab = useTableStore.getState().openTab(table.id, 'Teste', 2, '', 'u1', 's1');
    useTableStore.getState().addOrderAtomic('s1', tab.id, [{ productId: product.id, quantity: 3 }], 'u1');
    expect(useStockStore.getState().getProductDailyStock(product.id)?.current_quantity).toBe(7);
    useTableStore.getState().addPaymentAtomic('s1', tab.id, 10, 'PIX', 'u1');

    // Espeto entra direto na brasa; quem anula escolheu "ainda não foi pro fogo"
    useTableStore.getState().voidTabAtomic(tab.id, 'Lançamento de teste', 'u1', true);

    const state = useTableStore.getState();
    expect(state.tabs.find((t) => t.id === tab.id)).toMatchObject({ status: 'CANCELLED', total: 0 });
    expect(state.orderItems.every((i) => i.status === 'CANCELLED')).toBe(true);
    expect(state.payments.every((p) => p.status === 'CANCELLED')).toBe(true);
    expect(state.tables.find((t) => t.id === table.id)?.status).toBe('LIVRE');
    expect(state.getTabByTableId(table.id)).toBeUndefined();
    expect(useStockStore.getState().getProductDailyStock(product.id)?.current_quantity).toBe(10);
  });

  it('espeto que já estava no fogo vira perda (não volta ao estoque)', () => {
    const tab = useTableStore.getState().openTab(table.id, 'Teste', 2, '', 'u1', 's1');
    useTableStore.getState().addOrderAtomic('s1', tab.id, [{ productId: product.id, quantity: 3 }], 'u1');
    useTableStore.getState().voidTabAtomic(tab.id, 'Cliente foi embora', 'u1', false);
    const stock = useStockStore.getState().getProductDailyStock(product.id);
    expect(stock?.current_quantity).toBe(7);
    expect(stock?.discarded_quantity).toBe(3);
  });

  it('cancelar item na brasa respeita a escolha de estoque', () => {
    const tab = useTableStore.getState().openTab(table.id, 'Teste', 2, '', 'u1', 's1');
    const order = useTableStore.getState().addOrderAtomic('s1', tab.id, [{ productId: product.id, quantity: 1 }, { productId: product.id, quantity: 2, doneness: 'BEM_PASSADA' }], 'u1');
    const [first, second] = useTableStore.getState().orderItems.filter((i) => i.order_id === order.id);
    expect(first!.status).toBe('IN_PREPARATION');
    useTableStore.getState().cancelOrderItemAtomic(first!.id, 'Engano', 'u1', 's1', true);
    expect(useStockStore.getState().getProductDailyStock(product.id)?.current_quantity).toBe(7 + first!.quantity);
    useTableStore.getState().cancelOrderItemAtomic(second!.id, 'Desistiu', 'u1', 's1', false);
    expect(useStockStore.getState().getProductDailyStock(product.id)?.discarded_quantity).toBe(second!.quantity);
  });

  it('exige motivo e só anula comanda aberta', () => {
    const tab = useTableStore.getState().openTab(table.id, 'Teste', 2, '', 'u1', 's1');
    expect(() => useTableStore.getState().voidTabAtomic(tab.id, '  ', 'u1')).toThrow('motivo');
    useTableStore.getState().voidTabAtomic(tab.id, 'Engano', 'u1');
    expect(() => useTableStore.getState().voidTabAtomic(tab.id, 'De novo', 'u1')).toThrow('aberta');
  });
});
