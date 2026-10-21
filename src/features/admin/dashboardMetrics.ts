import type { DeliveryOrder, Order, OrderItem, Payment, PrintJob, RestaurantTable, StockMovement, Tab } from '../../types/domain';
import { formatBRL } from '../../lib/formatters';

/** Limites dos alertas (minutos). */
export const ALERT_LIMITS = {
  readyNotServed: 5,
  grillTooLong: 20,
  deliveryLate: 45,
  pickupWaiting: 15,
  pixExpiring: 5,
  printerStuckSeconds: 60,
};

export interface DashboardInput {
  shiftId: string | null;
  tables: RestaurantTable[];
  tabs: Tab[];
  orders: Order[];
  orderItems: OrderItem[];
  payments: Payment[];
  deliveryOrders: DeliveryOrder[];
  stockMovements: StockMovement[];
  jobs: PrintJob[];
  /** Com Supabase a fila é do printer-bridge; na demonstração não há impressora real. */
  printerMonitored: boolean;
  now: number;
  /** Última falha do robô do WhatsApp (IA ou envio), de audit_logs WHATSAPP_BOT_ERRO. */
  botErrorAt?: string | null;
}

/** Falha do robô nas últimas 2 horas vira alerta. */
export const BOT_ERROR_WINDOW_MIN = 120;

export type AlertTone = 'danger' | 'warning';
export interface DashboardAlert { id: string; tone: AlertTone; text: string; target: 'tables' | 'kds' | 'delivery' | 'settings' | 'cashier'; }

export type DeliveryStage = 'AWAITING_PAYMENT' | 'IN_PRODUCTION' | 'READY' | 'OUT_FOR_DELIVERY';
export interface ActivityEvent { id: string; time: string; channel: 'Casa' | 'Delivery' | 'Retirada' | 'Sistema'; title: string; description: string; tone: 'success' | 'warning' | 'info' | 'danger' | 'neutral'; }

const minutesSince = (iso: string | null | undefined, now: number) => (iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000)) : 0);
const pad2 = (n: number) => String(n).padStart(2, '0');
const isPickup = (d: DeliveryOrder) => d.order_type === 'PICKUP';
const deliveryLabel = (d: DeliveryOrder) => `${isPickup(d) ? 'Retirada' : 'Delivery'} #${d.order_number}`;

export function stageOf(d: DeliveryOrder): DeliveryStage | null {
  if (d.status === 'AWAITING_PAYMENT') return 'AWAITING_PAYMENT';
  if (d.status === 'PENDING' || d.status === 'CONFIRMED' || d.status === 'PREPARING') return 'IN_PRODUCTION';
  if (d.status === 'READY') return 'READY';
  if (d.status === 'OUT_FOR_DELIVERY') return 'OUT_FOR_DELIVERY';
  return null;
}

/** Pedido de delivery que conta como venda (não cancelado e não esperando o PIX). */
const isSale = (d: DeliveryOrder) => d.status !== 'CANCELLED' && d.status !== 'AWAITING_PAYMENT';
/** Venda de delivery já realizada: entregue ou com pagamento confirmado. */
const isRealized = (d: DeliveryOrder) => isSale(d) && (d.status === 'DELIVERED' || !!d.paid_at);

export function computeDashboard(input: DashboardInput) {
  const { shiftId, tables, tabs, orders, orderItems, payments, deliveryOrders, stockMovements, jobs, now } = input;
  const inShift = <T extends { shift_id?: string | null }>(row: T) => !shiftId || row.shift_id === shiftId || !row.shift_id;
  const tableNumber = (tableId: string | undefined) => {
    const table = tables.find((t) => t.id === tableId);
    return table ? `Mesa ${pad2(table.number)}` : 'Balcão';
  };

  // ---------------- Casa ----------------
  const shiftTabs = tabs.filter((t) => (shiftId ? t.shift_id === shiftId || t.status === 'OPEN' : true));
  const openTabs = shiftTabs.filter((t) => t.status === 'OPEN');
  const paidByTab = new Map<string, number>();
  payments.filter((p) => p.status === 'PAID').forEach((p) => paidByTab.set(p.tab_id, (paidByTab.get(p.tab_id) ?? 0) + p.amount));
  const closedTabs = shiftTabs.filter((t) => t.status === 'CLOSED' && (paidByTab.get(t.id) ?? 0) > 0.009);
  const shiftItems = orderItems.filter((i) => inShift(i) && i.status !== 'CANCELLED');
  const people = openTabs.reduce((s, t) => s + (t.people_count || 1), 0);
  const waitingBill = tables.filter((t) => t.status === 'AGUARDANDO_CONTA');
  const readyItems = orderItems.filter((i) => i.status === 'READY');
  const readyOldest = readyItems.reduce((m, i) => Math.max(m, minutesSince(i.prepared_at ?? i.updated_at, now)), 0);
  const grillItems = orderItems.filter((i) => i.sector === 'GRILL' && i.status === 'IN_PREPARATION');
  const grillOldest = grillItems.reduce((m, i) => Math.max(m, minutesSince(i.created_at, now)), 0);

  const salonClosed = closedTabs.reduce((s, t) => s + t.subtotal, 0);
  const salonOpen = openTabs.reduce((s, t) => s + t.subtotal, 0);
  const salonTabsCount = closedTabs.length + openTabs.length;
  const salonPeople = people + closedTabs.reduce((s, t) => s + (t.people_count || 1), 0);
  const serviceFee = [...closedTabs, ...openTabs].reduce((s, t) => s + (t.service_fee || 0), 0);
  const discounts = [...closedTabs, ...openTabs].reduce((s, t) => s + (t.discount || 0), 0);

  // Situação de cada mesa aberta
  const tabInfo = (tab: Tab) => {
    const tabOrders = orders.filter((o) => o.tab_id === tab.id);
    const ids = new Set(tabOrders.map((o) => o.id));
    const items = orderItems.filter((i) => ids.has(i.order_id) && i.status !== 'CANCELLED');
    const lastOrderAt = tabOrders.reduce<string | null>((m, o) => (!m || o.created_at > m ? o.created_at : m), null);
    return {
      ready: items.filter((i) => i.status === 'READY').reduce((s, i) => s + i.quantity, 0),
      preparing: items.filter((i) => i.status === 'RECEIVED' || i.status === 'IN_PREPARATION').reduce((s, i) => s + i.quantity, 0),
      served: items.filter((i) => i.status === 'DELIVERED').reduce((s, i) => s + i.quantity, 0),
      itemCount: items.reduce((s, i) => s + i.quantity, 0),
      minutesSinceLastOrder: lastOrderAt ? minutesSince(lastOrderAt, now) : null,
    };
  };

  // ---------------- Delivery / retirada ----------------
  const shiftDeliveries = deliveryOrders.filter(inShift);
  const sales = shiftDeliveries.filter(isSale);
  const active = shiftDeliveries.filter((d) => stageOf(d) !== null);
  const stages: Record<DeliveryStage, DeliveryOrder[]> = { AWAITING_PAYMENT: [], IN_PRODUCTION: [], READY: [], OUT_FOR_DELIVERY: [] };
  active.forEach((d) => stages[stageOf(d)!].push(d));
  const lateDeliveries = active.filter((d) => !isPickup(d) && d.status !== 'AWAITING_PAYMENT' && minutesSince(d.created_at, now) >= ALERT_LIMITS.deliveryLate);
  const pickupsWaiting = active.filter((d) => isPickup(d) && d.status === 'READY');
  const channel = (pickup: boolean) => {
    const list = sales.filter((d) => isPickup(d) === pickup);
    const realized = list.filter(isRealized);
    const gross = list.reduce((s, d) => s + d.subtotal, 0);
    return {
      count: list.length,
      realized: realized.reduce((s, d) => s + d.subtotal, 0),
      pending: list.filter((d) => !isRealized(d)).reduce((s, d) => s + d.subtotal, 0),
      gross,
      fees: list.reduce((s, d) => s + (d.delivery_fee || 0), 0),
      avgTicket: list.length ? gross / list.length : 0,
    };
  };
  const delivery = channel(false);
  const pickup = channel(true);

  // ---------------- Faturamento (produtos, sem taxas) ----------------
  const realized = salonClosed + delivery.realized + pickup.realized;
  const inProgress = salonOpen + delivery.pending + pickup.pending;
  const projected = realized + inProgress;

  // ---------------- Recebido por forma de pagamento (dinheiro que entrou) ----------------
  const received: Record<'PIX' | 'CREDITO' | 'DEBITO' | 'DINHEIRO' | 'CARTAO_ENTREGA', number> = { PIX: 0, CREDITO: 0, DEBITO: 0, DINHEIRO: 0, CARTAO_ENTREGA: 0 };
  payments.filter((p) => p.status === 'PAID' && (!shiftId || p.shift_id === shiftId || !p.shift_id)).forEach((p) => {
    const key = p.method as keyof typeof received;
    if (key in received) received[key] += p.amount;
  });
  sales.filter(isRealized).forEach((d) => { received[d.payment_method] += d.total; });
  const receivedTotal = Object.values(received).reduce((a, b) => a + b, 0);

  // ---------------- Produção (unidades) ----------------
  const production: Record<'GRILL' | 'KITCHEN' | 'BAR', { salon: number; delivery: number }> = { GRILL: { salon: 0, delivery: 0 }, KITCHEN: { salon: 0, delivery: 0 }, BAR: { salon: 0, delivery: 0 } };
  orderItems.filter((i) => i.status === 'RECEIVED' || i.status === 'IN_PREPARATION').forEach((i) => {
    if (i.sector in production) production[i.sector as keyof typeof production].salon += i.quantity;
  });
  stages.IN_PRODUCTION.forEach((d) => d.items.forEach((i) => {
    if (i.sector in production) production[i.sector as keyof typeof production].delivery += i.quantity;
  }));
  const productionTotal = Object.values(production).reduce((s, p) => s + p.salon + p.delivery, 0);
  const stuckJobs = jobs.filter((j) => (j.status === 'PENDING' || j.status === 'PRINTING') && now - new Date(j.created_at).getTime() > ALERT_LIMITS.printerStuckSeconds * 1000);
  const failedJobs = jobs.filter((j) => j.status === 'FAILED');

  // ---------------- Mais vendidos (casa + delivery + retirada) ----------------
  const sold = new Map<string, { name: string; qty: number; total: number; channels: Set<string> }>();
  const addSale = (id: string, name: string, qty: number, value: number, ch: string) => {
    const row = sold.get(id) ?? { name, qty: 0, total: 0, channels: new Set<string>() };
    row.qty += qty; row.total += value; row.channels.add(ch);
    sold.set(id, row);
  };
  shiftItems.forEach((i) => addSale(i.product_id, i.product_name, i.quantity, i.unit_price * i.quantity, 'Casa'));
  sales.forEach((d) => d.items.forEach((i) => addSale(i.product_id, i.product_name, i.quantity, i.unit_price * i.quantity, isPickup(d) ? 'Retirada' : 'Delivery')));
  const soldTotal = [...sold.values()].reduce((s, r) => s + r.total, 0);
  const topProducts = [...sold.values()].sort((a, b) => b.total - a.total).map((r) => ({ name: r.name, qty: r.qty, total: r.total, channels: [...r.channels].join(' · '), share: soldTotal > 0 ? (r.total / soldTotal) * 100 : 0 }));

  // ---------------- Perdas ----------------
  const losses = stockMovements
    .filter((m) => (!shiftId || m.shift_id === shiftId) && (m.movement_type === 'PERDA' || m.movement_type === 'DESCARTE'))
    .map((m) => ({ ...m, quantity: Math.abs(m.quantity) }));

  // ---------------- Alertas ----------------
  const alerts: DashboardAlert[] = [];
  const oldReady = readyItems.filter((i) => minutesSince(i.prepared_at ?? i.updated_at, now) >= ALERT_LIMITS.readyNotServed);
  const oldReadyUnits = oldReady.reduce((s, i) => s + i.quantity, 0);
  if (oldReadyUnits) alerts.push({ id: 'ready', tone: 'warning', target: 'tables', text: `${oldReadyUnits} ${oldReadyUnits === 1 ? 'item pronto esperando' : 'itens prontos esperando'} o garçom há ${readyOldest} min` });
  const oldGrill = grillItems.filter((i) => minutesSince(i.created_at, now) >= ALERT_LIMITS.grillTooLong);
  if (oldGrill.length) alerts.push({ id: 'grill', tone: 'warning', target: 'kds', text: `${oldGrill.length} ${oldGrill.length === 1 ? 'espeto na brasa' : 'espetos na brasa'} há mais de ${ALERT_LIMITS.grillTooLong} min` });
  if (lateDeliveries.length) alerts.push({ id: 'late', tone: 'danger', target: 'delivery', text: `${lateDeliveries.length} ${lateDeliveries.length === 1 ? 'delivery atrasado' : 'deliveries atrasados'} (mais de ${ALERT_LIMITS.deliveryLate} min): ${lateDeliveries.map((d) => `#${d.order_number}`).join(', ')}` });
  const oldPickups = pickupsWaiting.filter((d) => minutesSince(d.ready_at ?? d.created_at, now) >= ALERT_LIMITS.pickupWaiting);
  if (oldPickups.length) alerts.push({ id: 'pickup', tone: 'warning', target: 'delivery', text: `${oldPickups.length} ${oldPickups.length === 1 ? 'retirada pronta' : 'retiradas prontas'} esperando o cliente há mais de ${ALERT_LIMITS.pickupWaiting} min` });
  const pixSoon = stages.AWAITING_PAYMENT.filter((d) => d.pix_expires_at && new Date(d.pix_expires_at).getTime() - now <= ALERT_LIMITS.pixExpiring * 60000);
  if (pixSoon.length) alerts.push({ id: 'pix', tone: 'warning', target: 'delivery', text: `${pixSoon.length} ${pixSoon.length === 1 ? 'PIX vence' : 'PIX vencem'} em menos de ${ALERT_LIMITS.pixExpiring} min sem pagamento` });
  if (input.printerMonitored && (stuckJobs.length || failedJobs.length)) alerts.push({ id: 'printer', tone: 'danger', target: 'settings', text: failedJobs.length ? `${failedJobs.length} ${failedJobs.length === 1 ? 'cupom falhou' : 'cupons falharam'} na impressão` : `Impressora da loja sem responder: ${stuckJobs.length} ${stuckJobs.length === 1 ? 'cupom parado' : 'cupons parados'} há mais de 1 min` });
  if (input.botErrorAt && minutesSince(input.botErrorAt, now) <= BOT_ERROR_WINDOW_MIN) {
    const at = new Date(input.botErrorAt);
    alerts.push({ id: 'bot', tone: 'danger', target: 'settings', text: `Robô do WhatsApp com falha (última às ${pad2(at.getHours())}:${pad2(at.getMinutes())}): clientes estão sendo passados para atendente. Confira a chave do Gemini.` });
  }
  if (waitingBill.length) alerts.push({ id: 'bill', tone: 'warning', target: 'cashier', text: `${waitingBill.map((t) => `Mesa ${pad2(t.number)}`).join(', ')} ${waitingBill.length === 1 ? 'pediu' : 'pediram'} a conta` });

  // ---------------- Movimentações do turno ----------------
  const feed: ActivityEvent[] = [];
  shiftTabs.forEach((tab) => {
    feed.push({ id: `tab-${tab.id}`, time: tab.opened_at, channel: 'Casa', tone: 'success', title: `Comanda aberta · ${tableNumber(tab.table_id)}`, description: `${tab.customer_name || 'Sem nome'} · ${tab.people_count} ${tab.people_count === 1 ? 'pessoa' : 'pessoas'}` });
    if (tab.status === 'CLOSED' && tab.closed_at) feed.push({ id: `tabc-${tab.id}`, time: tab.closed_at, channel: 'Casa', tone: 'neutral', title: `Comanda encerrada · ${tableNumber(tab.table_id)}`, description: `Total ${formatBRL(tab.total)}` });
  });
  orders.filter(inShift).forEach((order) => {
    const items = (order.items?.length ? order.items : orderItems.filter((i) => i.order_id === order.id));
    feed.push({ id: `ord-${order.id}`, time: order.created_at, channel: 'Casa', tone: 'warning', title: `Pedido #${order.order_number} · ${tableNumber(order.table_id)}`, description: items.map((i) => `${i.quantity}x ${i.product_name}`).join(', ') || 'Itens lançados' });
  });
  payments.filter((p) => p.paid_at && (!shiftId || p.shift_id === shiftId || !p.shift_id)).forEach((p) => {
    feed.push({ id: `pay-${p.id}`, time: p.paid_at, channel: 'Casa', tone: 'success', title: 'Pagamento recebido', description: `${formatBRL(p.amount)} · ${p.method === 'CREDITO' ? 'crédito' : p.method === 'DEBITO' ? 'débito' : p.method === 'DINHEIRO' ? 'dinheiro' : 'PIX'}` });
  });
  shiftDeliveries.forEach((d) => {
    const ch = isPickup(d) ? 'Retirada' : 'Delivery';
    const items = d.items.map((i) => `${i.quantity}x ${i.product_name}`).join(', ');
    feed.push({ id: `dl-${d.id}`, time: d.created_at, channel: ch, tone: 'info', title: `${deliveryLabel(d)} ${isPickup(d) ? 'recebida' : 'recebido'}`, description: `${d.customer_name} · ${items}` });
    if (d.dispatched_at) feed.push({ id: `dls-${d.id}`, time: d.dispatched_at, channel: ch, tone: 'info', title: `${deliveryLabel(d)} saiu para entrega`, description: d.driver_name ? `Entregador: ${d.driver_name}` : d.customer_name });
    if (d.delivered_at) feed.push({ id: `dld-${d.id}`, time: d.delivered_at, channel: ch, tone: 'success', title: `${deliveryLabel(d)} ${isPickup(d) ? 'retirada pelo cliente' : 'entregue'}`, description: d.customer_name });
    if (d.status === 'CANCELLED' && d.cancelled_at) feed.push({ id: `dlx-${d.id}`, time: d.cancelled_at, channel: ch, tone: 'danger', title: `${deliveryLabel(d)} ${isPickup(d) ? 'cancelada' : 'cancelado'}`, description: d.cancel_reason || d.customer_name });
  });
  losses.forEach((m) => feed.push({ id: `loss-${m.id}`, time: m.created_at, channel: 'Sistema', tone: 'danger', title: `${m.movement_type === 'PERDA' ? 'Perda' : 'Descarte'}: ${m.product_name || 'produto'}`, description: `${m.quantity} un · ${m.reason || 'Sem motivo'}` }));
  feed.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return {
    salon: { openTabs, closedTabs, people, waitingBill, readyCount: readyItems.reduce((s, i) => s + i.quantity, 0), readyOldest, grillCount: grillItems.reduce((s, i) => s + i.quantity, 0), grillOldest, closed: salonClosed, open: salonOpen, avgTicket: salonTabsCount ? (salonClosed + salonOpen) / salonTabsCount : 0, avgPerPerson: salonPeople ? (salonClosed + salonOpen) / salonPeople : 0, serviceFee, discounts },
    tabInfo,
    delivery, pickup, stages, lateDeliveries, pickupsWaiting,
    revenue: { realized, inProgress, projected, fees: delivery.fees },
    received, receivedTotal,
    production, productionTotal, stuckJobs, failedJobs,
    topProducts, losses, alerts, feed,
    minutesSince: (iso: string | null | undefined) => minutesSince(iso, now),
  };
}

export type DashboardData = ReturnType<typeof computeDashboard>;
