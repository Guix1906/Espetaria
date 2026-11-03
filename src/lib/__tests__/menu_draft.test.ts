import { describe, expect, it } from 'vitest';
import { CART_DRAFT_MAX_AGE_MS, parseCartDraft, reconcileCart } from '../menuDraft';

const item = { id: 'l1', productId: 'p1', product: { id: 'p1', price: 10 } };

describe('sacola do cardápio ao recarregar a página', () => {
  it('volta dentro do prazo, com a mesma chave para não duplicar o pedido', () => {
    const raw = JSON.stringify({ cart: [item], checkoutKey: 'chave', savedAt: 1000 });
    expect(parseCartDraft(raw, 2000)).toMatchObject({ checkoutKey: 'chave', cart: [item] });
  });
  it('sacola antiga, vazia ou quebrada é descartada', () => {
    expect(parseCartDraft(JSON.stringify({ cart: [item], checkoutKey: 'chave', savedAt: 0 }), CART_DRAFT_MAX_AGE_MS + 1)).toBeNull();
    expect(parseCartDraft(JSON.stringify({ cart: [], checkoutKey: 'chave', savedAt: 0 }), 1)).toBeNull();
    expect(parseCartDraft('{quebrado', 1)).toBeNull();
    expect(parseCartDraft(null, 1)).toBeNull();
  });
  it('usa o preço atual e tira o que saiu do cardápio', () => {
    const atual = { id: 'p1', price: 12 };
    expect(reconcileCart([item, { id: 'l2', productId: 'antigo', product: { id: 'antigo' } }], [atual])).toEqual([{ ...item, product: atual }]);
  });
});
