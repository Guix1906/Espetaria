import { describe, expect, it, beforeEach } from 'vitest';
import { computeDashboard } from '../../admin/dashboardMetrics';
import { useTableStore } from '../../../stores/useTableStore';
import { useShiftStore } from '../../../stores/useShiftStore';
import type { Order, OrderItem, Payment, RestaurantTable, Tab } from '../../../types/domain';

const NOW = new Date('2026-11-01T12:00:00Z').getTime();
const ago = (min: number) => new Date(NOW - min * 60000).toISOString();

describe('Inteligência de Limpeza de Mesas e Espetos na Brasa', () => {
  beforeEach(() => {
    useTableStore.setState({
      tabs: [],
      orders: [],
      orderItems: [],
      payments: [],
      tables: [
        { id: 't1', number: 1, status: 'LIVRE', active: true, capacity: 4, version: 1, created_at: ago(120), updated_at: ago(120), updated_by: null } as RestaurantTable,
        { id: 't2', number: 2, status: 'LIVRE', active: true, capacity: 4, version: 1, created_at: ago(120), updated_at: ago(120), updated_by: null } as RestaurantTable,
      ],
    });
    useShiftStore.setState({ currentShift: null });
  });

  it('1. Quando todas as mesas estão livres, a produção na brasa e os alertas devem ser exatamente ZERO', () => {
    // Simula resíduos no banco de pedidos fechados
    const closedTab = {
      id: 'tab-1',
      table_id: 't1',
      shift_id: 's1',
      status: 'CLOSED',
      subtotal: 50,
      service_fee: 5,
      discount: 0,
      total: 55,
      people_count: 2,
      customer_name: 'Cliente Antigo',
      opened_at: ago(120),
      closed_at: ago(30),
      updated_at: ago(30),
      version: 2,
    } as Tab;

    const closedOrder = {
      id: 'ord-1',
      order_number: 1,
      shift_id: 's1',
      tab_id: 'tab-1',
      table_id: 't1',
      status: 'CLOSED',
      notes: null,
      created_at: ago(100),
      updated_at: ago(30),
      version: 2,
    } as Order;

    const staleOrderItem = {
      id: 'item-1',
      order_id: 'ord-1',
      product_id: 'p-alcatra',
      product_name: 'Espeto de Alcatra',
      unit_price: 25,
      quantity: 2,
      status: 'IN_PREPARATION', // Simula item órfão que ficou como IN_PREPARATION
      sector: 'GRILL',
      doneness: 'AO_PONTO',
      notes: null,
      created_at: ago(100),
      updated_at: ago(100),
      version: 1,
    } as OrderItem;

    const d = computeDashboard({
      shiftId: 's1',
      tables: [
        { id: 't1', number: 1, status: 'LIVRE', active: true, capacity: 4, version: 1, created_at: ago(120), updated_at: ago(30), updated_by: null } as RestaurantTable,
      ],
      tabs: [closedTab],
      orders: [closedOrder],
      orderItems: [staleOrderItem],
      payments: [{ id: 'pay-1', tab_id: 'tab-1', shift_id: 's1', amount: 55, method: 'PIX', status: 'PAID', paid_at: ago(30), updated_at: ago(30), version: 1, external_reference: null, notes: null, received_by: 'u1' } as Payment],
      deliveryOrders: [],
      stockMovements: [],
      jobs: [],
      printerMonitored: false,
      now: NOW,
    });

    // Como a mesa foi limpa e a comanda está fechada:
    // NENHUM espeto pode constar na brasa
    expect(d.production.GRILL.salon).toBe(0);
    expect(d.productionTotal).toBe(0);
    // Nenhum alerta de espeto na brasa há muito tempo
    expect(d.alerts.some((a) => a.id === 'grill')).toBe(false);
    expect(d.alerts.some((a) => a.id === 'ready')).toBe(false);
  });

  it('2. Conta na brasa somente espetos de mesas e comandas abertas em atendimento', () => {
    const openTab = {
      id: 'tab-active',
      table_id: 't1',
      shift_id: 's1',
      status: 'OPEN',
      subtotal: 50,
      service_fee: 5,
      discount: 0,
      total: 55,
      people_count: 2,
      customer_name: 'Mesa 01',
      opened_at: ago(10),
      closed_at: null,
      updated_at: ago(10),
      version: 1,
    } as Tab;

    const activeOrder = {
      id: 'ord-active',
      order_number: 10,
      shift_id: 's1',
      tab_id: 'tab-active',
      table_id: 't1',
      status: 'IN_PREPARATION',
      notes: null,
      created_at: ago(5),
      updated_at: ago(5),
      version: 1,
    } as Order;

    const activeItem = {
      id: 'item-active',
      order_id: 'ord-active',
      product_id: 'p-frango',
      product_name: 'Espeto de Frango',
      unit_price: 20,
      quantity: 3,
      status: 'IN_PREPARATION',
      sector: 'GRILL',
      doneness: null,
      notes: null,
      created_at: ago(5),
      updated_at: ago(5),
      version: 1,
    } as OrderItem;

    const d = computeDashboard({
      shiftId: 's1',
      tables: [
        { id: 't1', number: 1, status: 'OCUPADA', active: true, capacity: 4, version: 1, created_at: ago(10), updated_at: ago(10), updated_by: null } as RestaurantTable,
      ],
      tabs: [openTab],
      orders: [activeOrder],
      orderItems: [activeItem],
      payments: [],
      deliveryOrders: [],
      stockMovements: [],
      jobs: [],
      printerMonitored: false,
      now: NOW,
    });

    // Quando a mesa está realmente aberta com pedido, contabiliza corretamente
    expect(d.production.GRILL.salon).toBe(3);
    expect(d.productionTotal).toBe(3);
  });

  it('3. applyRemoteTabChange cascateia encerramento para orders e orderItems locais', () => {
    const tableId = 't1';
    const tabId = 'tab-sync';
    const orderId = 'ord-sync';

    useTableStore.setState({
      tables: [{ id: tableId, number: 1, status: 'OCUPADA', active: true, capacity: 4, version: 1, created_at: ago(20), updated_at: ago(20), updated_by: null } as RestaurantTable],
      tabs: [{ id: tabId, table_id: tableId, shift_id: 's1', status: 'OPEN', subtotal: 30, service_fee: 3, discount: 0, total: 33, people_count: 2, customer_name: 'Cliente', opened_at: ago(20), closed_at: null, updated_at: ago(20), version: 1 } as Tab],
      orders: [{ id: orderId, order_number: 1, shift_id: 's1', tab_id: tabId, table_id: tableId, status: 'IN_PREPARATION', notes: null, created_at: ago(15), updated_at: ago(15), version: 1 } as Order],
      orderItems: [{ id: 'oi-1', order_id: orderId, product_id: 'p1', product_name: 'Carne', unit_price: 30, quantity: 2, status: 'IN_PREPARATION', sector: 'GRILL', doneness: 'AO_PONTO', notes: null, created_at: ago(15), updated_at: ago(15), version: 1 } as OrderItem],
    });

    // Outro aparelho encerra a comanda
    useTableStore.getState().applyRemoteTabChange('UPDATE', {
      id: tabId,
      table_id: tableId,
      shift_id: 's1',
      status: 'CLOSED',
      subtotal: 30,
      service_fee: 3,
      discount: 0,
      total: 33,
      people_count: 2,
      customer_name: 'Cliente',
      opened_at: ago(20),
      closed_at: ago(1),
      updated_at: ago(1),
      version: 2,
    } as Tab);

    const state = useTableStore.getState();
    // Mesa volta a ser LIVRE
    expect(state.tables.find((t) => t.id === tableId)?.status).toBe('LIVRE');
    // Pedido é marcado como CLOSED
    expect(state.orders.find((o) => o.id === orderId)?.status).toBe('CLOSED');
    // Itens são marcados como DELIVERED (não ficam mais "na brasa")
    expect(state.orderItems.find((i) => i.id === 'oi-1')?.status).toBe('DELIVERED');
  });
});
