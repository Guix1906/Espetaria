import { describe, expect, it } from 'vitest';
import { tabColumn } from '../LiveBoard';

describe('Visão geral: coluna de cada mesa', () => {
  it('mesa com espeto pendente fica na brasa; sem espeto continua visível em preparo', () => {
    expect(tabColumn([{ sector: 'GRILL', status: 'IN_PREPARATION' }])).toBe('grill');
    expect(tabColumn([{ sector: 'GRILL', status: 'DELIVERED' }])).toBe('preparing');
    expect(tabColumn([])).toBe('preparing');
  });
});
