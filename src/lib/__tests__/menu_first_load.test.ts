import { describe, expect, it } from 'vitest';
import { getProductAvailability } from '../productAvailability';
import { isPublicRoute } from '../pwaUpdate';
import type { DailyPrepStock, Product } from '../../types/domain';

const product = (over: Partial<Product>) => ({ id: 'p', name: 'Espeto com acompanhamento', active: true, available: true, tracks_stock: true, ...over }) as Product;
const stock = (over: Partial<DailyPrepStock>) => ({ product_id: 'p', current_quantity: 24, is_exhausted: false, ...over }) as DailyPrepStock;

describe('primeira abertura do cardápio', () => {
  it('telas do cliente não instalam o sistema', () => {
    expect(isPublicRoute('/cardapio', '')).toBe(true);
    expect(isPublicRoute('/cardapio/', '')).toBe(true);
    expect(isPublicRoute('/', '#/cardapio')).toBe(true);
    expect(isPublicRoute('/', '#/mesa/abc')).toBe(true);
    expect(isPublicRoute('/', '#/pedido/abc')).toBe(true);
    expect(isPublicRoute('/', '#/garcom')).toBe(false);
    expect(isPublicRoute('/', '')).toBe(false);
  });
});

describe('disponibilidade no garçom', () => {
  it('combo com saldo no turno não fica esgotado por marca antiga do cadastro', () => {
    expect(getProductAvailability(product({ available: false }), stock({})).isAvailable).toBe(true);
  });
  it('item comum indisponível no cadastro continua indisponível, mesmo com saldo', () => {
    expect(getProductAvailability(product({ name: 'Picanha', available: false }), stock({})).isAvailable).toBe(false);
  });
  it('bloqueio da gerência e saldo zerado continuam valendo', () => {
    expect(getProductAvailability(product({}), stock({ is_exhausted: true })).isAvailable).toBe(false);
    expect(getProductAvailability(product({}), stock({ current_quantity: 0 })).isAvailable).toBe(false);
  });
  it('sem saldo no turno ou sem controle de estoque, vale o cadastro', () => {
    expect(getProductAvailability(product({ available: false })).isAvailable).toBe(false);
    expect(getProductAvailability(product({ available: false, tracks_stock: false }), stock({})).isAvailable).toBe(false);
    expect(getProductAvailability(product({ active: false }), stock({})).isAvailable).toBe(false);
  });
});
