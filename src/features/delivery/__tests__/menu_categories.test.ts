import { productFlavors } from '../../../lib/productAvailability';
import { describe, expect, it } from 'vitest';
import type { Product } from '../../../types/domain';
import { categoryOf, comboNotes, parseComboNotes } from '../PublicMenuApp';

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

describe('observação do combo', () => {
  it('junta arroz, o que saiu e o texto do cliente', () => {
    expect(comboNotes('Baião de Dois', ['Farofa', 'Purê'], ' pouco sal ')).toBe('Baião de Dois, Sem farofa, Sem purê, pouco sal');
    expect(comboNotes(null, [], '')).toBe('');
  });
});

describe('editar item da sacola', () => {
  it('recupera arroz, o que saiu e a observação', () => {
    expect(parseComboNotes('Baião de Dois, Sem farofa, pouco sal', ['Baião de Dois'])).toEqual({ rice: 'Baião de Dois', removed: ['Farofa'], notes: 'pouco sal' });
    expect(parseComboNotes('', [])).toEqual({ rice: null, removed: [], notes: '' });
  });
});

describe('sabores do produto', () => {
  it('lê os sabores da descrição', () => {
    expect(productFlavors('Sabores: Coca-Cola, Guaraná e Fanta')).toEqual(['Coca-Cola', 'Guaraná', 'Fanta']);
    expect(productFlavors('Lata 350ml gelada')).toEqual([]);
    expect(productFlavors(null)).toEqual([]);
  });
});
