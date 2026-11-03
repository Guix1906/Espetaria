import { describe, expect, it } from 'vitest';
import type { Product } from '../../../types/domain';
import { isEspetoProduct, isPorcaoProduct } from '../WaiterOrderPad';

const p = (name: string, type: string, sector: string) => ({ name, type, sector }) as Product;

describe('abas do garçom', () => {
  it('Espetos mostra só os de carne, com ou sem acompanhamento', () => {
    expect(isEspetoProduct(p('Picanha', 'ESPETO', 'GRILL'), 'Espetos sem acompanhamento')).toBe(true);
    expect(isEspetoProduct(p('Picanha com acompanhamento', 'ESPETO', 'GRILL'), 'Espetos com acompanhamento')).toBe(true);
  });
  it('queijo, pão de alho e cebola saem de Espetos e entram em Porções', () => {
    for (const item of [p('Espeto de queijo', 'ESPETO', 'GRILL'), p('Espeto de pão de alho picante com queijo', 'ESPETO', 'GRILL'), p('Cebola assada', 'PORCAO', 'GRILL')]) {
      expect(isEspetoProduct(item, 'Entradas')).toBe(false);
      expect(isPorcaoProduct(item, 'Entradas')).toBe(true);
    }
  });
  it('bebida não vira porção', () => {
    expect(isPorcaoProduct(p('Long neck', 'BEBIDA', 'BAR'), 'Cervejas')).toBe(false);
  });
});
