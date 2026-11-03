import { describe, expect, it } from 'vitest';
import { pairCombos } from '../comboStock';
import type { Product } from '../../types/domain';

const p = (id: string, name: string) => ({ id, name, active: true }) as Product;
const base = p('b', 'Coração de frango');
const combo = p('c', 'Coração de frango com acompanhamento');
const solo = p('s', 'Batata frita');
const orphan = p('o', 'Pão de alho com acompanhamento');
const all = [base, combo, solo, orphan];

describe('um cartão por espeto no garçom', () => {
  it('junta espeto e combo, sem repetir', () => {
    expect(pairCombos([base, combo], all)).toEqual([{ product: base, combo }]);
    expect(pairCombos([combo, base], all)).toEqual([{ product: base, combo }]);
  });
  it('lista só com o combo (busca ou mais pedidos) mostra as duas opções', () => {
    expect(pairCombos([combo], all)).toEqual([{ product: base, combo }]);
  });
  it('item sem par continua sozinho', () => {
    expect(pairCombos([solo], all)).toEqual([{ product: solo, combo: null }]);
    expect(pairCombos([orphan], all)).toEqual([{ product: orphan, combo: null }]);
  });
});
