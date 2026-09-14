import { create } from 'zustand';
import { RestaurantTable, Tab, Order, OrderItem, Payment } from '../types/domain';
import { MeatDoneness, OrderItemStatus, ProductionSector, PaymentMethod } from '../types/enums';
import { INITIAL_TABLES } from '../lib/mockData';
import { generateId } from '../lib/utils';
import { useStockStore } from './useStockStore';
import { realtimeService } from '../lib/realtime';
import { audioService } from '../lib/audio';
import { logger } from '../lib/logger';

interface OrderItemInput {
  productId: string;
  quantity: number;
  doneness?: MeatDoneness | null;
  notes?: string;
}

interface TableState {
  tables: RestaurantTable[];
  tabs: Tab[];
  orders: Order[];
  orderItems: OrderItem[];
  payments: Payment[];

  // Ações de Negócio
  openTab: (
    tableId: string,
    customerName: string,
    peopleCount: number,
    notes: string,
    userId: string,
    shiftId: string
  ) => Tab;
  addOrderAtomic: (
    shiftId: string,
    tabId: string,
    items: OrderItemInput[],
    userId: string,
    notes?: string
  ) => Order;
  cancelOrderItemAtomic: (
    orderItemId: string,
    reason: string,
    userId: string,
    shiftId: string
  ) => void;
  updateOrderItemStatus: (orderItemId: string, status: OrderItemStatus) => void;
  updateOrderSectorItemsStatus: (orderId: string, sector: ProductionSector, status: OrderItemStatus) => void;
  markDelivered: (orderItemId: string) => void;
  requestBill: (tableId: string) => void;
  updateTabBillAdjustments: (tabId: string, options: { includeServiceFee: boolean; discountAmount?: number }) => void;
  addPaymentAtomic: (shiftId: string, tabId: string, amount: number, method: PaymentMethod, receivedBy: string, notes?: string) => Payment;
  removePayment: (paymentId: string) => void;
  getTabPayments: (tabId: string) => Payment[];
  closeTabAtomic: (shiftId: string, tabId: string, userId: string) => { tab: Tab; payments: Payment[]; items: OrderItem[] };
  reopenTabAtomic: (tabId: string, userId: string, reason: string) => void;
  getTabByTableId: (tableId: string) => Tab | undefined;
  getTabOrderItems: (tabId: string) => OrderItem[];
}

export const useTableStore = create<TableState>((set, get) => ({
  tables: INITIAL_TABLES,
  tabs: [],
  orders: [],
  orderItems: [],
  payments: [],

  openTab: (tableId, customerName, peopleCount, notes, userId, shiftId) => {
    const table = get().tables.find((t) => t.id === tableId);
    if (!table) throw new Error('Mesa não encontrada.');

    // Verifica se a mesa já tem comanda aberta
    const existingTab = get().tabs.find((tab) => tab.table_id === tableId && tab.status === 'OPEN');
    if (existingTab) throw new Error(`A Mesa ${table.number} já possui uma comanda aberta.`);

    const newTab: Tab = {
      id: generateId(),
      shift_id: shiftId,
      table_id: tableId,
      customer_name: customerName || `Mesa ${table.number}`,
      people_count: Math.max(1, peopleCount || 1),
      status: 'OPEN',
      opened_by: userId,
      closed_by: null,
      subtotal: 0,
      service_fee: 0,
      discount: 0,
      total: 0,
      notes: notes || null,
      opened_at: new Date().toISOString(),
      closed_at: null,
    };

    set({
      tabs: [newTab, ...get().tabs],
      tables: get().tables.map((t) => (t.id === tableId ? { ...t, status: 'OCUPADA', current_tab: newTab } : t)),
    });

    logger.info({
      context: 'TableStore',
      message: `Comanda aberta na Mesa ${table.number} (${newTab.customer_name})`
    });

    return newTab;
  },

  addOrderAtomic: (shiftId, tabId, items, userId, notes) => {
    const tab = get().tabs.find((t) => t.id === tabId && t.status === 'OPEN');
    if (!tab) throw new Error('Comanda não encontrada ou já encerrada.');

    const table = get().tables.find((t) => t.id === tab.table_id);
    if (!table) throw new Error('Mesa associada não encontrada.');

    const products = useStockStore.getState().products;

    // Prepara itens validados
    const itemsToConsume = items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
    }));

    const orderId = generateId();

    // EXECUTA BAIXA ATÔMICA NO ESTOQUE (Se faltar 1 item, falha tudo e não cria pedido!)
    useStockStore.getState().consumeStockAtomic(shiftId, itemsToConsume, userId, orderId);

    // Cria os OrderItems
    let orderSubtotal = 0;
    const newItems: OrderItem[] = items.map((i) => {
      const prod = products.find((p) => p.id === i.productId)!;
      orderSubtotal += prod.price * i.quantity;

      return {
        id: generateId(),
        order_id: orderId,
        shift_id: shiftId,
        product_id: prod.id,
        product_name: prod.name,
        unit_price: prod.price,
        quantity: i.quantity,
        doneness: i.doneness ?? null,
        notes: i.notes ?? null,
        sector: prod.sector,
        status: 'RECEIVED',
        created_at: new Date().toISOString(),
        prepared_at: null,
        delivered_at: null,
      };
    });

    const newOrder: Order = {
      id: orderId,
      shift_id: shiftId,
      tab_id: tabId,
      table_id: table.id,
      order_number: get().orders.length + 1,
      status: 'CONFIRMED',
      notes: notes ?? null,
      idempotency_key: generateId(),
      created_by: userId,
      created_at: new Date().toISOString(),
      items: newItems,
    };

    // Atualiza saldo da comanda
    const newSubtotal = tab.subtotal + orderSubtotal;
    const newServiceFee = Math.round(newSubtotal * 0.1 * 100) / 100; // 10%
    const newTotal = newSubtotal + newServiceFee - tab.discount;

    const updatedTab: Tab = {
      ...tab,
      subtotal: newSubtotal,
      service_fee: newServiceFee,
      total: newTotal,
    };

    set({
      orders: [newOrder, ...get().orders],
      orderItems: [...newItems, ...get().orderItems],
      tabs: get().tabs.map((t) => (t.id === tabId ? updatedTab : t)),
    });

    // Transmite via WebSocket para o KDS da Churrasqueira e Cozinha
    const grillItems = newItems.filter((i) => i.sector === 'GRILL');
    if (grillItems.length > 0) {
      realtimeService.broadcastNewOrder({
        order_id: newOrder.id,
        tab_id: tabId,
        table_number: table.number,
        sector: 'GRILL',
        items: grillItems.map((i) => ({
          product_name: i.product_name,
          quantity: i.quantity,
          doneness: i.doneness,
          notes: i.notes,
        })),
      });
    }

    const kitchenItems = newItems.filter((i) => i.sector === 'KITCHEN');
    if (kitchenItems.length > 0) {
      realtimeService.broadcastNewOrder({
        order_id: newOrder.id,
        tab_id: tabId,
        table_number: table.number,
        sector: 'KITCHEN',
        items: kitchenItems.map((i) => ({
          product_name: i.product_name,
          quantity: i.quantity,
          doneness: null,
          notes: i.notes,
        })),
      });
    }

    const barItems = newItems.filter((i) => i.sector === 'BAR');
    if (barItems.length > 0) {
      realtimeService.broadcastNewOrder({
        order_id: newOrder.id,
        tab_id: tabId,
        table_number: table.number,
        sector: 'BAR',
        items: barItems.map((i) => ({
          product_name: i.product_name,
          quantity: i.quantity,
          doneness: null,
          notes: i.notes,
        })),
      });
    }

    logger.info({
      context: 'TableStore',
      message: `Pedido #${newOrder.order_number} lançado na Mesa ${table.number} com ${newItems.length} itens.`
    });

    return newOrder;
  },

  cancelOrderItemAtomic: (orderItemId, reason, userId, shiftId) => {
    const item = get().orderItems.find((i) => i.id === orderItemId);
    if (!item) throw new Error('Item não encontrado.');
    if (item.status === 'CANCELLED') throw new Error('Item já cancelado.');

    // Executa cancelamento com regra condicional de devolução
    useStockStore
      .getState()
      .cancelOrderItemStockAtomic(
        shiftId,
        item.product_id,
        item.quantity,
        item.status,
        userId,
        orderItemId,
        reason
      );

    const updatedItems = get().orderItems.map((i) =>
      i.id === orderItemId ? { ...i, status: 'CANCELLED' as const } : i
    );

    // Recalcula totais da comanda
    const order = get().orders.find((o) => o.id === item.order_id);
    if (order) {
      const tab = get().tabs.find((t) => t.id === order.tab_id);
      if (tab) {
        const itemDeduction = item.unit_price * item.quantity;
        const newSubtotal = Math.max(0, tab.subtotal - itemDeduction);
        const newServiceFee = Math.round(newSubtotal * 0.1 * 100) / 100;
        const newTotal = Math.max(0, newSubtotal + newServiceFee - tab.discount);

        set({
          orderItems: updatedItems,
          tabs: get().tabs.map((t) =>
            t.id === tab.id ? { ...t, subtotal: newSubtotal, service_fee: newServiceFee, total: newTotal } : t
          ),
        });
        return;
      }
    }

    set({ orderItems: updatedItems });
  },

  updateOrderItemStatus: (orderItemId, status) => {
    const item = get().orderItems.find((i) => i.id === orderItemId);
    if (!item) return;

    const now = new Date().toISOString();
    const updatedItem: OrderItem = {
      ...item,
      status,
      prepared_at: status === 'READY' ? now : item.prepared_at,
      delivered_at: status === 'DELIVERED' ? now : item.delivered_at,
    };

    const newOrderItems = get().orderItems.map((i) => (i.id === orderItemId ? updatedItem : i));

    // Recalcula status do pedido pai
    const order = get().orders.find((o) => o.id === item.order_id);
    let newOrders = get().orders;
    if (order) {
      const siblings = newOrderItems.filter((i) => i.order_id === order.id && i.status !== 'CANCELLED');
      let newOrderStatus = order.status;
      if (siblings.length > 0) {
        const allDelivered = siblings.every((i) => i.status === 'DELIVERED');
        const allReadyOrDelivered = siblings.every((i) => i.status === 'READY' || i.status === 'DELIVERED');
        const anyInPrep = siblings.some((i) => i.status === 'IN_PREPARATION' || i.status === 'READY');

        if (allDelivered) {
          newOrderStatus = 'DELIVERED';
        } else if (allReadyOrDelivered) {
          newOrderStatus = 'READY';
        } else if (anyInPrep) {
          newOrderStatus = 'IN_PREPARATION';
        }
      }
      newOrders = get().orders.map((o) => (o.id === order.id ? { ...o, status: newOrderStatus } : o));
    }

    set({
      orderItems: newOrderItems,
      orders: newOrders,
    });

    if (status === 'READY') {
      const table = get().tables.find((t) => t.id === order?.table_id);
      const tableNum = table ? table.number : 0;
      realtimeService.broadcastOrderReady({
        order_id: item.order_id,
        order_item_id: item.id,
        table_number: tableNum,
        product_name: item.product_name,
        quantity: item.quantity,
        sector: item.sector,
        timestamp: now,
      });
      audioService.playOrderReadySound();

      logger.info({
        context: 'TableStore',
        message: `Item #${item.id} (${item.product_name}) marcado como PRONTO para Mesa ${tableNum}.`,
      });
    }
  },

  updateOrderSectorItemsStatus: (orderId, sector, status) => {
    const targetItems = get().orderItems.filter(
      (i) => i.order_id === orderId && i.sector === sector && i.status !== 'CANCELLED' && i.status !== 'DELIVERED'
    );
    targetItems.forEach((item) => {
      get().updateOrderItemStatus(item.id, status);
    });
  },

  markDelivered: (orderItemId) => {
    get().updateOrderItemStatus(orderItemId, 'DELIVERED');
  },

  requestBill: (tableId) => {
    const table = get().tables.find((t) => t.id === tableId);
    if (!table) return;

    set({
      tables: get().tables.map((t) =>
        t.id === tableId ? { ...t, status: 'AGUARDANDO_CONTA' as const } : t
      ),
    });

    logger.info({
      context: 'TableStore',
      message: `Mesa ${table.number} solicitou a conta ao caixa.`,
    });
  },

  updateTabBillAdjustments: (tabId, options) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) throw new Error('Comanda não encontrada.');

    const subtotal = tab.subtotal;
    const serviceFee = options.includeServiceFee ? Math.round(subtotal * 0.1 * 100) / 100 : 0;
    const discount = Math.max(0, Math.min(subtotal + serviceFee, options.discountAmount ?? tab.discount));
    const total = Math.max(0, subtotal + serviceFee - discount);

    const updatedTab: Tab = {
      ...tab,
      service_fee: serviceFee,
      discount,
      total,
    };

    set({
      tabs: get().tabs.map((t) => (t.id === tabId ? updatedTab : t)),
    });

    logger.info({
      context: 'TableStore',
      message: `Ajuste de conta na comanda ${tabId}: Serviço 10% = ${options.includeServiceFee ? 'SIM' : 'NÃO'}, Desconto = R$ ${discount.toFixed(2)}, Novo Total = R$ ${total.toFixed(2)}.`,
    });
  },

  addPaymentAtomic: (shiftId, tabId, amount, method, receivedBy, notes) => {
    if (amount <= 0) throw new Error('O valor do pagamento deve ser maior que zero.');

    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) throw new Error('Comanda não encontrada.');
    if (tab.status === 'CLOSED') throw new Error('Comanda já encerrada.');

    const newPayment: Payment = {
      id: generateId(),
      shift_id: shiftId,
      tab_id: tabId,
      amount: Math.round(amount * 100) / 100,
      method,
      status: 'PAID',
      external_reference: null,
      notes: notes ?? null,
      received_by: receivedBy,
      paid_at: new Date().toISOString(),
    };

    set({
      payments: [...get().payments, newPayment],
    });

    logger.info({
      context: 'TableStore',
      message: `Pagamento de R$ ${amount.toFixed(2)} (${method}) registrado na comanda ${tabId}.`,
    });

    return newPayment;
  },

  removePayment: (paymentId) => {
    const payment = get().payments.find((p) => p.id === paymentId);
    if (!payment) return;

    const tab = get().tabs.find((t) => t.id === payment.tab_id);
    if (tab && tab.status === 'CLOSED') {
      throw new Error('Não é possível remover pagamento de uma comanda já fechada.');
    }

    set({
      payments: get().payments.filter((p) => p.id !== paymentId),
    });

    logger.info({
      context: 'TableStore',
      message: `Pagamento #${paymentId} de R$ ${payment.amount.toFixed(2)} removido.`,
    });
  },

  getTabPayments: (tabId) => {
    return get().payments.filter((p) => p.tab_id === tabId && p.status === 'PAID');
  },

  closeTabAtomic: (_shiftId, tabId, userId) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) throw new Error('Comanda não encontrada.');
    if (tab.status === 'CLOSED') throw new Error('Esta comanda já foi encerrada anteriormente.');

    const tabPayments = get().payments.filter((p) => p.tab_id === tabId && p.status === 'PAID');
    const totalPaid = tabPayments.reduce((sum, p) => sum + p.amount, 0);

    // Validação estrita: total pago deve ser maior ou igual ao total devido (tolerância 0.01 por centavos)
    if (totalPaid < tab.total - 0.01) {
      const missing = tab.total - totalPaid;
      throw new Error(
        `Pagamento insuficiente. Total devido: R$ ${tab.total.toFixed(2)}, Total pago: R$ ${totalPaid.toFixed(2)}. Faltam R$ ${missing.toFixed(2)}.`
      );
    }

    const now = new Date().toISOString();
    const updatedTab: Tab = {
      ...tab,
      status: 'CLOSED',
      closed_by: userId,
      closed_at: now,
    };

    // Atualiza comanda, desocupa mesa e fecha pedidos da comanda
    const table = get().tables.find((t) => t.id === tab.table_id);
    const updatedTables = get().tables.map((t) =>
      t.id === tab.table_id ? { ...t, status: 'LIVRE' as const, current_tab: undefined } : t
    );

    const updatedOrders = get().orders.map((o) =>
      o.tab_id === tabId ? { ...o, status: 'CLOSED' as const } : o
    );

    set({
      tabs: get().tabs.map((t) => (t.id === tabId ? updatedTab : t)),
      tables: updatedTables,
      orders: updatedOrders,
    });

    const items = get().getTabOrderItems(tabId);

    logger.info({
      context: 'TableStore',
      message: `Comanda da Mesa ${table?.number ?? '??'} encerrada com sucesso pelo Caixa. Total: R$ ${tab.total.toFixed(2)}, Pago: R$ ${totalPaid.toFixed(2)}.`,
    });

    return {
      tab: updatedTab,
      payments: tabPayments,
      items,
    };
  },

  reopenTabAtomic: (tabId, userId, reason) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) throw new Error('Comanda não encontrada.');
    if (tab.status !== 'CLOSED') throw new Error('Apenas comandas fechadas podem ser reabertas.');

    const updatedTab: Tab = {
      ...tab,
      status: 'OPEN',
      closed_by: null,
      closed_at: null,
    };

    const table = get().tables.find((t) => t.id === tab.table_id);
    const updatedTables = get().tables.map((t) =>
      t.id === tab.table_id ? { ...t, status: 'OCUPADA' as const, current_tab: updatedTab } : t
    );

    set({
      tabs: get().tabs.map((t) => (t.id === tabId ? updatedTab : t)),
      tables: updatedTables,
    });

    logger.warn({
      context: 'TableStore',
      message: `Comanda da Mesa ${table?.number} reaberta por ${userId}. Motivo: ${reason}`,
    });
  },

  getTabByTableId: (tableId) => {
    return get().tabs.find((t) => t.table_id === tableId && t.status === 'OPEN');
  },

  getTabOrderItems: (tabId) => {
    const tabOrders = get().orders.filter((o) => o.tab_id === tabId);
    const orderIds = new Set(tabOrders.map((o) => o.id));
    return get().orderItems.filter((i) => orderIds.has(i.order_id));
  },
}));
