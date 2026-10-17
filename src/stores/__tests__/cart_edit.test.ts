import { beforeEach, describe, expect, it } from 'vitest';
import { useCartStore } from '../useCartStore';
import { useStockStore } from '../useStockStore';
import type { DailyPrepStock, Product } from '../../types/domain';

const PICANHA = { id: 'p-picanha', name: 'Picanha', price: 24, allows_doneness: true, allows_notes: true } as Product;
const stock = (qty: number) => [{ product_id: PICANHA.id, current_quantity: qty, is_exhausted: false } as DailyPrepStock];
const TABLE = 'mesa-1';

describe('Revisar pedido: alterar item do rascunho', () => {
  beforeEach(() => {
    useCartStore.setState({ tableCarts: {} });
    useStockStore.setState({ dailyPrepStock: stock(5) });
  });

  it('troca ponto, observação e quantidade', () => {
    const cart = useCartStore.getState();
    cart.addItem(TABLE, PICANHA, 2, 'AO_PONTO', null);
    const [item] = useCartStore.getState().getCart(TABLE);
    useCartStore.getState().updateItem(TABLE, item!.id, { quantity: 3, doneness: 'BEM_PASSADA', notes: ' Pouco sal ' });
    const [after] = useCartStore.getState().getCart(TABLE);
    expect(after).toMatchObject({ id: item!.id, quantity: 3, doneness: 'BEM_PASSADA', notes: 'Pouco sal' });
  });

  it('não deixa passar do estoque e não perde o item', () => {
    useCartStore.getState().addItem(TABLE, PICANHA, 2, 'AO_PONTO', null);
    const [item] = useCartStore.getState().getCart(TABLE);
    expect(() => useCartStore.getState().updateItem(TABLE, item!.id, { quantity: 6, doneness: 'AO_PONTO', notes: null })).toThrow(/restam 5/);
    expect(useCartStore.getState().getCart(TABLE)).toHaveLength(1);
    expect(useCartStore.getState().getCart(TABLE)[0]!.quantity).toBe(2);
  });

  it('junta com outro item igual depois da troca de ponto', () => {
    useCartStore.getState().addItem(TABLE, PICANHA, 1, 'AO_PONTO', null);
    useCartStore.getState().addItem(TABLE, PICANHA, 2, 'MAL_PASSADA', null);
    const mal = useCartStore.getState().getCart(TABLE).find((i) => i.doneness === 'MAL_PASSADA')!;
    useCartStore.getState().updateItem(TABLE, mal.id, { quantity: 2, doneness: 'AO_PONTO', notes: null });
    const cart = useCartStore.getState().getCart(TABLE);
    expect(cart).toHaveLength(1);
    expect(cart[0]).toMatchObject({ doneness: 'AO_PONTO', quantity: 3 });
  });

  it('diminuir até zero remove o item', () => {
    useCartStore.getState().addItem(TABLE, PICANHA, 1, 'AO_PONTO', null);
    const [item] = useCartStore.getState().getCart(TABLE);
    useCartStore.getState().updateQuantity(TABLE, item!.id, -1);
    expect(useCartStore.getState().getCart(TABLE)).toHaveLength(0);
  });
});
