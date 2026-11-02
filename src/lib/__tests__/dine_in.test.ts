import { describe, expect, it } from 'vitest';
import { DINE_IN_NOTE, isDineInOrder, localOrderLabel, orderKind } from '../deliveryStatus';

describe('consumir no local', () => {
  it('reconhece a marca gravada na observação', () => {
    expect(isDineInOrder({ notes: DINE_IN_NOTE })).toBe(true);
    expect(localOrderLabel({ notes: DINE_IN_NOTE })).toBe('Consumir no local');
  });
  it('retirada comum continua retirada', () => {
    expect(isDineInOrder({ notes: null })).toBe(false);
    expect(localOrderLabel({ notes: 'Sem cebola' })).toBe('Retirada');
  });
});

describe('tipo do pedido', () => {
  it('separa entrega, consumir e retirada', () => {
    expect(orderKind({ order_type: 'DELIVERY', notes: null })).toBe('DELIVERY');
    expect(orderKind({ order_type: 'PICKUP', notes: DINE_IN_NOTE })).toBe('DINE_IN');
    expect(orderKind({ order_type: 'PICKUP', notes: null })).toBe('PICKUP');
  });
});
