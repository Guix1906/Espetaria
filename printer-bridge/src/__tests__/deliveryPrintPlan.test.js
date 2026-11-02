import { describe, expect, it } from 'vitest';
import { deliveryPrintPlan } from '../worker.js';

const row = (sector, product_name) => ({ sector, product_name, quantity: 1, unit_price: 10, doneness: null, notes: null });
const job = (sector, extra = {}) => ({ kind: 'ORDER', origin: 'DELIVERY', sector, items: [{ name: 'do setor' }], ...extra });

describe('cupom único do delivery', () => {
  const rows = [row('GRILL', 'Picanha'), row('BAR', 'Refrigerante')];

  it('churrasqueira imprime o pedido inteiro, com a bebida', () => {
    const plan = deliveryPrintPlan(job('GRILL'), rows);
    expect(plan.skip).toBe(false);
    expect(plan.items.map((i) => i.name)).toEqual(['Picanha', 'Refrigerante']);
  });
  it('bebida não sai separada', () => {
    expect(deliveryPrintPlan(job('BAR'), rows).skip).toBe(true);
  });
  it('cozinha de pedido com espeto continua recebendo só o dela', () => {
    const plan = deliveryPrintPlan(job('KITCHEN'), [...rows, row('KITCHEN', 'Porção')]);
    expect(plan.skip).toBe(false);
    expect(plan.items).toEqual([{ name: 'do setor' }]);
  });
  it('pedido sem espeto sai inteiro na cozinha', () => {
    const list = [row('KITCHEN', 'Porção'), row('BAR', 'Refrigerante')];
    expect(deliveryPrintPlan(job('KITCHEN'), list).items).toHaveLength(2);
    expect(deliveryPrintPlan(job('BAR'), list).skip).toBe(true);
  });
  it('pedido só de bebida ainda imprime', () => {
    expect(deliveryPrintPlan(job('BAR'), [row('BAR', 'Refrigerante')]).skip).toBe(false);
  });
  it('sem conseguir ler os itens, ou em 2ª via, imprime como veio', () => {
    expect(deliveryPrintPlan(job('BAR'), null).skip).toBe(false);
    expect(deliveryPrintPlan(job('BAR', { is_reprint: true }), rows).skip).toBe(false);
  });
  it('salão não muda', () => {
    expect(deliveryPrintPlan(job('BAR', { origin: 'SALON' }), rows).skip).toBe(false);
  });
});
