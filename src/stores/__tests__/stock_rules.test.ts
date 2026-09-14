import { describe, it, expect, beforeEach } from 'vitest';
import { useStockStore } from '../useStockStore';
import { useTableStore } from '../useTableStore';

describe('Regras Críticas de Negócio e Estoque Diário (Espetaria)', () => {
  const MOCK_USER_ID = 'user-test-123';
  const SHIFT_ID = 'shift-test-1';

  beforeEach(() => {
    // Reseta o estado dos stores
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

  it('1. Deve calcular corretamente o estoque diário a partir de CUBAS (ex: 3 cubas * 15 porções = 45)', () => {
    const stockStore = useStockStore.getState();

    stockStore.initShiftStock(
      SHIFT_ID,
      [
        {
          productId: 'prod-arroz',
          cubasCount: 3,
          portionsPerCuba: 15, // 3 * 15 = 45
        },
        {
          productId: 'prod-picanha',
          quantity: 80, // 80 espetos normais
        }
      ],
      MOCK_USER_ID
    );

    const arrozStock = useStockStore.getState().getProductDailyStock('prod-arroz');
    const picanhaStock = useStockStore.getState().getProductDailyStock('prod-picanha');

    expect(arrozStock).toBeDefined();
    expect(arrozStock?.cubas_count).toBe(3);
    expect(arrozStock?.portions_per_cuba).toBe(15);
    expect(arrozStock?.initial_quantity).toBe(45);
    expect(arrozStock?.current_quantity).toBe(45);
    expect(arrozStock?.is_exhausted).toBe(false);

    expect(picanhaStock?.initial_quantity).toBe(80);
    expect(picanhaStock?.current_quantity).toBe(80);

    // Verifica que as movimentações de PRODUÇÃO foram criadas
    const movements = useStockStore.getState().stockMovements;
    expect(movements.length).toBe(2);
    expect(movements.find(m => m.product_id === 'prod-arroz')?.quantity).toBe(45);
    expect(movements.find(m => m.product_id === 'prod-arroz')?.movement_type).toBe('PRODUCAO');
  });

  it('2. Deve autorizar venda da última unidade e esgotar automaticamente o produto ao zerar', () => {
    const stockStore = useStockStore.getState();

    // Inicializa com apenas 1 picanha
    stockStore.initShiftStock(
      SHIFT_ID,
      [{ productId: 'prod-picanha', quantity: 1 }],
      MOCK_USER_ID
    );

    expect(stockStore.getProductDailyStock('prod-picanha')?.current_quantity).toBe(1);

    // Vende a última unidade
    stockStore.consumeStockAtomic(
      SHIFT_ID,
      [{ productId: 'prod-picanha', quantity: 1 }],
      MOCK_USER_ID,
      'order-1'
    );

    const updatedStock = useStockStore.getState().getProductDailyStock('prod-picanha');
    expect(updatedStock?.current_quantity).toBe(0);
    expect(updatedStock?.consumed_quantity).toBe(1);
    expect(updatedStock?.is_exhausted).toBe(true);

    const product = useStockStore.getState().products.find(p => p.id === 'prod-picanha');
    expect(product?.available).toBe(false);
  });

  it('3. NUNCA deve permitir estoque negativo quando dois pedidos concorrem pela última unidade', () => {
    const stockStore = useStockStore.getState();

    // Inicializa com apenas 1 picanha
    stockStore.initShiftStock(
      SHIFT_ID,
      [{ productId: 'prod-picanha', quantity: 1 }],
      MOCK_USER_ID
    );

    // Garçom A vende a picanha
    expect(() => {
      stockStore.consumeStockAtomic(
        SHIFT_ID,
        [{ productId: 'prod-picanha', quantity: 1 }],
        'garcom-A',
        'order-A'
      );
    }).not.toThrow();

    // Garçom B tenta vender a mesma picanha logo em seguida
    expect(() => {
      stockStore.consumeStockAtomic(
        SHIFT_ID,
        [{ productId: 'prod-picanha', quantity: 1 }],
        'garcom-B',
        'order-B'
      );
    }).toThrow(/Estoque insuficiente|ESGOTADO/);

    // Confirma que o saldo continua 0 e não ficou negativo (-1)
    const stock = useStockStore.getState().getProductDailyStock('prod-picanha');
    expect(stock?.current_quantity).toBe(0);
  });

  it('4. Botão ESGOTAR deve bloquear imediatamente o item e registrar o motivo', () => {
    const stockStore = useStockStore.getState();

    stockStore.initShiftStock(
      SHIFT_ID,
      [{ productId: 'prod-picanha', quantity: 20 }],
      MOCK_USER_ID
    );

    // Churrasqueiro aperta [ESGOTAR PICANHA]
    stockStore.toggleExhaustProduct(
      SHIFT_ID,
      'prod-picanha',
      true,
      'churrasqueiro-1',
      'Carne de qualidade inferior identificada no corte'
    );

    const stock = useStockStore.getState().getProductDailyStock('prod-picanha');
    const product = useStockStore.getState().products.find(p => p.id === 'prod-picanha');

    expect(stock?.is_exhausted).toBe(true);
    expect(stock?.exhaust_reason).toBe('Carne de qualidade inferior identificada no corte');
    expect(product?.available).toBe(false);

    // Tentativa de venda deve ser bloqueada
    expect(() => {
      stockStore.consumeStockAtomic(
        SHIFT_ID,
        [{ productId: 'prod-picanha', quantity: 1 }],
        'garcom-1'
      );
    }).toThrow(/ESGOTADO/);
  });

  it('5. Cancelamento com status RECEIVED DEVE devolver o produto ao estoque comercializável', () => {
    const stockStore = useStockStore.getState();

    stockStore.initShiftStock(
      SHIFT_ID,
      [{ productId: 'prod-picanha', quantity: 5 }],
      MOCK_USER_ID
    );

    // Consome 2
    stockStore.consumeStockAtomic(
      SHIFT_ID,
      [{ productId: 'prod-picanha', quantity: 2 }],
      MOCK_USER_ID,
      'order-1'
    );
    expect(stockStore.getProductDailyStock('prod-picanha')?.current_quantity).toBe(3);

    // Cancela quando status é RECEIVED (ainda não foi para a grelha)
    const result = stockStore.cancelOrderItemStockAtomic(
      SHIFT_ID,
      'prod-picanha',
      2,
      'RECEIVED',
      MOCK_USER_ID,
      'item-1',
      'Cliente desistiu antes do preparo'
    );

    expect(result.returnedToStock).toBe(true);

    const restoredStock = useStockStore.getState().getProductDailyStock('prod-picanha');
    expect(restoredStock?.current_quantity).toBe(5); // Retornou para 5!

    const lastMovement = useStockStore.getState().stockMovements[0];
    expect(lastMovement?.movement_type).toBe('CANCELAMENTO_RETORNO');
    expect(lastMovement?.quantity).toBe(2);
    expect(lastMovement?.new_balance).toBe(5);
  });

  it('6. Cancelamento com status IN_PREPARATION NÃO DEVE devolver ao estoque e sim gerar PERDA', () => {
    const stockStore = useStockStore.getState();

    stockStore.initShiftStock(
      SHIFT_ID,
      [{ productId: 'prod-picanha', quantity: 5 }],
      MOCK_USER_ID
    );

    // Consome 1
    stockStore.consumeStockAtomic(
      SHIFT_ID,
      [{ productId: 'prod-picanha', quantity: 1 }],
      MOCK_USER_ID,
      'order-1'
    );
    expect(useStockStore.getState().getProductDailyStock('prod-picanha')?.current_quantity).toBe(4);

    // Cancela quando já está NA GRELHA (IN_PREPARATION)
    const result = useStockStore.getState().cancelOrderItemStockAtomic(
      SHIFT_ID,
      'prod-picanha',
      1,
      'IN_PREPARATION',
      MOCK_USER_ID,
      'item-1',
      'Carne passou do ponto na brasa'
    );

    expect(result.returnedToStock).toBe(false);

    const stock = useStockStore.getState().getProductDailyStock('prod-picanha');
    expect(stock?.current_quantity).toBe(4); // Permanece 4, NÃO volta para 5!
    expect(stock?.discarded_quantity).toBe(1); // Foi para descarte/perda

    const lastMovement = useStockStore.getState().stockMovements[0];
    expect(lastMovement?.movement_type).toBe('PERDA');
    expect(lastMovement?.quantity).toBe(-1);
  });

  it('7. Ajuste de Contagem Física deve calcular diferença e atualizar estoque', () => {
    const stockStore = useStockStore.getState();

    stockStore.initShiftStock(
      SHIFT_ID,
      [{ productId: 'prod-picanha', quantity: 10 }],
      MOCK_USER_ID
    );

    // Contagem física detectou 9 (diferença de -1)
    useStockStore.getState().adjustStockPhysicalCount(
      SHIFT_ID,
      'prod-picanha',
      9,
      MOCK_USER_ID,
      'Contagem na churrasqueira'
    );

    const stock = useStockStore.getState().getProductDailyStock('prod-picanha');
    expect(stock?.current_quantity).toBe(9);
    expect(stock?.count_difference).toBe(-1);
    expect(stock?.last_counted_quantity).toBe(9);

    const lastMovement = useStockStore.getState().stockMovements[0];
    expect(lastMovement?.movement_type).toBe('AJUSTE');
    expect(lastMovement?.previous_balance).toBe(10);
    expect(lastMovement?.new_balance).toBe(9);
  });
});
