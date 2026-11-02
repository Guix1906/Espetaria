import { describe, expect, it } from 'vitest';
import type { Product } from '../../../types/domain';
import { categoryOf } from '../PublicMenuApp';

const drink = (name: string, description?: string) => categoryOf({ type: 'BEBIDA', name, description } as Product);

describe('grupos de bebidas do cardápio', () => {
  it('bebida com álcool na descrição não fica em Sem álcool', () => {
    expect(drink('Lagoa azul', 'Vodka Smirnoff, curaçau blue, limão taiti e Sprite')).toBe('Drinks e doses');
    expect(drink('Caipiveja', 'Cerveja, vodka Smirnoff, limão taiti')).toBe('Drinks e doses');
  });
  it('mantém cervejas e bebidas sem álcool', () => {
    expect(drink('Skol 600ml')).toBe('Cervejas');
    expect(drink('Refrigerante lata')).toBe('Sem álcool');
    expect(drink('Soda italiana morango')).toBe('Sem álcool');
  });
});
