import { describe, expect, it } from 'vitest';
import { driverKey, paidOrderIds, payoutRows, summarizeDrivers, type PayoutOrder, type PayoutRecord } from '../driverPayouts';

const order = (id: string, driver: string | null, fee = 6, status = 'DELIVERED', shift = 's1'): PayoutOrder => ({
  id, order_number: 1, customer_name: 'Cliente', driver_name: driver, delivery_fee: fee, status, shift_id: shift, created_at: '2026-11-03T20:00:00Z',
});
const noRates = { perDelivery: 0, fixedPerShift: 0 };

describe('pagamento dos motoboys', () => {
  it('soma a taxa de cada entrega e junta nomes escritos diferente', () => {
    const [gui] = summarizeDrivers([order('a', 'Gui'), order('b', ' gui '), order('c', 'GUI', 8)], [], noRates);
    expect(driverKey('Jõao ')).toBe('joao');
    expect(gui!.toPayCount).toBe(3);
    expect(gui!.total).toBe(20);
  });

  it('valor combinado por entrega substitui a taxa', () => {
    const [gui] = summarizeDrivers([order('a', 'Gui', 6), order('b', 'Gui', 8)], [], { perDelivery: 5, fixedPerShift: 0 });
    expect(gui!.total).toBe(10);
  });

  it('fixo entra uma vez por turno e em rota ainda não soma', () => {
    const [gui] = summarizeDrivers([order('a', 'Gui'), order('b', 'Gui'), order('c', 'Gui', 6, 'DELIVERED', 's2'), order('d', 'Gui', 6, 'OUT_FOR_DELIVERY')], [], { perDelivery: 0, fixedPerShift: 10 });
    expect(gui!.toPayCount).toBe(3);
    expect(gui!.deliveriesValue).toBe(18);
    expect(gui!.fixedDue).toBe(20);
    expect(gui!.deliveries.filter((d) => d.state === 'ON_ROUTE')).toHaveLength(1);
  });

  it('pagar quita só as entregas concluídas, uma linha por turno, sem pagar duas vezes', () => {
    const orders = [order('a', 'Gui'), order('b', 'Gui', 6, 'DELIVERED', 's2'), order('d', 'Gui', 6, 'OUT_FOR_DELIVERY')];
    const rates = { perDelivery: 0, fixedPerShift: 10 };
    const [before] = summarizeDrivers(orders, [], rates);
    const rows = payoutRows(before!, [], rates, '2026-11-03T23:00:00Z');
    expect(rows.map((r) => r.total).sort()).toEqual([16, 16]);
    const records: PayoutRecord[] = rows.map((r, i) => ({ ...r, id: `p${i}`, created_at: r.paid_at }));
    expect([...paidOrderIds(records)].sort()).toEqual(['a', 'b']);
    const [after] = summarizeDrivers(orders, records, rates);
    expect(after!.total).toBe(0);
    expect(after!.paidTotal).toBe(32);
    expect(after!.toPayCount).toBe(0);
  });

  it('entrega nova no turno já pago soma a entrega, sem repetir o fixo', () => {
    const rates = { perDelivery: 0, fixedPerShift: 10 };
    const records: PayoutRecord[] = [{ id: 'p', shift_id: 's1', driver_name: 'Gui', total: 16, created_at: 'x', paid_at: 'x', notes: '{"order_ids":["a"]}' }];
    const [gui] = summarizeDrivers([order('a', 'Gui'), order('b', 'Gui')], records, rates);
    expect(gui!.total).toBe(6);
    expect(payoutRows(gui!, records, rates, 'x')[0]!.fuel_fixed).toBe(0);
  });

  it('entrega sem nome aparece, mas fica marcada', () => {
    const [none] = summarizeDrivers([order('a', null)], [], noRates);
    expect(none!.named).toBe(false);
  });
});
