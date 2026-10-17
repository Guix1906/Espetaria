import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: {},
}));

import { useTableStore } from '../useTableStore';
import { useStockStore } from '../useStockStore';
import { useShiftStore } from '../useShiftStore';
import { syncService } from '../../lib/syncService';
import { INITIAL_TABLES, INITIAL_PRODUCTS } from '../../lib/mockData';
import type { Tab, Order, OrderItem, DailyPrepStock } from '../../types/domain';

describe('Sincronização em Tempo Real e Banco Compartilhado (Multi-dispositivos)', () => {
  beforeEach(() => {
    useTableStore.setState({
      tables: INITIAL_TABLES,
      tabs: [],
      orders: [],
      orderItems: [],
      payments: [],
    });

    useStockStore.setState({
      products: INITIAL_PRODUCTS,
      dailyPrepStock: [],
      stockMovements: [],
    });

    useShiftStore.setState({
      currentShift: null,
      shiftsHistory: [],
    });
  });

  it('1. Deve atualizar status da mesa ao receber atualização remota', () => {
    const tableStore = useTableStore.getState();
    const tableId = INITIAL_TABLES[0]!.id;

    tableStore.applyRemoteTableUpdate({
      id: tableId,
      number: 1,
      status: 'AGUARDANDO_CONTA',
    });

    const updatedTable = useTableStore.getState().tables.find((t) => t.id === tableId);
    expect(updatedTable?.status).toBe('AGUARDANDO_CONTA');
  });

  it('2. Deve sincronizar abertura de comanda (INSERT) e ocupar a mesa correspondente', () => {
    const tableStore = useTableStore.getState();
    const tableId = INITIAL_TABLES[2]!.id; // Mesa 3

    const remoteTab: Tab = {
      id: 'tab-remote-100',
      shift_id: 'shift-1',
      table_id: tableId,
      customer_name: 'Família Souza',
      people_count: 3,
      status: 'OPEN',
      opened_by: 'garcom-id',
      closed_by: null,
      subtotal: 0,
      service_fee: 0,
      discount: 0,
      total: 0,
      notes: null,
      opened_at: new Date().toISOString(),
      closed_at: null,
      updated_at: new Date().toISOString(),
      updated_by: null,
      version: 1,
    };

    tableStore.applyRemoteTabChange('INSERT', remoteTab);

    const state = useTableStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.id).toBe('tab-remote-100');

    const table = state.tables.find((t) => t.id === tableId);
    expect(table?.status).toBe('OCUPADA');
    expect(table?.current_tab?.id).toBe('tab-remote-100');
  });

  it('3. Deve sincronizar fechamento de comanda e liberar a mesa automaticamente', () => {
    const tableStore = useTableStore.getState();
    const tableId = INITIAL_TABLES[1]!.id; // Mesa 2

    const activeTab: Tab = {
      id: 'tab-remote-200',
      shift_id: 'shift-1',
      table_id: tableId,
      customer_name: 'Marcos',
      people_count: 2,
      status: 'OPEN',
      opened_by: 'garcom-id',
      closed_by: null,
      subtotal: 50,
      service_fee: 5,
      discount: 0,
      total: 55,
      notes: null,
      opened_at: new Date().toISOString(),
      closed_at: null,
      updated_at: new Date().toISOString(),
      updated_by: null,
      version: 1,
    };

    // Abre comanda
    tableStore.applyRemoteTabChange('INSERT', activeTab);
    expect(useTableStore.getState().tables.find((t) => t.id === tableId)?.status).toBe('OCUPADA');

    // Recebe fechamento via Caixa
    const closedTab: Tab = {
      ...activeTab,
      status: 'CLOSED',
      closed_by: 'caixa-id',
      closed_at: new Date().toISOString(),
    };

    tableStore.applyRemoteTabChange('UPDATE', closedTab);

    const state = useTableStore.getState();
    expect(state.tabs[0]?.status).toBe('CLOSED');
    const table = state.tables.find((t) => t.id === tableId);
    expect(table?.status).toBe('LIVRE');
    expect(table?.current_tab).toBeUndefined();
  });

  it('4. Deve sincronizar novos pedidos e itens de outros dispositivos no KDS e Garçom', () => {
    const tableStore = useTableStore.getState();

    const remoteOrder: Order = {
      id: 'ord-remote-300',
      shift_id: 'shift-1',
      tab_id: 'tab-1',
      table_id: 'table-1',
      order_number: 42,
      status: 'CONFIRMED',
      notes: 'Bem assado',
      idempotency_key: 'idem-300',
      created_by: 'garcom-phone',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: null,
      version: 1,
    };

    const remoteItem: OrderItem = {
      id: 'item-remote-301',
      order_id: 'ord-remote-300',
      shift_id: 'shift-1',
      product_id: 'prod-picanha',
      product_name: 'Espeto de Picanha Grill',
      unit_price: 24,
      quantity: 2,
      doneness: 'AO_PONTO',
      notes: null,
      sector: 'GRILL',
      status: 'RECEIVED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: null,
      version: 1,
      prepared_at: null,
      delivered_at: null,
    };

    tableStore.applyRemoteOrderChange('INSERT', remoteOrder);
    tableStore.applyRemoteOrderItemChange('INSERT', remoteItem);

    const state = useTableStore.getState();
    expect(state.orders).toHaveLength(1);
    expect(state.orders[0]?.order_number).toBe(42);
    expect(state.orderItems).toHaveLength(1);
    expect(state.orderItems[0]?.product_name).toBe('Espeto de Picanha Grill');
  });

  it('5. Quando item for marcado como READY pela churrasqueira, deve atualizar status e pedido pai', () => {
    const tableStore = useTableStore.getState();

    const remoteOrder: Order = {
      id: 'ord-400',
      shift_id: 'shift-1',
      tab_id: 'tab-1',
      table_id: 'table-1',
      order_number: 10,
      status: 'IN_PREPARATION',
      notes: null,
      idempotency_key: 'idem-400',
      created_by: 'garcom-id',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: null,
      version: 1,
    };

    const remoteItem: OrderItem = {
      id: 'item-401',
      order_id: 'ord-400',
      shift_id: 'shift-1',
      product_id: 'prod-fraldinha',
      product_name: 'Fraldinha na Mostarda',
      unit_price: 22,
      quantity: 1,
      doneness: 'BEM_PASSADA',
      notes: null,
      sector: 'GRILL',
      status: 'IN_PREPARATION',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: null,
      version: 1,
      prepared_at: null,
      delivered_at: null,
    };

    tableStore.applyRemoteOrderChange('INSERT', remoteOrder);
    tableStore.applyRemoteOrderItemChange('INSERT', remoteItem);

    // Churrasqueiro aperta botão Pronto no KDS
    const readyItem: OrderItem = {
      ...remoteItem,
      status: 'READY',
      prepared_at: new Date().toISOString(),
    };

    tableStore.applyRemoteOrderItemChange('UPDATE', readyItem);

    const state = useTableStore.getState();
    expect(state.orderItems[0]?.status).toBe('READY');
    expect(state.orders[0]?.status).toBe('READY');
  });

  it('6. Deve sincronizar esgotamento de estoque remoto e inativar disponibilidade no cardápio', () => {
    const stockStore = useStockStore.getState();
    const product = INITIAL_PRODUCTS[0]!;

    const remoteStock: DailyPrepStock = {
      id: 'stock-100',
      shift_id: 'shift-1',
      product_id: product.id,
      cubas_count: 0,
      portions_per_cuba: 1,
      initial_quantity: 30,
      current_quantity: 0,
      reserved_quantity: 0,
      consumed_quantity: 30,
      discarded_quantity: 0,
      adjusted_quantity: 0,
      last_counted_quantity: null,
      count_difference: null,
      is_exhausted: true,
      exhausted_at: new Date().toISOString(),
      exhausted_by: 'churrasqueiro-id',
      exhaust_reason: 'Acabou na brasa',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: null,
      version: 1,
    };

    stockStore.applyRemoteStockChange(remoteStock);

    const state = useStockStore.getState();
    const itemInStock = state.dailyPrepStock.find((s) => s.product_id === product.id);
    expect(itemInStock?.is_exhausted).toBe(true);
    expect(itemInStock?.current_quantity).toBe(0);

    const updatedProduct = state.products.find((p) => p.id === product.id);
    expect(updatedProduct?.available).toBe(false);
  });

  it('7. syncService deve lidar com ambiente sem Supabase configurado sem lançar erros', async () => {
    await expect(syncService.hydrateAll()).resolves.toBeUndefined();
    const unsubscribe = syncService.subscribeToDatabaseChanges();
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });
});
