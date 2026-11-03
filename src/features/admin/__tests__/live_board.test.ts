import { deliveryColumn } from '../LiveBoard';
import { describe, expect, it } from 'vitest';
import { tabColumn } from '../LiveBoard';

describe('Visão geral: coluna de cada mesa', () => {
  it('mesa com espeto pendente fica na brasa; sem espeto continua visível em preparo', () => {
    expect(tabColumn([{ sector: 'GRILL', status: 'IN_PREPARATION' }])).toBe('grill');
    expect(tabColumn([{ sector: 'GRILL', status: 'DELIVERED' }])).toBe('preparing');
    expect(tabColumn([])).toBe('preparing');
  });
});

describe('coluna dos pedidos do cardápio', () => {
  const order = (order_type: 'DELIVERY' | 'PICKUP', notes: string | null, status: string, sector: string) => ({ order_type, notes, status, items: [{ sector }] }) as never;
  it('entrega e retirada ficam em Delivery; consumir no local segue o salão', () => {
    expect(deliveryColumn(order('DELIVERY', null, 'PREPARING', 'GRILL'))).toBe('delivery');
    expect(deliveryColumn(order('PICKUP', null, 'PREPARING', 'GRILL'))).toBe('delivery');
    expect(deliveryColumn(order('PICKUP', 'CONSUMIR NO LOCAL', 'PREPARING', 'GRILL'))).toBe('grill');
    expect(deliveryColumn(order('PICKUP', 'CONSUMIR NO LOCAL', 'PREPARING', 'KITCHEN'))).toBe('preparing');
    expect(deliveryColumn(order('PICKUP', 'CONSUMIR NO LOCAL', 'READY', 'GRILL'))).toBe('preparing');
  });
});
