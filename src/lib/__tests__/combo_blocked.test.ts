import { describe, expect, it } from 'vitest';
import type { DailyPrepStock, Product } from '../../types/domain';
import { comboBlockedByBase } from '../comboStock';

const product = (id: string, name: string, available = true) => ({ id, name, active: true, available, tracks_stock: true }) as Product;
const stock = (id: string, current_quantity: number) => ({ product_id: id, current_quantity, is_exhausted: false }) as DailyPrepStock;
const base = product('b', 'Frango');
const combo = product('c', 'Frango com acompanhamento');

describe('combo depende do espeto', () => {
  it('bloqueia sem saldo do espeto ou com ele pausado', () => {
    expect(comboBlockedByBase(combo, [base, combo], [])).toBe(true);
    expect(comboBlockedByBase(combo, [base, combo], [stock('b', 0)])).toBe(true);
    expect(comboBlockedByBase(combo, [product('b', 'Frango', false), combo], [stock('b', 3)])).toBe(true);
  });
  it('libera com saldo, sem espeto cadastrado e em produto comum', () => {
    expect(comboBlockedByBase(combo, [base, combo], [stock('b', 3)])).toBe(false);
    expect(comboBlockedByBase(combo, [combo], [])).toBe(false);
    expect(comboBlockedByBase(base, [base, combo], [])).toBe(false);
  });
});
