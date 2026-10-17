import { describe, expect, it } from 'vitest';
import { computeDashboard, type DashboardInput } from '../dashboardMetrics';
import type { DeliveryOrder, OrderItem, Payment, RestaurantTable, Tab } from '../../../types/domain';

const NOW = new Date('2026-10-15T21:00:00Z').getTime();
const ago = (min: number) => new Date(NOW - min * 60000).toISOString();
const table = (id: string, number: number, status: RestaurantTable['status'] = 'OCUPADA') => ({ id, number, status, active: true }) as RestaurantTable;
const tab = (id: string, table_id: string, status: Tab['status'], subtotal: number, people = 2) => ({ id, table_id, shift_id: 's1', status, subtotal, service_fee: subtotal * 0.1, discount: 0, total: subtotal * 1.1, people_count: people, customer_name: null, opened_at: ago(60), closed_at: status === 'CLOSED' ? ago(5) : null }) as Tab;
const delivery = (id: string, status: DeliveryOrder['status'], subtotal: number, extra: Partial<DeliveryOrder> = {}) => ({
  id, order_number: Number(id.replace(/\D/g, '')) || 1, shift_id: 's1', order_type: 'DELIVERY', customer_name: 'Cliente', status, subtotal, delivery_fee: 5, total: subtotal + 5,
  payment_method: 'PIX', created_at: ago(10), items: [{ id: `${id}-i`, delivery_order_id: id, product_id: 'p1', product_name: 'Picanha', unit_price: subtotal, quantity: 1, doneness: null, notes: null, sector: 'GRILL' }],
  address_neighborhood: 'Centro', ...extra,
}) as DeliveryOrder;

const base = (over: Partial<DashboardInput>): DashboardInput => ({ shiftId: 's1', tables: [], tabs: [], orders: [], orderItems: [], payments: [], deliveryOrders: [], stockMovements: [], jobs: [], printerMonitored: false, now: NOW, ...over });

describe('Visão geral: números do turno', () => {
  it('soma delivery pago ou entregue no realizado e o resto em andamento', () => {
    const d = computeDashboard(base({
      tables: [table('t1', 1), table('t2', 2, 'LIVRE')],
      tabs: [tab('a', 't1', 'OPEN', 100), tab('b', 't2', 'CLOSED', 50)],
      payments: [{ id: 'p', tab_id: 'b', shift_id: 's1', amount: 55, method: 'DEBITO', status: 'PAID', paid_at: ago(5) } as Payment],
      deliveryOrders: [
        delivery('d1', 'DELIVERED', 40),
        delivery('d2', 'OUT_FOR_DELIVERY', 30, { paid_at: ago(8) }),
        delivery('d3', 'PREPARING', 20, { payment_method: 'CARTAO_ENTREGA' }),
        delivery('d4', 'AWAITING_PAYMENT', 99),
        delivery('d5', 'CANCELLED', 70),
        delivery('d6', 'READY', 10, { order_type: 'PICKUP', payment_method: 'DINHEIRO' }),
      ],
    }));
    expect(d.revenue.realized).toBe(50 + 40 + 30);
    expect(d.revenue.inProgress).toBe(100 + 20 + 10);
    expect(d.delivery.count).toBe(3);
    expect(d.pickup.count).toBe(1);
    // Ticket do salão não mistura delivery
    expect(d.salon.avgTicket).toBe(75);
    // Cartão na entrega não vira "crédito"; PIX aguardando não entra
    expect(d.received.CREDITO).toBe(0);
    expect(d.received.CARTAO_ENTREGA).toBe(0);
    expect(d.received.PIX).toBe(45 + 35);
    expect(d.received.DEBITO).toBe(55);
    expect(d.stages.AWAITING_PAYMENT).toHaveLength(1);
    expect(d.stages.IN_PRODUCTION).toHaveLength(1);
    // Produção conta espeto de delivery em preparo
    expect(d.production.GRILL.delivery).toBe(1);
    // % dos mais vendidos fecha em 100
    expect(d.topProducts.reduce((s, p) => s + p.share, 0)).toBeCloseTo(100);
  });

  it('gera alertas de delivery atrasado, prato parado e conta pedida', () => {
    const items = [{ id: 'i1', order_id: 'o1', shift_id: 's1', product_id: 'p', product_name: 'Picanha', unit_price: 50, quantity: 2, status: 'READY', sector: 'GRILL', created_at: ago(20), prepared_at: ago(9), updated_at: ago(9) } as OrderItem];
    const d = computeDashboard(base({
      tables: [table('t1', 3, 'AGUARDANDO_CONTA')],
      orderItems: items,
      deliveryOrders: [delivery('d7', 'PREPARING', 30, { created_at: ago(50) })],
    }));
    const ids = d.alerts.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['ready', 'late', 'bill']));
    expect(d.alerts.find((a) => a.id === 'late')?.text).toContain('#7');
    expect(ids).not.toContain('printer');
  });

  it('mostra perdas sem sinal de menos', () => {
    const d = computeDashboard(base({ stockMovements: [{ id: 'm', shift_id: 's1', product_id: 'p', quantity: -2, movement_type: 'PERDA', created_at: ago(1) } as never] }));
    expect(d.losses[0]?.quantity).toBe(2);
  });
});
