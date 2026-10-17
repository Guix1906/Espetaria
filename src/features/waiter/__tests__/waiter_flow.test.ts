import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from '../../../stores/useCartStore';
import { useTableStore } from '../../../stores/useTableStore';
import { useStockStore } from '../../../stores/useStockStore';
import { INITIAL_PRODUCTS } from '../../../lib/mockData';

describe('ETAPA 3: Módulo do Garçom e Carrinho Multi-Mesa (Espetaria)', () => {
  const picanha = INITIAL_PRODUCTS.find((p) => p.id === 'prod-picanha')!;
  const alcatra = INITIAL_PRODUCTS.find((p) => p.id === 'prod-alcatra')!;
  const cerveja = INITIAL_PRODUCTS.find((p) => p.id === 'prod-cerveja-original')!;

  beforeEach(() => {
    useCartStore.setState({ tableCarts: {} });
    useStockStore.setState({
      dailyPrepStock: [],
      stockMovements: [],
    });
    useTableStore.setState({
      tabs: [],
      orders: [],
      orderItems: [],
    });
  });

  it('1. Deve isolar os carrinhos por mesa sem misturar pedidos de mesas diferentes', () => {
    const cart = useCartStore.getState();

    // Garçom adiciona 2 Picanhas na Mesa 1
    cart.addItem('table-1', picanha, 2, 'AO_PONTO', 'sem sal');

    // Garçom é chamado para a Mesa 5 e adiciona 3 Cervejas
    cart.addItem('table-5', cerveja, 3);

    expect(cart.getCartItemsCount('table-1')).toBe(2);
    expect(cart.getCartTotal('table-1')).toBe(48.00); // 2 * 24.00

    expect(cart.getCartItemsCount('table-5')).toBe(3);
    expect(cart.getCartTotal('table-5')).toBe(45.00); // 3 * 15.00

    // Carrinho da Mesa 2 deve continuar vazio
    expect(cart.getCartItemsCount('table-2')).toBe(0);
  });

  it('2. Deve separar cortes com pontos de carne diferentes como linhas distintas no carrinho', () => {
    const cart = useCartStore.getState();

    // 1 Picanha Ao Ponto
    cart.addItem('table-1', picanha, 1, 'AO_PONTO');
    // 1 Picanha Mal Passada
    cart.addItem('table-1', picanha, 1, 'MAL_PASSADA');

    const table1Cart = cart.getCart('table-1');
    expect(table1Cart.length).toBe(2);
    expect(table1Cart[0]?.doneness).toBe('AO_PONTO');
    expect(table1Cart[1]?.doneness).toBe('MAL_PASSADA');

    // Mas se adicionar outra Picanha Ao Ponto idêntica, deve agrupar na mesma linha
    cart.addItem('table-1', picanha, 1, 'AO_PONTO');
    const updatedCart = useCartStore.getState().getCart('table-1');
    expect(updatedCart.length).toBe(2);
    expect(updatedCart[0]?.quantity).toBe(2); // Incrementou de 1 para 2!
  });

  it('3. Deve permitir alterar quantidade e remover item do carrinho do garçom', () => {
    const cart = useCartStore.getState();

    cart.addItem('table-2', alcatra, 2, 'BEM_PASSADA');
    const itemId = cart.getCart('table-2')[0]!.id;

    // Incrementa +1
    cart.updateQuantity('table-2', itemId, 1);
    expect(cart.getCart('table-2')[0]?.quantity).toBe(3);

    // Decrementa -2
    cart.updateQuantity('table-2', itemId, -2);
    expect(cart.getCart('table-2')[0]?.quantity).toBe(1);

    // Remove do carrinho
    cart.removeItem('table-2', itemId);
    expect(cart.getCart('table-2').length).toBe(0);
  });

  it('4. Deve abrir comanda, lançar pedido a partir do carrinho e debitar estoque', () => {
    const SHIFT_ID = 'shift-waiter-test';
    const USER_ID = 'garcom-lucas';

    // 1. Inicializa estoque do turno com 10 Picanhas
    useStockStore.getState().initShiftStock(
      SHIFT_ID,
      [{ productId: 'prod-picanha', quantity: 10 }],
      USER_ID
    );

    // 2. Garçom abre comanda na Mesa 3
    const tab = useTableStore.getState().openTab(
      'table-3',
      'Família Mendes',
      4,
      'Mesa com criança',
      USER_ID,
      SHIFT_ID
    );

    expect(tab).toBeDefined();
    expect(tab.status).toBe('OPEN');
    expect(useTableStore.getState().tables.find(t => t.id === 'table-3')?.status).toBe('OCUPADA');

    // 3. Garçom monta o pedido no carrinho e envia
    const cart = useCartStore.getState();
    cart.addItem('table-3', picanha, 3, 'AO_PONTO', 'sem alho');

    const draftItems = cart.getCart('table-3');
    useTableStore.getState().addOrderAtomic(
      SHIFT_ID,
      tab.id,
      draftItems.map(i => ({
        productId: i.product.id,
        quantity: i.quantity,
        doneness: i.doneness,
        notes: i.notes || undefined,
      })),
      USER_ID
    );

    // Limpa carrinho da mesa após envio
    cart.clearCart('table-3');
    expect(cart.getCart('table-3').length).toBe(0);

    // Verifica que o estoque foi debitado de 10 para 7
    const remainingStock = useStockStore.getState().getProductDailyStock('prod-picanha');
    expect(remainingStock?.current_quantity).toBe(7);

    // Verifica que o subtotal da comanda foi atualizado (3 * 24.00 = 72.00)
    const updatedTab = useTableStore.getState().tabs.find(t => t.id === tab.id);
    expect(updatedTab?.subtotal).toBe(72.00);
    expect(updatedTab?.service_fee).toBe(7.20); // 10%
    expect(updatedTab?.total).toBe(79.20);
  });
});
