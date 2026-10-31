import { create } from 'zustand';
import { RestaurantTable, Tab, Order, OrderItem, Payment } from '../types/domain';
import { MeatDoneness, OrderItemStatus, ProductionSector, PaymentMethod } from '../types/enums';
import { INITIAL_TABLES } from '../lib/mockData';
import { generateId } from '../lib/utils';
import { useStockStore } from './useStockStore';
import { realtimeService } from '../lib/realtime';
import { audioService } from '../lib/audio';
import { logger } from '../lib/logger';
import { usePrintStore } from './usePrintStore';
import { callRpc } from '../lib/remote';
import { isSupabaseConfigured } from '../lib/supabase';
import { computeTabTotals, fromCents, sumMoney, toCents } from '../lib/utils';
import { useAuthStore } from './useAuthStore';

/**
 * Decide se um evento remoto deve ser descartado por ser mais antigo que o
 * estado local. Usa o contador `version` (incrementado pelo banco a cada
 * UPDATE) em vez de relógios, que diferem entre aparelhos.
 */
function isStaleRemote(local: { version?: number } | undefined, remote: { version?: number }): boolean {
  if (!local || local.version == null || remote.version == null) return false;
  return local.version > remote.version;
}

/**
 * Status usado na baixa de estoque do cancelamento (mesma regra do banco):
 * pronto/entregue nunca volta; antes disso vale a escolha de quem cancela
 * e, sem escolha, só volta o que ainda não entrou em preparo.
 */
export function stockStatusForCancel(status: OrderItemStatus, returnStock?: boolean): OrderItemStatus {
  const notReady = status === 'RECEIVED' || status === 'IN_PREPARATION';
  const shouldReturn = notReady && (returnStock ?? status === 'RECEIVED');
  if (shouldReturn) return 'RECEIVED';
  return status === 'RECEIVED' ? 'IN_PREPARATION' : status;
}

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
  conflictWarning?: string;

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
  /** returnStock: devolve ao estoque (só vale antes de ficar pronto). Sem valor, segue a regra padrão. */
  cancelOrderItemAtomic: (
    orderItemId: string,
    reason: string,
    userId: string,
    shiftId: string,
    returnStock?: boolean
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
  quickCloseTabAtomic: (
    shiftId: string,
    tabId: string,
    amount: number,
    method: PaymentMethod,
    userId: string,
    notes?: string
  ) => { tab: Tab; payments: Payment[]; items: OrderItem[] };
  reopenTabAtomic: (tabId: string, userId: string, reason: string) => void;
  /** Anula a comanda inteira (lançamento de teste/engano): cancela itens, estorna pagamentos e libera a mesa. */
  voidTabAtomic: (tabId: string, reason: string, userId: string, returnStock?: boolean) => void;
  /** Garçom libera mesa aberta por engano: só comanda sem itens e sem pagamento (fica na auditoria). */
  releaseEmptyTab: (tabId: string, userId: string) => void;
  getTabByTableId: (tableId: string) => Tab | undefined;
  getTabOrderItems: (tabId: string) => OrderItem[];

  // Sincronização em Tempo Real (Multi-dispositivos)
  applyRemoteTableUpdate: (tableData: Partial<RestaurantTable> & { id: string; number?: number }) => void;
  applyRemoteTabChange: (eventType: 'INSERT' | 'UPDATE' | 'DELETE', tabData: Tab) => void;
  applyRemoteOrderChange: (eventType: 'INSERT' | 'UPDATE' | 'DELETE', orderData: Order) => void;
  applyRemoteOrderItemChange: (eventType: 'INSERT' | 'UPDATE' | 'DELETE', itemData: OrderItem) => void;
  applyRemotePaymentChange: (eventType: 'INSERT' | 'UPDATE' | 'DELETE', paymentData: Payment) => void;
}

export const useTableStore = create<TableState>((set, get) => ({
  tables: INITIAL_TABLES,
  tabs: [],
  orders: [],
  orderItems: [],
  payments: [],
  conflictWarning: undefined,

  openTab: (tableId, customerName, peopleCount, notes, userId, shiftId) => {
    const table = get().tables.find((t) => t.id === tableId);
    if (!table) throw new Error('Mesa não encontrada.');

    // Verifica se a mesa já tem comanda aberta
    const existingTab = get().tabs.find((tab) => tab.table_id === tableId && tab.status === 'OPEN');
    if (existingTab) throw new Error(`A Mesa ${table.number} já possui uma comanda aberta.`);

    const now = new Date().toISOString();
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
      service_fee_enabled: true,
      discount: 0,
      total: 0,
      notes: notes || null,
      opened_at: now,
      closed_at: null,
      updated_at: now,
      updated_by: userId,
      version: 1,
    };

    set({
      tabs: [newTab, ...get().tabs],
      tables: get().tables.map((t) => (t.id === tableId ? { ...t, status: 'OCUPADA', current_tab: newTab } : t)),
    });

    void callRpc('open_tab_atomic', {
      p_tab_id: newTab.id,
      p_shift_id: shiftId,
      p_table_id: tableId,
      p_customer_name: newTab.customer_name,
      p_people_count: newTab.people_count,
      p_notes: newTab.notes,
    }, 'TableStore');

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

    const now = new Date().toISOString();
    const orderId = generateId();

    // EXECUTA BAIXA ATÔMICA NO ESTOQUE (Se faltar 1 item, falha tudo e não cria pedido!)
    useStockStore.getState().consumeStockAtomic(shiftId, itemsToConsume, userId, orderId);

    // Cria os OrderItems
    let orderSubtotalCents = 0;
    const newItems: OrderItem[] = items.map((i) => {
      const prod = products.find((p) => p.id === i.productId)!;
      orderSubtotalCents += toCents(prod.price) * i.quantity;

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
        sector: /suco|refresco|jarra/i.test(prod.name) ? 'KITCHEN' : prod.sector,
        // Espeto enviado já está "Na brasa": o churrasqueiro não precisa aceitar (igual ao banco)
        // Bebida da mesa (exceto sucos que exigem preparo): o garçom pega e leva na hora, já nasce entregue
        status: prod.sector === 'GRILL' ? 'IN_PREPARATION' : ((prod.sector === 'BAR' || prod.type === 'BEBIDA') && !/suco|refresco|jarra/i.test(prod.name)) ? 'DELIVERED' : 'RECEIVED',
        created_at: now,
        prepared_at: null,
        delivered_at: ((prod.sector === 'BAR' || prod.type === 'BEBIDA') && !/suco|refresco|jarra/i.test(prod.name)) ? now : null,
        updated_at: now,
        updated_by: userId,
        version: 1,
      };
    });

    const newOrder: Order = {
      id: orderId,
      shift_id: shiftId,
      tab_id: tabId,
      table_id: table.id,
      // Número provisório; o definitivo vem da sequência do banco (retorno da RPC)
      order_number: get().orders.reduce((max, o) => Math.max(max, o.order_number), 0) + 1,
      status: newItems.some((i) => i.status === 'IN_PREPARATION') ? 'IN_PREPARATION' : 'CONFIRMED',
      notes: notes ?? null,
      idempotency_key: generateId(),
      created_by: userId,
      created_at: now,
      updated_at: now,
      updated_by: userId,
      version: 1,
      items: newItems,
    };

    // Atualiza saldo da comanda
    const totals = computeTabTotals(
      fromCents(toCents(tab.subtotal) + orderSubtotalCents),
      tab.service_fee_enabled !== false,
      tab.discount
    );

    const updatedTab: Tab = {
      ...tab,
      ...totals,
      updated_at: now,
      updated_by: userId,
      version: (tab.version || 0) + 1,
    };

    set({
      orders: [newOrder, ...get().orders],
      orderItems: [...newItems, ...get().orderItems],
      tabs: get().tabs.map((t) => (t.id === tabId ? updatedTab : t)),
    });

    // Transação única no banco: pedido + itens + baixa de estoque com lock + totais
    void callRpc<{ order_id: string; order_number: number }>('create_order_atomic', {
      p_order_id: newOrder.id,
      p_shift_id: shiftId,
      p_tab_id: tabId,
      p_items: newItems.map((item) => ({
        id: item.id,
        product_id: item.product_id,
        quantity: item.quantity,
        doneness: item.doneness,
        notes: item.notes,
      })),
      p_idempotency_key: newOrder.idempotency_key,
      p_notes: newOrder.notes,
    }, 'TableStore').then((result) => {
      if (result && result.order_number !== newOrder.order_number) {
        set({
          orders: get().orders.map((o) => (o.id === result.order_id ? { ...o, order_number: result.order_number } : o)),
        });
      }
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

    // ENFILEIRA IMPRESSÃO AUTOMÁTICA SETORIZADA (Churrasqueira, Cozinha, Bar)
    const printStore = usePrintStore.getState();
    if (grillItems.length > 0) {
      printStore.enqueuePrintJob({
        order_id: newOrder.id,
        order_number: newOrder.order_number,
        sector: 'GRILL',
        origin: 'SALAO',
        table_number: table.number,
        customer_name: tab.customer_name || undefined,
        items: grillItems.map((i) => ({
          name: i.product_name,
          quantity: i.quantity,
          doneness: i.doneness,
          notes: i.notes,
        })),
      });
    }

    if (kitchenItems.length > 0) {
      printStore.enqueuePrintJob({
        order_id: newOrder.id,
        order_number: newOrder.order_number,
        sector: 'KITCHEN',
        origin: 'SALAO',
        table_number: table.number,
        customer_name: tab.customer_name || undefined,
        items: kitchenItems.map((i) => ({
          name: i.product_name,
          quantity: i.quantity,
          doneness: null,
          notes: i.notes,
        })),
      });
    }

    if (barItems.length > 0) {
      printStore.enqueuePrintJob({
        order_id: newOrder.id,
        order_number: newOrder.order_number,
        sector: 'BAR',
        origin: 'SALAO',
        table_number: table.number,
        customer_name: tab.customer_name || undefined,
        items: barItems.map((i) => ({
          name: i.product_name,
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

  cancelOrderItemAtomic: (orderItemId, reason, userId, shiftId, returnStock) => {
    const currentRole = useAuthStore.getState().currentProfile?.role;
    if (currentRole === 'GARCOM') {
      throw new Error('Garçom não tem permissão para cancelar ou excluir itens da comanda.');
    }
    const item = get().orderItems.find((i) => i.id === orderItemId);
    if (!item) throw new Error('Item não encontrado.');
    if (item.status === 'CANCELLED') throw new Error('Item já cancelado.');

    const now = new Date().toISOString();

    // Executa cancelamento com regra condicional de devolução
    useStockStore
      .getState()
      .cancelOrderItemStockAtomic(
        shiftId,
        item.product_id,
        item.quantity,
        stockStatusForCancel(item.status, returnStock),
        userId,
        orderItemId,
        reason
      );

    const updatedItems = get().orderItems.map((i) =>
      i.id === orderItemId ? { ...i, status: 'CANCELLED' as const, updated_at: now, updated_by: userId, version: (i.version || 0) + 1 } : i
    );

    // Recalcula totais da comanda
    const order = get().orders.find((o) => o.id === item.order_id);
    void callRpc('cancel_order_item_atomic', { p_order_item_id: orderItemId, p_reason: reason, ...(returnStock === undefined ? {} : { p_return_stock: returnStock }) }, 'TableStore');

    if (order) {
      const tab = get().tabs.find((t) => t.id === order.tab_id);
      if (tab) {
        const deductionCents = toCents(item.unit_price) * item.quantity;
        const totals = computeTabTotals(
          fromCents(Math.max(0, toCents(tab.subtotal) - deductionCents)),
          tab.service_fee_enabled !== false,
          tab.discount
        );

        set({
          orderItems: updatedItems,
          tabs: get().tabs.map((t) =>
            t.id === tab.id ? { ...t, ...totals, updated_at: now, updated_by: userId, version: (t.version || 0) + 1 } : t
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
      updated_at: now,
      updated_by: item.updated_by,
      version: (item.version || 0) + 1,
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

    // Controle otimista de concorrência: o banco recusa se a versão mudou em outro aparelho
    void callRpc('update_order_item_status', {
      p_order_item_id: orderItemId,
      p_status: status,
      p_expected_version: item.version || null,
    }, 'TableStore');

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

    const now = new Date().toISOString();

    set({
      tables: get().tables.map((t) =>
        t.id === tableId ? { ...t, status: 'AGUARDANDO_CONTA' as const, updated_at: now, updated_by: table.updated_by, version: (t.version || 0) + 1 } : t
      ),
    });

    void callRpc('request_bill', { p_table_id: tableId }, 'TableStore');

    logger.info({
      context: 'TableStore',
      message: `Mesa ${table.number} solicitou a conta ao caixa.`,
    });
  },

  updateTabBillAdjustments: (tabId, options) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) throw new Error('Comanda não encontrada.');

    const now = new Date().toISOString();
    const { service_fee: serviceFee, discount, total } = computeTabTotals(
      tab.subtotal,
      options.includeServiceFee,
      options.discountAmount ?? tab.discount
    );

    const updatedTab: Tab = {
      ...tab,
      service_fee: serviceFee,
      service_fee_enabled: options.includeServiceFee,
      discount,
      total,
      updated_at: now,
      updated_by: tab.updated_by,
      version: (tab.version || 0) + 1,
    };

    set({
      tabs: get().tabs.map((t) => (t.id === tabId ? updatedTab : t)),
    });

    void callRpc('update_tab_adjustments', {
      p_tab_id: tabId,
      p_service_fee_enabled: options.includeServiceFee,
      p_discount: discount,
    }, 'TableStore');

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

    const now = new Date().toISOString();
    const newPayment: Payment = {
      id: generateId(),
      shift_id: shiftId,
      tab_id: tabId,
      amount: fromCents(toCents(amount)),
      method,
      status: 'PAID',
      external_reference: null,
      notes: notes ?? null,
      received_by: receivedBy,
      paid_at: now,
    };

    const updatedTab: Tab = {
      ...tab,
      updated_at: now,
      updated_by: receivedBy,
      version: (tab.version || 0) + 1,
    };

    set({
      payments: [...get().payments, newPayment],
      tabs: get().tabs.map((t) => (t.id === tabId ? updatedTab : t)),
    });

    void callRpc('add_payment_atomic', {
      p_payment_id: newPayment.id,
      p_tab_id: tabId,
      p_amount: newPayment.amount,
      p_method: method,
      p_notes: newPayment.notes,
    }, 'TableStore');

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

    void callRpc('cancel_payment', { p_payment_id: paymentId, p_reason: 'Removido pelo caixa' }, 'TableStore');

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
    const totalPaid = sumMoney(tabPayments.map((p) => p.amount));

    // Validação estrita em centavos: total pago deve ser maior ou igual ao total devido
    if (toCents(totalPaid) < toCents(tab.total)) {
      const missing = fromCents(toCents(tab.total) - toCents(totalPaid));
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
      updated_at: now,
      updated_by: userId,
      version: (tab.version || 0) + 1,
    };

    // Atualiza comanda, desocupa mesa e fecha pedidos da comanda
    const table = get().tables.find((t) => t.id === tab.table_id);
    const updatedTables = get().tables.map((t) =>
      t.id === tab.table_id ? { ...t, status: 'LIVRE' as const, current_tab: undefined, updated_at: now, updated_by: t.updated_by, version: (t.version || 0) + 1 } : t
    );

    const updatedOrders = get().orders.map((o) =>
      o.tab_id === tabId ? { ...o, status: 'CLOSED' as const, updated_at: now, updated_by: userId, version: (o.version || 0) + 1 } : o
    );

    set({
      tabs: get().tabs.map((t) => (t.id === tabId ? updatedTab : t)),
      tables: updatedTables,
      orders: updatedOrders,
    });

    void callRpc('close_tab_atomic', { p_tab_id: tabId }, 'TableStore');

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

  quickCloseTabAtomic: (shiftId, tabId, amount, method, userId, notes) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) throw new Error('Comanda não encontrada.');
    if (tab.status === 'CLOSED') throw new Error('Esta comanda já foi encerrada anteriormente.');

    const now = new Date().toISOString();
    const paymentId = generateId();
    const validAmount = fromCents(toCents(amount));

    const newPayment: Payment = {
      id: paymentId,
      shift_id: shiftId,
      tab_id: tabId,
      amount: validAmount,
      method,
      status: 'PAID',
      external_reference: null,
      notes: notes ?? null,
      received_by: userId,
      paid_at: now,
    };

    const existingPayments = get().payments.filter((p) => p.tab_id === tabId && p.status === 'PAID');
    const allPayments = validAmount > 0 ? [...existingPayments, newPayment] : existingPayments;
    const totalPaid = sumMoney(allPayments.map((p) => p.amount));

    // Validação em centavos: total pago deve cobrir o total devido
    if (toCents(totalPaid) < toCents(tab.total)) {
      const missing = fromCents(toCents(tab.total) - toCents(totalPaid));
      throw new Error(
        `Pagamento insuficiente. Total devido: R$ ${tab.total.toFixed(2)}, Total pago: R$ ${totalPaid.toFixed(2)}. Faltam R$ ${missing.toFixed(2)}.`
      );
    }

    const updatedTab: Tab = {
      ...tab,
      status: 'CLOSED',
      closed_by: userId,
      closed_at: now,
      updated_at: now,
      updated_by: userId,
      version: (tab.version || 0) + 1,
    };

    const table = get().tables.find((t) => t.id === tab.table_id);
    const updatedTables = get().tables.map((t) =>
      t.id === tab.table_id ? { ...t, status: 'LIVRE' as const, current_tab: undefined, updated_at: now, updated_by: t.updated_by, version: (t.version || 0) + 1 } : t
    );

    const updatedOrders = get().orders.map((o) =>
      o.tab_id === tabId ? { ...o, status: 'CLOSED' as const, updated_at: now, updated_by: userId, version: (o.version || 0) + 1 } : o
    );

    set({
      payments: validAmount > 0 ? [...get().payments, newPayment] : get().payments,
      tabs: get().tabs.map((t) => (t.id === tabId ? updatedTab : t)),
      tables: updatedTables,
      orders: updatedOrders,
    });

    // Chamada RPC atômica única: insere pagamento e fecha a comanda na mesma transação no PostgreSQL
    void callRpc('close_tab_with_payment', {
      p_payment_id: paymentId,
      p_tab_id: tabId,
      p_amount: validAmount,
      p_method: method,
      p_notes: notes ?? null,
    }, 'TableStore');

    const items = get().getTabOrderItems(tabId);

    logger.info({
      context: 'TableStore',
      message: `Comanda da Mesa ${table?.number ?? '??'} quitada e encerrada via RPC atômico. Total: R$ ${tab.total.toFixed(2)}, Pago: R$ ${totalPaid.toFixed(2)} (${method}).`,
    });

    return {
      tab: updatedTab,
      payments: allPayments,
      items,
    };
  },

  reopenTabAtomic: (tabId, userId, reason) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) throw new Error('Comanda não encontrada.');
    if (tab.status !== 'CLOSED') throw new Error('Apenas comandas fechadas podem ser reabertas.');
    if (!reason.trim()) throw new Error('Informe o motivo da reabertura.');
    const role = useAuthStore.getState().currentProfile.role;
    if (role !== 'MASTER' && role !== 'GERENTE') {
      throw new Error('Somente gerência pode reabrir comandas.');
    }
    if (get().tabs.some((t) => t.table_id === tab.table_id && t.status === 'OPEN')) {
      throw new Error('A mesa já possui outra comanda aberta.');
    }

    const now = new Date().toISOString();
    const updatedTab: Tab = {
      ...tab,
      status: 'OPEN',
      closed_by: null,
      closed_at: null,
      updated_at: now,
      updated_by: userId,
      version: (tab.version || 0) + 1,
    };

    const table = get().tables.find((t) => t.id === tab.table_id);
    const updatedTables = get().tables.map((t) =>
      t.id === tab.table_id ? { ...t, status: 'OCUPADA' as const, current_tab: updatedTab } : t
    );

    set({
      tabs: get().tabs.map((t) => (t.id === tabId ? updatedTab : t)),
      tables: updatedTables,
    });

    void callRpc('reopen_tab_atomic', { p_tab_id: tabId, p_reason: reason }, 'TableStore');

    logger.warn({
      context: 'TableStore',
      message: `Comanda da Mesa ${table?.number} reaberta por ${userId}. Motivo: ${reason}`,
    });
  },

  releaseEmptyTab: (tabId, userId) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) throw new Error('Comanda não encontrada.');
    if (tab.status !== 'OPEN') throw new Error('Esta comanda já foi encerrada.');
    const orderIds = new Set(get().orders.filter((o) => o.tab_id === tabId).map((o) => o.id));
    if (get().orderItems.some((i) => orderIds.has(i.order_id) && i.status !== 'CANCELLED')) throw new Error('A mesa já tem pedido lançado. Peça ao gerente para anular a comanda.');
    if (get().payments.some((p) => p.tab_id === tabId && p.status === 'PAID')) throw new Error('A mesa já tem pagamento registrado. Peça ao caixa para resolver.');
    const now = new Date().toISOString();
    set({
      tabs: get().tabs.map((t) => (t.id === tabId ? { ...t, status: 'CANCELLED' as const, subtotal: 0, service_fee: 0, discount: 0, total: 0, closed_at: now, closed_by: userId, updated_at: now } : t)),
      tables: get().tables.map((t) => (t.id === tab.table_id ? { ...t, status: 'LIVRE' as const, current_tab: undefined, updated_at: now } : t)),
    });
    void callRpc('release_empty_tab', { p_tab_id: tabId }, 'TableStore');
    logger.info({ context: 'TableStore', message: `Comanda ${tabId} liberada (mesa aberta por engano).` });
  },

  voidTabAtomic: (tabId, reason, userId, returnStock) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) throw new Error('Comanda não encontrada.');
    if (tab.status !== 'OPEN') throw new Error('Só é possível anular comanda aberta.');
    if (!reason.trim()) throw new Error('Informe o motivo da anulação.');
    const now = new Date().toISOString();
    const orderIds = new Set(get().orders.filter((o) => o.tab_id === tabId).map((o) => o.id));
    const items = get().orderItems.filter((i) => orderIds.has(i.order_id) && i.status !== 'CANCELLED');

    // Demonstração: devolve ao estoque o que não foi preparado (no banco a RPC faz isso)
    if (!isSupabaseConfigured) {
      items.forEach((i) => {
        try {
          useStockStore.getState().cancelOrderItemStockAtomic(tab.shift_id, i.product_id, i.quantity, stockStatusForCancel(i.status, returnStock), userId, i.id, `Comanda anulada: ${reason}`);
        } catch { /* item sem controle de estoque */ }
      });
    }

    set({
      orderItems: get().orderItems.map((i) => (orderIds.has(i.order_id) && i.status !== 'CANCELLED' ? { ...i, status: 'CANCELLED' as const, updated_at: now } : i)),
      orders: get().orders.map((o) => (orderIds.has(o.id) ? { ...o, status: 'CANCELLED' as const, updated_at: now } : o)),
      payments: get().payments.map((p) => (p.tab_id === tabId && p.status === 'PAID' ? { ...p, status: 'CANCELLED' as const } : p)),
      tabs: get().tabs.map((t) => (t.id === tabId ? { ...t, status: 'CANCELLED' as const, subtotal: 0, service_fee: 0, discount: 0, total: 0, closed_at: now, closed_by: userId, updated_at: now } : t)),
      tables: get().tables.map((t) => (t.id === tab.table_id ? { ...t, status: 'LIVRE' as const, current_tab: undefined, updated_at: now } : t)),
    });

    void callRpc('void_tab_atomic', { p_tab_id: tabId, p_reason: reason, ...(returnStock === undefined ? {} : { p_return_stock: returnStock }) }, 'TableStore');

    logger.info({ context: 'TableStore', message: `Comanda ${tabId} anulada (${items.length} itens). Motivo: ${reason}` });
  },

  getTabByTableId: (tableId) => {
    return get().tabs.find((t) => t.table_id === tableId && t.status === 'OPEN');
  },

  getTabOrderItems: (tabId) => {
    const tabOrders = get().orders.filter((o) => o.tab_id === tabId);
    const orderIds = new Set(tabOrders.map((o) => o.id));
    return get().orderItems.filter((i) => orderIds.has(i.order_id));
  },

  // Sincronização em Tempo Real (Multi-dispositivos)
  applyRemoteTableUpdate: (tableData) => {
    const localTable = get().tables.find((t) => t.id === tableData.id || (tableData.number !== undefined && t.number === tableData.number));
    if (localTable) {
      if (isStaleRemote(localTable, tableData)) {
        const tableNumber = tableData.number ?? localTable.number;
        logger.warn({
          context: 'TableStore',
          message: `Conflito detectado ao atualizar Mesa ${tableNumber}. Alteração local é mais recente; mantendo estado local.`,
        });
        set({ conflictWarning: `Conflito na Mesa ${tableNumber}: sua alteração foi mantida.` });
        return;
      }
    }

    set({
      tables: get().tables.map((t) =>
        t.id === tableData.id || (tableData.number !== undefined && t.number === tableData.number)
          ? { ...t, ...tableData }
          : t
      ),
    });
  },

  applyRemoteTabChange: (eventType, tabData) => {
    const { tabs, tables } = get();
    if (eventType === 'DELETE') {
      set({
        tabs: tabs.filter((t) => t.id !== tabData.id),
        tables: tables.map((t) =>
          t.id === tabData.table_id || t.current_tab?.id === tabData.id
            ? { ...t, status: 'LIVRE' as const, current_tab: undefined }
            : t
        ),
      });
      return;
    }

    const localTab = tabs.find((t) => t.id === tabData.id);
    {
      if (isStaleRemote(localTab, tabData)) {
        const table = tables.find((t) => t.id === tabData.table_id || t.current_tab?.id === tabData.id);
        const tableNumber = table?.number ?? '?';
        logger.warn({
          context: 'TableStore',
          message: `Conflito detectado na Comanda da Mesa ${tableNumber}. Alteração local é mais recente; mantendo estado local.`,
        });
        set({ conflictWarning: `Conflito na Comanda da Mesa ${tableNumber}: sua alteração foi mantida.` });
        return;
      }
    }

    const existingIndex = tabs.findIndex((t) => t.id === tabData.id);
    let newTabs: Tab[];
    if (existingIndex >= 0) {
      newTabs = tabs.map((t) => (t.id === tabData.id ? { ...t, ...tabData } : t));
    } else {
      newTabs = [tabData, ...tabs];
    }

    const newTables = tables.map((t) => {
      if (t.id === tabData.table_id || `table-${t.number}` === tabData.table_id) {
        if (tabData.status === 'CLOSED' || tabData.status === 'CANCELLED') {
          return { ...t, status: 'LIVRE' as const, current_tab: undefined };
        }
        return {
          ...t,
          status: t.status === 'AGUARDANDO_CONTA' ? ('AGUARDANDO_CONTA' as const) : ('OCUPADA' as const),
          current_tab: tabData,
        };
      }
      return t;
    });

    set({ tabs: newTabs, tables: newTables });
  },

  applyRemoteOrderChange: (eventType, orderData) => {
    const { orders } = get();
    if (eventType === 'DELETE') {
      set({ orders: orders.filter((o) => o.id !== orderData.id) });
      return;
    }

    const localOrder = orders.find((o) => o.id === orderData.id);
    {
      if (isStaleRemote(localOrder, orderData)) {
        logger.warn({
          context: 'TableStore',
          message: `Conflito detectado no Pedido #${orderData.order_number}. Alteração local é mais recente; mantendo estado local.`,
        });
        set({ conflictWarning: `Conflito no Pedido #${orderData.order_number}: sua alteração foi mantida.` });
        return;
      }
    }

    const exists = orders.some((o) => o.id === orderData.id);
    if (exists) {
      set({ orders: orders.map((o) => (o.id === orderData.id ? { ...o, ...orderData } : o)) });
    } else {
      set({ orders: [orderData, ...orders] });
    }
  },

  applyRemoteOrderItemChange: (eventType, itemData) => {
    const { orderItems, orders } = get();
    if (eventType === 'DELETE') {
      set({ orderItems: orderItems.filter((i) => i.id !== itemData.id) });
      return;
    }

    const localItem = orderItems.find((i) => i.id === itemData.id);
    {
      if (isStaleRemote(localItem, itemData)) {
        const order = orders.find((o) => o.id === itemData.order_id);
        const orderNumber = order?.order_number ?? '?';
        logger.warn({
          context: 'TableStore',
          message: `Conflito detectado no Item do Pedido #${orderNumber}. Alteração local é mais recente; mantendo estado local.`,
        });
        set({ conflictWarning: `Conflito no Item do Pedido #${orderNumber}: sua alteração foi mantida.` });
        return;
      }
    }

    const exists = orderItems.some((i) => i.id === itemData.id);
    let newItems: OrderItem[];
    if (exists) {
      newItems = orderItems.map((i) => (i.id === itemData.id ? { ...i, ...itemData } : i));
    } else {
      newItems = [itemData, ...orderItems];
    }

    const order = orders.find((o) => o.id === itemData.order_id);
    let newOrders = orders;
    if (order) {
      const siblings = newItems.filter((i) => i.order_id === order.id && i.status !== 'CANCELLED');
      if (siblings.length > 0) {
        let newOrderStatus = order.status;
        if (siblings.every((i) => i.status === 'DELIVERED')) {
          newOrderStatus = 'DELIVERED';
        } else if (siblings.every((i) => i.status === 'READY' || i.status === 'DELIVERED')) {
          newOrderStatus = 'READY';
        } else if (siblings.some((i) => i.status === 'IN_PREPARATION' || i.status === 'READY')) {
          newOrderStatus = 'IN_PREPARATION';
        } else if (siblings.some((i) => i.status === 'RECEIVED')) {
          newOrderStatus = 'CONFIRMED';
        }

        if (newOrderStatus !== order.status) {
          newOrders = orders.map((o) => (o.id === order.id ? { ...o, status: newOrderStatus } : o));
        }
      }
    }

    set({ orderItems: newItems, orders: newOrders });
  },

  applyRemotePaymentChange: (eventType, paymentData) => {
    const others = get().payments.filter((p) => p.id !== paymentData.id);
    // Pagamentos cancelados/estornados saem da lista local
    if (eventType === 'DELETE' || paymentData.status !== 'PAID') {
      set({ payments: others });
      return;
    }
    set({ payments: [...others, { ...paymentData, amount: Number(paymentData.amount) }] });
  },
}));
