import { create } from 'zustand';
import { DailyPrepStock, DeliveryOrder, DeliveryOrderItem, DeliveryOrderType, DeliveryStatus, DeliveryPaymentMethod, Product, WhatsAppMessage } from '../types/domain';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { callRpc } from '../lib/remote';
import { audioService } from '../lib/audio';
import { useShiftStore } from './useShiftStore';
import { MeatDoneness } from '../types/enums';
import { generateId } from '../lib/utils';
import { useStockStore } from './useStockStore';
import { realtimeService } from '../lib/realtime';
import { logger } from '../lib/logger';
import { formatBRL } from '../lib/formatters';
import { usePrintStore } from './usePrintStore';
import { appStorage } from '../lib/storage';
import { remainingFor, limitingName } from '../lib/comboStock';

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
  /** Padrão: entrega. Retirada no local não tem endereço nem taxa. */
  orderType?: DeliveryOrderType;
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

interface PublicMenuProduct extends Product {
  stock_available: number | null;
  is_exhausted: boolean;
}

interface PublicMenu {
  is_open: boolean;
  shift_id: string | null;
  zones: NeighborhoodFee[];
  products: PublicMenuProduct[];
}

interface DeliveryState {
  deliveryOrders: DeliveryOrder[];
  cart: DeliveryCartItem[];
  activeTrackingOrder: DeliveryOrder | null;
  /** Bairros atendidos e taxas (do banco quando disponível). */
  zones: NeighborhoodFee[];
  /** Chave anti-clique-duplo do checkout atual. */
  checkoutKey: string;

  // Cardápio público e sincronização (modo Supabase)
  loadPublicMenu: () => Promise<void>;
  loadRemoteDeliveryOrders: () => Promise<void>;
  applyRemoteDeliveryOrder: (row: Record<string, unknown>) => Promise<void>;
  /** Envia o pedido: RPC pública no Supabase ou fluxo local na demonstração. */
  submitDeliveryOrder: (input: PlaceDeliveryOrderInput) => Promise<DeliveryOrder>;
  /** Cliente anônimo: consulta o status do pedido acompanhado (via telefone). */
  refreshTrackingStatus: () => Promise<void>;

  // Ações do Carrinho de Delivery
  addToCart: (product: Product, quantity: number, doneness?: MeatDoneness | null, notes?: string) => void;
  removeFromCart: (cartItemId: string) => void;
  updateCartQuantity: (cartItemId: string, delta: number) => void;
  clearCart: () => void;

  // Ações de Pedido
  placeDeliveryOrderAtomic: (input: PlaceDeliveryOrderInput) => DeliveryOrder;
  updateDeliveryStatus: (orderId: string, status: DeliveryStatus, driverName?: string) => void;
  /** returnStock: devolve os itens ao estoque (só vale antes de ficar pronto). Sem valor, segue a regra padrão. */
  cancelDeliveryOrderAtomic: (orderId: string, reason: string, userId?: string, returnStock?: boolean) => void;
  setActiveTrackingOrder: (order: DeliveryOrder | null) => void;

  // Pagamento e WhatsApp automático
  /** Mensagens automáticas enviadas ao cliente, por pedido. */
  whatsappMessages: WhatsAppMessage[];
  loadWhatsAppMessages: () => Promise<void>;
  applyRemoteWhatsAppMessage: (row: WhatsAppMessage) => void;
  retryWhatsAppMessage: (id: string) => Promise<void>;
  /** Caixa confirma (ou desfaz) o recebimento do pagamento. */
  markDeliveryPaid: (orderId: string, paid: boolean) => Promise<void>;}

function normalizeOrder(row: Record<string, unknown>, items: DeliveryOrderItem[]): DeliveryOrder {
  const o = row as unknown as DeliveryOrder;
  return {
    ...o,
    delivery_fee: Number(o.delivery_fee),
    subtotal: Number(o.subtotal),
    total: Number(o.total),
    cash_change_for: o.cash_change_for == null ? null : Number(o.cash_change_for),
    items: items.map((i) => ({ ...i, unit_price: Number(i.unit_price) })),
  };
}

// Pedido acompanhado pelo cliente: sobrevive a recarregar a página do cardápio
const TRACKING_KEY = 'espetaria_delivery_tracking_v1';

function loadTrackedOrder(): DeliveryOrder | null {
  if (!isSupabaseConfigured) return null;
  try {
    const raw = appStorage.getItem(TRACKING_KEY);
    if (!raw) return null;
    const order = JSON.parse(raw) as DeliveryOrder;
    // Descarta pedidos encerrados (cancelado/entregue) e com mais de 12 horas
    if (order.status === 'CANCELLED' || order.status === 'DELIVERED') { appStorage.removeItem(TRACKING_KEY); return null; }
    return Date.now() - new Date(order.created_at).getTime() < 12 * 60 * 60 * 1000 ? order : null;
  } catch {
    return null;
  }
}

function saveTrackedOrder(order: DeliveryOrder | null) {
  if (!isSupabaseConfigured) return;
  try {
    if (order) appStorage.setItem(TRACKING_KEY, JSON.stringify(order));
    else appStorage.removeItem(TRACKING_KEY);
  } catch {
    // armazenamento indisponível (aba anônima): segue só em memória
  }
}

export const useDeliveryStore = create<DeliveryState>((set, get) => ({
  deliveryOrders: [],
  cart: [],
  activeTrackingOrder: loadTrackedOrder(),
  zones: NEIGHBORHOOD_FEES,
  checkoutKey: generateId(),

  loadPublicMenu: async () => {
    if (!isSupabaseConfigured) return;
    const { data, error } = await supabase.rpc('get_public_menu');
    if (error || !data) {
      logger.error({ context: 'DeliveryStore', message: 'Erro ao carregar cardápio público', error });
      throw new Error('Não foi possível carregar o cardápio. Verifique sua conexão.');
    }
    const menu = data as PublicMenu;
    const now = new Date().toISOString();

    useStockStore.setState({
      products: menu.products.map((p) => ({ ...p, price: Number(p.price), available: !p.is_exhausted })),
      // Disponibilidade por produto controlado, no formato usado pelo catálogo
      dailyPrepStock: menu.shift_id
        ? menu.products.filter((p) => p.tracks_stock).map((p) => ({
            id: `public-${p.id}`, shift_id: menu.shift_id!, product_id: p.id, cubas_count: 0, portions_per_cuba: 1,
            initial_quantity: p.stock_available ?? 0, current_quantity: p.stock_available ?? 0,
            reserved_quantity: 0, consumed_quantity: 0, discarded_quantity: 0, adjusted_quantity: 0,
            last_counted_quantity: null, count_difference: null, is_exhausted: p.is_exhausted,
            exhausted_at: null, exhausted_by: null, exhaust_reason: null, created_at: now, updated_at: now,
          }) as DailyPrepStock)
        : [],
    });

    useShiftStore.setState({
      currentShift: menu.is_open && menu.shift_id
        ? { id: menu.shift_id, date: now.slice(0, 10), name: 'Turno', status: 'ABERTO', opened_by: '', closed_by: null,
            opened_at: now, closed_at: null, initial_notes: null, closing_notes: null, cash_drawer_start: 0,
            cash_drawer_end: null, created_at: now, updated_at: now, updated_by: null, version: 1 }
        : null,
    });

    if (menu.zones.length > 0) {
      set({ zones: menu.zones.map((z) => ({ name: z.name, fee: Number(z.fee) })) });
    }
  },

  loadRemoteDeliveryOrders: async () => {
    if (!isSupabaseConfigured) return;
    const since = new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('delivery_orders')
      .select('*, items:delivery_order_items(*)')
      .gte('created_at', since)
      .order('created_at', { ascending: false });
    if (error) {
      logger.warn({ context: 'DeliveryStore', message: 'Erro ao carregar pedidos de delivery', error });
      return;
    }
    set({
      deliveryOrders: (data || []).map((row) => normalizeOrder(row, (row.items || []) as DeliveryOrderItem[])),
    });
  },

  applyRemoteDeliveryOrder: async (row) => {
    const id = row.id as string;
    const existing = get().deliveryOrders.find((o) => o.id === id);
    let items = existing?.items ?? [];
    if (items.length === 0) {
      // INSERT chega antes dos itens estarem visíveis? Busca na hora.
      const { data } = await supabase.from('delivery_order_items').select('*').eq('delivery_order_id', id);
      items = (data || []) as DeliveryOrderItem[];
    }
    const order = normalizeOrder(row, items);
    const isNew = !existing;
    set({
      deliveryOrders: [order, ...get().deliveryOrders.filter((o) => o.id !== id)]
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      activeTrackingOrder: get().activeTrackingOrder?.id === id ? order : get().activeTrackingOrder,
    });
    if (isNew) audioService.playNewOrderSound();
  },

  submitDeliveryOrder: async (input) => {
    if (!isSupabaseConfigured) return get().placeDeliveryOrderAtomic(input);

    const cart = get().cart;
    if (cart.length === 0) throw new Error('O carrinho de delivery está vazio.');

    const orderType = input.orderType ?? 'DELIVERY';
    const isPickup = orderType === 'PICKUP';
    const { data, error } = await supabase.rpc('place_delivery_order', {
      p_order: {
        order_type: orderType,
        customer_name: input.customerName,
        phone: input.phone,
        address_street: input.addressStreet,
        address_number: input.addressNumber,
        address_neighborhood: input.addressNeighborhood,
        address_complement: input.addressComplement ?? null,
        address_reference: input.addressReference ?? null,
        payment_method: input.paymentMethod,
        cash_change_for: input.cashChangeFor ?? null,
        notes: input.notes ?? null,
        idempotency_key: get().checkoutKey,
        items: cart.map((c) => ({ product_id: c.productId, quantity: c.quantity, doneness: c.doneness ?? null, notes: c.notes ?? null })),
      },
    });
    if (error) {
      logger.warn({ context: 'DeliveryStore', message: 'Pedido de delivery recusado', error });
      throw new Error(error.message || 'Não foi possível enviar o pedido.');
    }

    const result = data as { id: string; order_number: number; total: number; subtotal: number; delivery_fee: number; awaiting_payment?: boolean };
    const awaitingPix = !!result.awaiting_payment;
    const now = new Date().toISOString();
    const order: DeliveryOrder = {
      id: result.id, order_number: result.order_number, shift_id: input.shiftId, order_type: orderType,
      customer_name: input.customerName, phone: input.phone,
      address_street: isPickup ? '' : input.addressStreet,
      address_number: isPickup ? '' : input.addressNumber,
      address_neighborhood: isPickup ? '' : input.addressNeighborhood,
      address_complement: isPickup ? null : input.addressComplement ?? null,
      address_reference: isPickup ? null : input.addressReference ?? null,
      delivery_fee: Number(result.delivery_fee), subtotal: Number(result.subtotal), total: Number(result.total),
      payment_method: input.paymentMethod, cash_change_for: input.cashChangeFor ?? null, status: awaitingPix ? 'AWAITING_PAYMENT' : 'PREPARING',
      notes: input.notes ?? null, driver_name: null, created_at: now,
      confirmed_at: awaitingPix ? null : now, preparing_at: awaitingPix ? null : now, dispatched_at: null, delivered_at: null,
      items: cart.map((c) => ({
        id: c.id, delivery_order_id: result.id, product_id: c.productId, product_name: c.product.name,
        unit_price: c.product.price, quantity: c.quantity, doneness: c.doneness ?? null, notes: c.notes ?? null, sector: c.product.sector,
      })),
    };

    set({ cart: [], activeTrackingOrder: order, checkoutKey: generateId() });
    saveTrackedOrder(order);
    void get().loadPublicMenu().catch(() => {});
    return order;
  },

  refreshTrackingStatus: async () => {
    const tracked = get().activeTrackingOrder;
    if (!isSupabaseConfigured || !tracked || ['DELIVERED', 'CANCELLED'].includes(tracked.status)) return;
    const { data } = await supabase.rpc('get_delivery_order_status', { p_order_id: tracked.id, p_phone: tracked.phone });
    if (!data) return;
    const s = data as Partial<DeliveryOrder>;
    const current = get().activeTrackingOrder;
    if (current?.id !== tracked.id) return;
    const refreshed: DeliveryOrder = {
      ...current,
      status: s.status ?? current.status,
      driver_name: s.driver_name ?? current.driver_name,
      paid_at: s.paid_at ?? current.paid_at ?? null,
      ready_at: s.ready_at ?? current.ready_at ?? null,
      cancel_reason: s.cancel_reason ?? current.cancel_reason ?? null,
      pix_qr_code: s.pix_qr_code ?? (s.status === 'AWAITING_PAYMENT' ? current.pix_qr_code : null) ?? null,
      pix_expires_at: s.pix_expires_at ?? current.pix_expires_at ?? null,
      dispatched_at: s.dispatched_at ?? current.dispatched_at,
      delivered_at: s.delivered_at ?? current.delivered_at,
    };
    set({ activeTrackingOrder: refreshed });
    saveTrackedOrder(refreshed);
  },

  addToCart: (product, quantity, doneness, notes) => {
    const { products, dailyPrepStock } = useStockStore.getState();
    const cartLines = get().cart.map((item) => ({ product: item.product, quantity: item.quantity }));

    // Valida estoque considerando combos (espeto + arroz) via remainingFor
    const remaining = remainingFor(product, products, dailyPrepStock, cartLines);
    if (remaining !== null && remaining < quantity) {
      const limiter = limitingName(product, products, dailyPrepStock, cartLines);
      throw new Error(
        limiter === product.name
          ? `Produto "${product.name}" não possui quantidade suficiente em estoque.`
          : `Estoque insuficiente: "${limiter}" limita este pedido.`
      );
    }

    const normDoneness = doneness ?? null;
    const normNotes = notes?.trim() || undefined;

    const existingIndex = get().cart.findIndex(
      (item) => item.productId === product.id && item.doneness === normDoneness && (item.notes || undefined) === normNotes
    );

    if (existingIndex !== -1) {
      const existing = get().cart[existingIndex]!;
      const newQty = existing.quantity + quantity;
      const cartWithUpdated = cartLines.map((line, i) => i === existingIndex ? { ...line, quantity: newQty } : line);
      const remainingAfter = remainingFor(product, products, dailyPrepStock, cartWithUpdated);
      if (remainingAfter !== null && remainingAfter < 0) {
        const limiter = limitingName(product, products, dailyPrepStock, cartWithUpdated);
        throw new Error(
          limiter === product.name
            ? `Produto "${product.name}" não possui quantidade suficiente em estoque.`
            : `Estoque insuficiente: "${limiter}" limita este pedido.`
        );
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

    const orderType = input.orderType ?? 'DELIVERY';
    const isPickup = orderType === 'PICKUP';
    const deliveryFee = isPickup
      ? 0
      : input.deliveryFee ?? (NEIGHBORHOOD_FEES.find((n) => n.name === input.addressNeighborhood)?.fee ?? 5.0);
    const total = subtotal + deliveryFee;
    const now = new Date().toISOString();

    // Igual ao banco: o pedido já entra "Na brasa", sem ninguém precisar aceitar
    const newOrder: DeliveryOrder = {
      id: orderId,
      order_number: 1000 + get().deliveryOrders.length + 1,
      shift_id: input.shiftId,
      order_type: orderType,
      customer_name: input.customerName,
      phone: input.phone,
      address_street: isPickup ? '' : input.addressStreet,
      address_number: isPickup ? '' : input.addressNumber,
      address_neighborhood: isPickup ? '' : input.addressNeighborhood,
      address_complement: isPickup ? null : input.addressComplement ?? null,
      address_reference: isPickup ? null : input.addressReference ?? null,
      delivery_fee: deliveryFee,
      subtotal,
      total,
      payment_method: input.paymentMethod,
      cash_change_for: input.cashChangeFor ?? null,
      status: 'PREPARING',
      notes: input.notes ?? null,
      driver_name: null,
      created_at: now,
      confirmed_at: now,
      preparing_at: now,
      dispatched_at: null,
      delivered_at: null,
      items: orderItems,
    };

    set({
      deliveryOrders: [newOrder, ...get().deliveryOrders],
      cart: [],
      activeTrackingOrder: newOrder,
    });

    const originTag = isPickup ? 'RETIRADA' : 'DELIVERY';

    // Transmite para KDS Churrasqueira
    const grillItems = orderItems.filter((i) => i.sector === 'GRILL');
    if (grillItems.length > 0) {
      realtimeService.broadcastNewOrder({
        order_id: newOrder.id,
        tab_id: 'delivery-tab',
        table_number: 99, // Identificador de Delivery
        sector: 'GRILL',
        items: grillItems.map((i) => ({
          product_name: `[${originTag}] ${i.product_name}`,
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
          product_name: `[${originTag}] ${i.product_name}`,
          quantity: i.quantity,
          doneness: null,
          notes: i.notes ? `${i.notes} (Cliente: ${newOrder.customer_name})` : `Cliente: ${newOrder.customer_name}`,
        })),
      });
    }

    // ENFILEIRA IMPRESSÃO AUTOMÁTICA SETORIZADA (Churrasqueira e Cozinha para Delivery)
    const printStore = usePrintStore.getState();
    if (grillItems.length > 0) {
      printStore.enqueuePrintJob({
        order_id: newOrder.id,
        order_number: newOrder.order_number,
        sector: 'GRILL',
        origin: 'DELIVERY',
        table_number: 99,
        customer_name: newOrder.customer_name,
        items: grillItems.map((i) => ({
          name: i.product_name,
          quantity: i.quantity,
          doneness: i.doneness,
          notes: i.notes ? `${i.notes} (${originTag})` : originTag,
        })),
      });
    }

    if (kitchenItems.length > 0) {
      printStore.enqueuePrintJob({
        order_id: newOrder.id,
        order_number: newOrder.order_number,
        sector: 'KITCHEN',
        origin: 'DELIVERY',
        table_number: 99,
        customer_name: newOrder.customer_name,
        items: kitchenItems.map((i) => ({
          name: i.product_name,
          quantity: i.quantity,
          doneness: null,
          notes: i.notes ? `${i.notes} (${originTag})` : originTag,
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

    if (status === 'OUT_FOR_DELIVERY' && order.order_type === 'PICKUP') {
      throw new Error('Pedido de retirada não sai para entrega.');
    }

    const now = new Date().toISOString();
    const updated: DeliveryOrder = {
      ...order,
      status,
      driver_name: driverName ?? order.driver_name,
      preparing_at: status === 'PREPARING' ? order.preparing_at ?? now : order.preparing_at,
      ready_at: status === 'READY' ? now : order.ready_at,
      dispatched_at: status === 'OUT_FOR_DELIVERY' ? now : order.dispatched_at,
      delivered_at: status === 'DELIVERED' ? now : order.delivered_at,
    };

    set({
      deliveryOrders: get().deliveryOrders.map((o) => (o.id === orderId ? updated : o)),
      activeTrackingOrder: get().activeTrackingOrder?.id === orderId ? updated : get().activeTrackingOrder,
    });

    void callRpc('update_delivery_status', { p_order_id: orderId, p_status: status, p_driver_name: driverName ?? null }, 'DeliveryStore');

    logger.info({
      context: 'DeliveryStore',
      message: `Pedido Delivery #${order.order_number} atualizado para status ${status}.`,
    });
  },

  cancelDeliveryOrderAtomic: (orderId, reason, userId, returnStock) => {
    const order = get().deliveryOrders.find((o) => o.id === orderId);
    if (!order) return;
    if (order.status === 'CANCELLED') return;

    // Mesma regra do banco: pronto ou já saiu nunca volta; na brasa vale a escolha de quem cancela
    const notStarted = order.status === 'CONFIRMED' || order.status === 'PENDING';
    const canReturnStock = (notStarted || order.status === 'PREPARING') && (returnStock ?? notStarted);
    const shiftId = order.shift_id;

    // Com Supabase, o banco devolve estoque e avisa a produção
    if (isSupabaseConfigured) {
      void callRpc('cancel_delivery_order', { p_order_id: orderId, p_reason: reason, ...(returnStock === undefined ? {} : { p_return_stock: returnStock }) }, 'DeliveryStore');
    }

    if (!isSupabaseConfigured) order.items.forEach((item) => {
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
      cancel_reason: reason,
      cancelled_at: new Date().toISOString(),
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

  setActiveTrackingOrder: (order) => {
    set({ activeTrackingOrder: order });
    saveTrackedOrder(order);
  },

  whatsappMessages: [],

  loadWhatsAppMessages: async () => {
    if (!isSupabaseConfigured) return;
    const since = new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('whatsapp_outbox')
      .select('id, delivery_order_id, event, status, attempts, last_error, created_at, sent_at')
      .gte('created_at', since);
    if (error) {
      // Tabela ainda não criada (migration 00011 pendente): segue sem o status do WhatsApp
      logger.debug({ context: 'DeliveryStore', message: 'Fila de WhatsApp indisponível', error });
      return;
    }
    set({ whatsappMessages: (data || []) as WhatsAppMessage[] });
  },

  applyRemoteWhatsAppMessage: (row) => {
    set({ whatsappMessages: [row, ...get().whatsappMessages.filter((m) => m.id !== row.id)] });
  },

  retryWhatsAppMessage: async (id) => {
    await callRpc('retry_whatsapp_message', { p_id: id }, 'DeliveryStore');
  },

  markDeliveryPaid: async (orderId, paid) => {
    const paidAt = paid ? new Date().toISOString() : null;
    // Esperando o PIX: confirmar o pagamento manda o pedido para a brasa (o banco imprime)
    set({ deliveryOrders: get().deliveryOrders.map((o) => (o.id === orderId
      ? { ...o, paid_at: paidAt, ...(paid && o.status === 'AWAITING_PAYMENT' ? { status: 'PREPARING' as const, preparing_at: paidAt } : {}) }
      : o)) });
    await callRpc('mark_delivery_paid', { p_order_id: orderId, p_paid: paid }, 'DeliveryStore');
  },
}));
