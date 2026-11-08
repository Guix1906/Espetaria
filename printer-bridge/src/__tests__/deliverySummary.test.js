import { describe, expect, it } from 'vitest';
import { deliverySummarySector } from '../worker.js';

describe('via de conferência e entrega', () => {
  it('delivery com espeto sai na churrasqueira', () => {
    expect(deliverySummarySector('DELIVERY', ['GRILL', 'BAR'])).toBe('GRILL');
  });
  it('delivery só com cozinha/bar sai na cozinha', () => {
    expect(deliverySummarySector('DELIVERY', ['KITCHEN'])).toBe('KITCHEN');
    expect(deliverySummarySector(undefined, ['BAR', 'KITCHEN'])).toBe('KITCHEN');
  });
  it('retirada no balcão também imprime conferência', () => {
    expect(deliverySummarySector('PICKUP', ['GRILL'])).toBe('GRILL');
    expect(deliverySummarySector('PICKUP', ['KITCHEN'])).toBe('KITCHEN');
  });
  it('sem saber os itens, vai para a churrasqueira', () => {
    expect(deliverySummarySector('DELIVERY', [])).toBe('GRILL');
  });
});
