// Contas do pagamento dos motoboys: cada entrega concluída soma no motoboy até ser paga.

export interface PayoutOrder {
  id: string;
  order_number: number;
  customer_name: string;
  address_neighborhood?: string | null;
  driver_name: string | null;
  delivery_fee: number;
  status: string;
  shift_id: string;
  created_at: string;
  dispatched_at?: string | null;
  delivered_at?: string | null;
}

export interface PayoutRecord {
  id: string;
  shift_id: string;
  driver_name: string;
  total: number;
  created_at: string;
  paid_at: string | null;
  /** JSON com { order_ids: [...] }: marca quais entregas este pagamento quitou. */
  notes?: string | null;
}

export interface PayoutRates {
  /** Valor combinado por entrega. Zero = usa a taxa de entrega de cada pedido. */
  perDelivery: number;
  /** Valor fixo por turno trabalhado. */
  fixedPerShift: number;
}

export type DeliveryPayState = 'TO_PAY' | 'PAID' | 'ON_ROUTE';
export interface DriverDelivery { order: PayoutOrder; value: number; state: DeliveryPayState }
export interface DriverSummary {
  key: string;
  name: string;
  /** Sem nome no pedido não dá para saber quem recebe. */
  named: boolean;
  deliveries: DriverDelivery[];
  toPayCount: number;
  deliveriesValue: number;
  fixedDue: number;
  total: number;
  paidTotal: number;
}

const roundCents = (value: number) => Math.round(value * 100) / 100;
const NO_DRIVER = 'sem-nome';

/** "Gui" e " gui " são o mesmo motoboy. */
export function driverKey(name: string | null | undefined): string {
  const clean = (name ?? '').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '');
  return clean || NO_DRIVER;
}

export function paidOrderIds(records: PayoutRecord[]): Set<string> {
  const ids = new Set<string>();
  records.filter((r) => r.paid_at && r.notes).forEach((r) => {
    try {
      const parsed = JSON.parse(r.notes!) as { order_ids?: string[] };
      (parsed.order_ids ?? []).forEach((id) => ids.add(id));
    } catch { /* observação antiga, sem entregas ligadas */ }
  });
  return ids;
}

export const deliveryValue = (order: Pick<PayoutOrder, 'delivery_fee'>, rates: PayoutRates) =>
  rates.perDelivery > 0 ? rates.perDelivery : Number(order.delivery_fee) || 0;

export function summarizeDrivers(orders: PayoutOrder[], records: PayoutRecord[], rates: PayoutRates): DriverSummary[] {
  const paid = paidOrderIds(records);
  const groups = new Map<string, PayoutOrder[]>();
  orders.filter((o) => o.status === 'DELIVERED' || o.status === 'OUT_FOR_DELIVERY').forEach((o) => {
    const key = driverKey(o.driver_name);
    groups.set(key, [...(groups.get(key) ?? []), o]);
  });
  return [...groups.entries()].map(([key, list]) => {
    const deliveries: DriverDelivery[] = [...list]
      .sort((a, b) => (b.delivered_at ?? b.created_at).localeCompare(a.delivered_at ?? a.created_at))
      .map((order) => ({
        order,
        value: deliveryValue(order, rates),
        state: paid.has(order.id) ? 'PAID' : order.status === 'DELIVERED' ? 'TO_PAY' : 'ON_ROUTE',
      }));
    const toPay = deliveries.filter((d) => d.state === 'TO_PAY');
    const mine = records.filter((r) => driverKey(r.driver_name) === key);
    // O fixo entra uma vez por turno: turno já pago a este motoboy não cobra de novo
    const shiftsDue = new Set(toPay.map((d) => d.order.shift_id).filter((id) => !mine.some((r) => r.paid_at && r.shift_id === id)));
    const deliveriesValue = roundCents(toPay.reduce((sum, d) => sum + d.value, 0));
    const fixedDue = roundCents(shiftsDue.size * rates.fixedPerShift);
    return {
      key,
      name: list.find((o) => o.driver_name?.trim())?.driver_name?.trim() ?? 'Sem nome no pedido',
      named: key !== NO_DRIVER,
      deliveries,
      toPayCount: toPay.length,
      deliveriesValue,
      fixedDue,
      total: roundCents(deliveriesValue + fixedDue),
      paidTotal: roundCents(mine.filter((r) => r.paid_at).reduce((sum, r) => sum + Number(r.total), 0)),
    };
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'));
}

/** Linhas gravadas ao pagar: uma por turno, para o Financeiro contar a saída no dia certo. */
export function payoutRows(summary: DriverSummary, records: PayoutRecord[], rates: PayoutRates, paidAt: string) {
  const byShift = new Map<string, DriverDelivery[]>();
  summary.deliveries.filter((d) => d.state === 'TO_PAY').forEach((d) => {
    byShift.set(d.order.shift_id, [...(byShift.get(d.order.shift_id) ?? []), d]);
  });
  return [...byShift.entries()].map(([shiftId, list]) => {
    const value = roundCents(list.reduce((sum, d) => sum + d.value, 0));
    const fixed = records.some((r) => r.paid_at && r.shift_id === shiftId && driverKey(r.driver_name) === summary.key) ? 0 : rates.fixedPerShift;
    return {
      shift_id: shiftId,
      driver_name: summary.name,
      deliveries_count: list.length,
      per_delivery_rate: roundCents(value / list.length),
      fuel_fixed: fixed,
      total: roundCents(value + fixed),
      paid_at: paidAt,
      notes: JSON.stringify({ order_ids: list.map((d) => d.order.id) }),
    };
  });
}
