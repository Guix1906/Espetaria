import { describe, expect, it } from 'vitest';
import type { DailyPrepStock, Product } from '../../types/domain';
import { comboBlockedByBase, remainingFor } from '../comboStock';

// Pedido do dono (22/11): espeto é espeto, saia sozinho ou com acompanhamento — o saldo é um só.
const p = (id: string, name: string, over: Partial<Product> = {}) => ({ id, name, active: true, available: true, tracks_stock: true, ...over }) as Product;
const s = (product_id: string, current_quantity: number, is_exhausted = false) => ({ product_id, current_quantity, is_exhausted }) as DailyPrepStock;

const alcatra = p('a', 'Alcatra');
const combo = p('ac', 'Alcatra com acompanhamento');
const arroz = p('r', 'Arroz');
const products = [alcatra, combo, arroz];
const stocks = [s('a', 10), s('ac', 10), s('r', 30)];

describe('saldo único do espeto (sozinho ou com acompanhamento)', () => {
  it('10 alcatras: 6 sozinhas + 4 com acompanhamento no pedido esgotam as duas opções', () => {
    const cart = [{ product: alcatra, quantity: 6 }, { product: combo, quantity: 4 }];
    expect(remainingFor(alcatra, products, stocks, cart)).toBe(0);
    expect(remainingFor(combo, products, stocks, cart)).toBe(0);
  });

  it('combo no rascunho também desconta do espeto sozinho', () => {
    const cart = [{ product: combo, quantity: 7 }];
    expect(remainingFor(alcatra, products, stocks, cart)).toBe(3);
    expect(remainingFor(combo, products, stocks, cart)).toBe(3);
  });

  it('espeto bloqueado ou zerado bloqueia também o com acompanhamento', () => {
    const blocked = [s('a', 10, true), s('ac', 10), s('r', 30)];
    expect(remainingFor(combo, products, blocked, [])).toBe(0);
    expect(comboBlockedByBase(combo, products, blocked)).toBe(true);
    const zero = [s('a', 0), s('ac', 10), s('r', 30)];
    expect(remainingFor(combo, products, zero, [])).toBe(0);
    expect(comboBlockedByBase(combo, products, zero)).toBe(true);
  });

  it('sem arroz, só o com acompanhamento para; o espeto sozinho continua', () => {
    const noRice = [s('a', 10), s('ac', 10), s('r', 0)];
    expect(remainingFor(combo, products, noRice, [])).toBe(0);
    expect(remainingFor(alcatra, products, noRice, [])).toBe(10);
  });
});
