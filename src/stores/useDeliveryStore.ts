import { create } from 'zustand';
import { DeliveryOrder, DeliveryOrderItem, DeliveryStatus, DeliveryPaymentMethod, Product } from '../types/domain';
import { MeatDoneness } from '../types/enums';
import { generateId } from '../lib/utils';
import { useStockStore } from './useStockStore';
import { realtimeService } from '../lib/realtime';
import { logger } from '../lib/logger';
import { formatBRL } from '../lib/formatters';

export interface DeliveryCartItem {
  id: string;
  productId: string;
  product: Product;
  quantity: number;
  doneness?: MeatDoneness | null;
  notes?: string;
}

export interface NeighborhoodFee {
  name: string;
  fee: number;
}

export const NEIGHBORHOOD_FEES: NeighborhoodFee[] = [
  { name: 'Centro', fee: 5.0 },
  { name: 'Jardim das Américas', fee: 7.0 },
  { name: 'Bairro Alto', fee: 8.0 },
  { name: 'Vila Nova', fee: 6.0 },
  { name: 'Morumbi', fee: 9.0 },
  { name: 'Parque Residencial', fee: 7.5 },
  { name: 'Outros Bairros', fee: 10.0 },
];

interface PlaceDeliveryOrderInput {
  shiftId: string;
  customerName: string;
  phone: string;
  addressStreet: string;
  addressNumber: string;
  addressNeighborhood: string;
  addressComplement?: string;
  addressReference?: string;
  deliveryFee?: number;
  paymentMethod: DeliveryPaymentMethod;
  cashChangeFor?: number;
  notes?: string;
}

interface DeliveryState {
  deliveryOrders: DeliveryOrder[];
  cart: DeliveryCartItem[];
  activeTrackingOrder: DeliveryOrder | null;

  // Ações do Carrinho de Delivery
  addToCart: (product: Product, quantity: number, doneness?: MeatDoneness | null, notes?: string) => void;
  removeFromCart: (cartItemId: string) => void;
  updateCartQuantity: (cartItemId: string, delta: number) => void;
  clearCart: () => void;

  // Ações de Pedido
  placeDeliveryOrderAtomic: (input: PlaceDeliveryOrderInput) => DeliveryOrder;
  updateDeliveryStatus: (orderId: string, status: DeliveryStatus, driverName?: string) => void;
  cancelDeliveryOrderAtomic: (orderId: string, reason: string, userId?: string) => void;
  setActiveTrackingOrder: (order: DeliveryOrder | null) => void;
}

export const useDeliveryStore = create<DeliveryState>((set, get) => ({
  deliveryOrders: [],
  cart: [],
  activeTrackingOrder: null,

  addToCart: (product, quantity, doneness, notes) => {
    // Verifica disponibilidade atual do produto
    const stock = useStockStore.getState().getProductDailyStock(product.id);
    if (stock && (stock.is_exhausted || stock.current_quantity < quantity)) {
      throw new Error(`Produto "${product.name}" não possui quantidade suficiente em estoque.`);
    }

    const normDoneness = doneness ?? null;
    const normNotes = notes?.trim() || undefined;

    const existingIndex = get().cart.findIndex(
      (item) => item.productId === product.id && item.doneness === normDoneness && (item.notes || undefined) === normNotes
    );

    if (existingIndex !== -1) {
      const existing = get().cart[existingIndex]!;
      const newQty = existing.quantity + quantity;
      if (stock && (stock.is_exhausted || stock.current_quantity < newQty)) {
        throw new Error(`Produto "${product.name}" não possui quantidade suficiente em estoque.`);
      }
      const updatedCart = [...get().cart];
      updatedCart[existingIndex] = { ...existing, quantity: newQty };
      set({ cart: updatedCart });
      return;
    }

    const newItem: DeliveryCartItem = {
      id: generateId(),
      productId: product.id,
      product,
      quantity,
      doneness: normDoneness,
      notes: normNotes,
    };

    set({ cart: [...get().cart, newItem] });
  },

  removeFromCart: (cartItemId) => {
    set({ cart: get().cart.filter((item) => item.id !== cartItemId) });
  },

  updateCartQuantity: (cartItemId, delta) => {
    const updated = get().cart
      .map((item) => {
        if (item.id === cartItemId) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        }
        return item;
      })
      .filter((i): i is DeliveryCartItem => i !== null);

    set({ cart: updated });
  },

  clearCart: () => set({ cart: [] }),

  placeDeliveryOrderAtomic: (input) => {
    const cart = get().cart;
    if (cart.length === 0) {
      throw new Error('O carrinho de delivery está vazio.');
    }

    const orderId = generateId();
    const itemsToConsume = cart.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
    }));

    // BAIXA ATÔMICA UNIFICADA NO ESTOQUE DIÁRIO (Se faltar qualquer item, falha e não gera o pedido)
    useStockStore
      .getState()
      .consumeStockAtomic(input.shiftId, itemsToConsume, 'delivery-customer', orderId);

    // Subtotal e itens
    let subtotal = 0;
    const orderItems: DeliveryOrderItem[] = cart.map((c) => {
      subtotal += c.product.price * c.quantity;
      return {
        id: generateId(),
        delivery_order_id: orderId,
        product_id: c.productId,
        product_name: c.product.name,
        unit_price: c.product.price,
        quantity: c.quantity,
        doneness: c.doneness ?? null,
        notes: c.notes ?? null,
        sector: c.product.sector,
      };
    });

    const deliveryFee =
      input.deliveryFee ??
      (NEIGHBORHOOD_FEES.find((n) => n.name === input.addressNeighborhood)?.fee ?? 5.0);
    const total = subtotal + deliveryFee;

    const newOrder: DeliveryOrder = {
      id: orderId,
      order_number: 1000 + get().deliveryOrders.length + 1,
      shift_id: input.shiftId,
      customer_name: input.customerName,
      phone: input.phone,
      address_street: input.addressStreet,
      address_number: input.addressNumber,
      address_neighborhood: input.addressNeighborhood,
      address_complement: input.addressComplement ?? null,
      address_reference: input.addressReference ?? null,
      delivery_fee: deliveryFee,
      subtotal,
      total,
      payment_method: input.paymentMethod,
      cash_change_for: input.cashChangeFor ?? null,
      status: 'CONFIRMED',
      notes: input.notes ?? null,
      driver_name: null,
      created_at: new Date().toISOString(),
      confirmed_at: new Date().toISOString(),
      dispatched_at: null,
      delivered_at: null,
      items: orderItems,
    };

    set({
      deliveryOrders: [newOrder, ...get().deliveryOrders],
      cart: [],
      activeTrackingOrder: newOrder,
    });

    // Transmite para KDS Churrasqueira
    const grillItems = orderItems.filter((i) => i.sector === 'GRILL');
    if (grillItems.length > 0) {
      realtimeService.broadcastNewOrder({
        order_id: newOrder.id,
        tab_id: 'delivery-tab',
        table_number: 99, // Identificador de Delivery
        sector: 'GRILL',
        items: grillItems.map((i) => ({
          product_name: `[DELIVERY] ${i.product_name}`,
          quantity: i.quantity,
          doneness: i.doneness,
          notes: i.notes ? `${i.notes} (Cliente: ${newOrder.customer_name})` : `Cliente: ${newOrder.customer_name}`,
        })),
      });
    }

    // Transmite para KDS Cozinha
    const kitchenItems = orderItems.filter((i) => i.sector === 'KITCHEN');
    if (kitchenItems.length > 0) {
      realtimeService.broadcastNewOrder({
        order_id: newOrder.id,
        tab_id: 'delivery-tab',
        table_number: 99,
        sector: 'KITCHEN',
        items: kitchenItems.map((i) => ({
          product_name: `[DELIVERY] ${i.product_name}`,
          quantity: i.quantity,
          doneness: null,
          notes: i.notes ? `${i.notes} (Cliente: ${newOrder.customer_name})` : `Cliente: ${newOrder.customer_name}`,
        })),
      });
    }

    logger.info({
      context: 'DeliveryStore',
      message: `Novo Pedido de Delivery #${newOrder.order_number} recebido de ${newOrder.customer_name} (${formatBRL(total)}).`,
    });

    return newOrder;
  },

  updateDeliveryStatus: (orderId, status, driverName) => {
    const order = get().deliveryOrders.find((o) => o.id === orderId);
    if (!order) return;

    const now = new Date().toISOString();
    const updated: DeliveryOrder = {
      ...order,
      status,
      driver_name: driverName ?? order.driver_name,
      dispatched_at: status === 'OUT_FOR_DELIVERY' ? now : order.dispatched_at,
      delivered_at: status === 'DELIVERED' ? now : order.delivered_at,
    };

    set({
      deliveryOrders: get().deliveryOrders.map((o) => (o.id === orderId ? updated : o)),
      activeTrackingOrder: get().activeTrackingOrder?.id === orderId ? updated : get().activeTrackingOrder,
    });

    logger.info({
      context: 'DeliveryStore',
      message: `Pedido Delivery #${order.order_number} atualizado para status ${status}.`,
    });
  },

  cancelDeliveryOrderAtomic: (orderId, reason, userId) => {
    const order = get().deliveryOrders.find((o) => o.id === orderId);
    if (!order) return;
    if (order.status === 'CANCELLED') return;

    // Se ainda não saiu para entrega, devolve ao estoque
    const canReturnStock = order.status === 'CONFIRMED' || order.status === 'PENDING';
    const shiftId = order.shift_id;

    order.items.forEach((item) => {
      useStockStore.getState().cancelOrderItemStockAtomic(
        shiftId,
        item.product_id,
        item.quantity,
        canReturnStock ? 'RECEIVED' : 'IN_PREPARATION',
        userId || 'system',
        item.id,
        reason
      );
    });

    const updated: DeliveryOrder = {
      ...order,
      status: 'CANCELLED',
    };

    set({
      deliveryOrders: get().deliveryOrders.map((o) => (o.id === orderId ? updated : o)),
      activeTrackingOrder: get().activeTrackingOrder?.id === orderId ? updated : get().activeTrackingOrder,
    });

    logger.warn({
      context: 'DeliveryStore',
      message: `Pedido Delivery #${order.order_number} cancelado. Motivo: ${reason}`,
    });
  },

  setActiveTrackingOrder: (order) => set({ activeTrackingOrder: order }),
}));
