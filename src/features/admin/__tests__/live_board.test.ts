import { describe, expect, it } from 'vitest';
import type { DeliveryOrder } from '../../../types/domain';
import { deliveryColumn, tabColumn } from '../LiveBoard';

const order = (status: DeliveryOrder['status'], sector: string) => ({ status, items: [{ sector }] }) as unknown as Pick<DeliveryOrder, 'status' | 'items'>;

describe('Visão geral: coluna de cada pedido', () => {
  it('mesa com espeto pendente fica na brasa; sem espeto continua visível em preparo', () => {
    expect(tabColumn([{ sector: 'GRILL', status: 'IN_PREPARATION' }])).toBe('grill');
    expect(tabColumn([{ sector: 'GRILL', status: 'DELIVERED' }])).toBe('preparing');
    expect(tabColumn([])).toBe('preparing');
  });

  it('delivery anda pelas colunas conforme o status', () => {
    expect(deliveryColumn(order('AWAITING_PAYMENT', 'GRILL'))).toBe('preparing');
    expect(deliveryColumn(order('PREPARING', 'GRILL'))).toBe('grill');
    expect(deliveryColumn(order('PREPARING', 'KITCHEN'))).toBe('preparing');
    expect(deliveryColumn(order('READY', 'GRILL'))).toBe('delivery');
    expect(deliveryColumn(order('OUT_FOR_DELIVERY', 'GRILL'))).toBe('delivery');
  });
});
