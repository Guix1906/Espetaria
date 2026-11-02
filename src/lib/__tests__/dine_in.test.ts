import { describe, expect, it } from 'vitest';
import { DINE_IN_NOTE, isDineInOrder, localOrderLabel } from '../deliveryStatus';

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
