import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStockStore } from '../../../stores/useStockStore';
import { useTableStore } from '../../../stores/useTableStore';
import { useShiftStore } from '../../../stores/useShiftStore';
import { Product } from '../../../types/domain';

// Mock Web Audio API no ambiente Vitest Node
class MockAudioContext {
  currentTime = 0;
  state = 'running';
  resume = vi.fn().mockResolvedValue(undefined);
  createOscillator = vi.fn().mockReturnValue({
    type: 'sine',
    frequency: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  });
  createGain = vi.fn().mockReturnValue({
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
  });
  destination = {};
}

vi.stubGlobal('AudioContext', MockAudioContext);

const MOCK_GRILL_PRODUCT: Product = {
  id: 'prod-picanha-1',
  category_id: 'cat-1',
  name: 'Espeto de Picanha Grill',
  description: 'Picanha maturada',
  price: 24.9,
  image_url: null,
  active: true,
  available: true,
  sector: 'GRILL',
  type: 'ESPETO',
  tracks_stock: true,
  is_cubas: false,
  portions_per_cuba: 1,
  allows_doneness: true,
  allows_notes: true,
  display_order: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const MOCK_KITCHEN_CUBA_PRODUCT: Product = {
  id: 'prod-mandioca-1',
  category_id: 'cat-2',
  name: 'Mandioca na Manteiga de Garrafa',
  description: 'Cuba GN de mandioca',
  price: 18.0,
  image_url: null,
  active: true,
  available: true,
  sector: 'KITCHEN',
  type: 'PORCAO',
  tracks_stock: true,
  is_cubas: true,
  portions_per_cuba: 10,
  allows_doneness: false,
  allows_notes: true,
  display_order: 2,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const MOCK_BAR_PRODUCT: Product = {
  id: 'prod-cerveja-1',
  category_id: 'cat-3',
  name: 'Cerveja Original 600ml',
  description: 'Cerveja gelada',
  price: 14.0,
  image_url: null,
  active: true,
  available: true,
  sector: 'BAR',
  type: 'BEBIDA',
  tracks_stock: true,
  is_cubas: false,
  portions_per_cuba: 1,
  allows_doneness: false,
  allows_notes: false,
  display_order: 3,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('ETAPA 4: Telas de Produção KDS (Churrasqueira, Cozinha, Bar)', () => {
  const shiftId = 'shift-test-kds';
  const userId = 'user-test-kds';

  beforeEach(() => {
    // Reseta os estados dos stores
    useStockStore.setState({
      products: [MOCK_GRILL_PRODUCT, MOCK_KITCHEN_CUBA_PRODUCT, MOCK_BAR_PRODUCT],
      dailyPrepStock: [],
      stockMovements: [],
    });

    useShiftStore.setState({
      currentShift: {
        id: shiftId,
        date: new Date().toISOString().split('T')[0]!,
        name: 'Turno Teste KDS',
        status: 'ABERTO',
        opened_by: userId,
        closed_by: null,
        opened_at: new Date().toISOString(),
        closed_at: null,
        initial_notes: null,
        closing_notes: null,
        cash_drawer_start: 300,
        cash_drawer_end: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: null,
        version: 1,
      },
    });

    useTableStore.setState({
      tabs: [],
      orders: [],
      orderItems: [],
    });

    // Inicializa mise en place com 20 picanhas e 2 cubas de mandioca (20 porções)
    useStockStore.getState().initShiftStock(
      shiftId,
      [
        { productId: MOCK_GRILL_PRODUCT.id, quantity: 20 },
        { productId: MOCK_KITCHEN_CUBA_PRODUCT.id, cubasCount: 2, portionsPerCuba: 10 }, // 2 cubas * 10 porcoes = 20
        { productId: MOCK_BAR_PRODUCT.id, quantity: 30 },
      ],
      userId
    );
  });

  it('1. Fluxo KDS Churrasqueira: espeto entra direto NA BRASA e "Espeto pronto" leva a READY com timestamp', () => {
    const tableId = useTableStore.getState().tables[0]!.id; // Mesa 1
    const tab = useTableStore.getState().openTab(tableId, 'Cliente Churrasco', 2, '', userId, shiftId);

    // Garçom lança pedido de 2 picanhas ao ponto
    const order = useTableStore.getState().addOrderAtomic(
      shiftId,
      tab.id,
      [{ productId: MOCK_GRILL_PRODUCT.id, quantity: 2, doneness: 'AO_PONTO' }],
      userId
    );

    const items = useTableStore.getState().orderItems.filter((i) => i.order_id === order.id);
    expect(items.length).toBe(1);
    const grillItem = items[0]!;

    // Sem etapa manual: o espeto enviado já está na brasa
    expect(grillItem.status).toBe('IN_PREPARATION');
    expect(grillItem.prepared_at).toBeNull();
    expect(useTableStore.getState().orders.find((o) => o.id === order.id)?.status).toBe('IN_PREPARATION');

    // Churrasqueiro toca "Espeto pronto" (todos os espetos do pedido)
    useTableStore.getState().updateOrderSectorItemsStatus(order.id, 'GRILL', 'READY');
    const updatedItem = useTableStore.getState().orderItems.find((i) => i.id === grillItem.id)!;
    expect(updatedItem.status).toBe('READY');
    expect(updatedItem.prepared_at).not.toBeNull();
    expect(useTableStore.getState().orders.find((o) => o.id === order.id)?.status).toBe('READY');
  });

  it('2. Resumo Agregado da Grelha: consolida corretamente quantidades e pontos de carne', () => {
    const table1 = useTableStore.getState().tables[0]!.id;
    const table2 = useTableStore.getState().tables[1]!.id;

    const tab1 = useTableStore.getState().openTab(table1, 'Mesa 1', 2, '', userId, shiftId);
    const tab2 = useTableStore.getState().openTab(table2, 'Mesa 2', 4, '', userId, shiftId);

    // Mesa 1 pede: 3 Picanhas (2 Ao Ponto, 1 Bem Passada)
    useTableStore.getState().addOrderAtomic(
      shiftId,
      tab1.id,
      [
        { productId: MOCK_GRILL_PRODUCT.id, quantity: 2, doneness: 'AO_PONTO' },
        { productId: MOCK_GRILL_PRODUCT.id, quantity: 1, doneness: 'BEM_PASSADA' },
      ],
      userId
    );

    // Mesa 2 pede: 2 Picanhas (1 Mal Passada, 1 Ao Ponto)
    useTableStore.getState().addOrderAtomic(
      shiftId,
      tab2.id,
      [
        { productId: MOCK_GRILL_PRODUCT.id, quantity: 1, doneness: 'MAL_PASSADA' },
        { productId: MOCK_GRILL_PRODUCT.id, quantity: 1, doneness: 'AO_PONTO' },
      ],
      userId
    );

    const allItems = useTableStore.getState().orderItems.filter((i) => i.sector === 'GRILL');
    expect(allItems.length).toBe(4); // 4 entradas de itens

    // Coloca os 2 primeiros na grelha
    useTableStore.getState().updateOrderItemStatus(allItems[0]!.id, 'IN_PREPARATION');
    useTableStore.getState().updateOrderItemStatus(allItems[1]!.id, 'IN_PREPARATION');

    // Total de picanhas pedidas: 2 + 1 + 1 + 1 = 5
    const totalQuantity = allItems.reduce((acc, curr) => acc + curr.quantity, 0);
    expect(totalQuantity).toBe(5);

    // Total ao ponto: 2 (Mesa 1) + 1 (Mesa 2) = 3
    const aoPontoTotal = allItems
      .filter((i) => i.doneness === 'AO_PONTO')
      .reduce((acc, curr) => acc + curr.quantity, 0);
    expect(aoPontoTotal).toBe(3);

    // Total mal passada = 1
    const malPassadaTotal = allItems
      .filter((i) => i.doneness === 'MAL_PASSADA')
      .reduce((acc, curr) => acc + curr.quantity, 0);
    expect(malPassadaTotal).toBe(1);

    // Total bem passada = 1
    const bemPassadaTotal = allItems
      .filter((i) => i.doneness === 'BEM_PASSADA')
      .reduce((acc, curr) => acc + curr.quantity, 0);
    expect(bemPassadaTotal).toBe(1);
  });

  it('3. Monitor de Cubas da Cozinha: baixa atômica por porção e esgotamento instantâneo da cuba', () => {
    const tableId = useTableStore.getState().tables[0]!.id;
    const tab = useTableStore.getState().openTab(tableId, 'Cliente Cozinha', 2, '', userId, shiftId);

    // Estoque inicial de mandioca: 2 cubas * 10 porções = 20 porções
    let prepMandioca = useStockStore.getState().dailyPrepStock.find((s) => s.product_id === MOCK_KITCHEN_CUBA_PRODUCT.id)!;
    expect(prepMandioca.current_quantity).toBe(20);

    // Garçom pede 3 porções de mandioca
    useTableStore.getState().addOrderAtomic(
      shiftId,
      tab.id,
      [{ productId: MOCK_KITCHEN_CUBA_PRODUCT.id, quantity: 3 }],
      userId
    );

    // Verifica saldo da cuba restante: 20 - 3 = 17 porções
    prepMandioca = useStockStore.getState().dailyPrepStock.find((s) => s.product_id === MOCK_KITCHEN_CUBA_PRODUCT.id)!;
    expect(prepMandioca.current_quantity).toBe(17);

    // Cozinheiro aciona "Esgotar Cuba" no KDS Cozinha
    useStockStore.getState().toggleExhaustProduct(shiftId, MOCK_KITCHEN_CUBA_PRODUCT.id, true, userId, 'Acabou mandioca');

    prepMandioca = useStockStore.getState().dailyPrepStock.find((s) => s.product_id === MOCK_KITCHEN_CUBA_PRODUCT.id)!;
    expect(prepMandioca.is_exhausted).toBe(true);

    // Tentativa de novo pedido pelo garçom deve ser bloqueada imediatamente
    expect(() => {
      useTableStore.getState().addOrderAtomic(
        shiftId,
        tab.id,
        [{ productId: MOCK_KITCHEN_CUBA_PRODUCT.id, quantity: 1 }],
        userId
      );
    }).toThrow(/está ESGOTADO/i);
  });

  it('4. KDS Bar: expedição ágil de bebidas com 1 tap "Pronto!"', () => {
    const tableId = useTableStore.getState().tables[0]!.id;
    const tab = useTableStore.getState().openTab(tableId, 'Cliente Bar', 2, '', userId, shiftId);

    const order = useTableStore.getState().addOrderAtomic(
      shiftId,
      tab.id,
      [{ productId: MOCK_BAR_PRODUCT.id, quantity: 2 }],
      userId
    );

    const barItem = useTableStore.getState().orderItems.find((i) => i.order_id === order.id)!;
    expect(barItem.sector).toBe('BAR');
    expect(barItem.status).toBe('RECEIVED');

    // Barman tira cerveja e aperta "Pronto!"
    useTableStore.getState().updateOrderItemStatus(barItem.id, 'READY');

    const updatedItem = useTableStore.getState().orderItems.find((i) => i.id === barItem.id)!;
    expect(updatedItem.status).toBe('READY');
    expect(updatedItem.prepared_at).not.toBeNull();
  });

  it('5. Ações em Lote no KDS: "Todos na Brasa" e "Tudo Pronto" atualizam todos os itens do setor', () => {
    const tableId = useTableStore.getState().tables[0]!.id;
    const tab = useTableStore.getState().openTab(tableId, 'Mesa Grande', 6, '', userId, shiftId);

    // Pedido misto com 2 espetos e 1 cerveja
    const order = useTableStore.getState().addOrderAtomic(
      shiftId,
      tab.id,
      [
        { productId: MOCK_GRILL_PRODUCT.id, quantity: 2, doneness: 'AO_PONTO' },
        { productId: MOCK_GRILL_PRODUCT.id, quantity: 2, doneness: 'BEM_PASSADA' },
        { productId: MOCK_BAR_PRODUCT.id, quantity: 1 },
      ],
      userId
    );

    // Churrasqueiro aperta "Todos na Brasa"
    useTableStore.getState().updateOrderSectorItemsStatus(order.id, 'GRILL', 'IN_PREPARATION');

    const grillItemsAfterPrep = useTableStore.getState().orderItems.filter((i) => i.order_id === order.id && i.sector === 'GRILL');
    expect(grillItemsAfterPrep.every((i) => i.status === 'IN_PREPARATION')).toBe(true);

    // O item do Bar NÃO deve ser afetado pela ação da churrasqueira
    const barItem = useTableStore.getState().orderItems.find((i) => i.order_id === order.id && i.sector === 'BAR')!;
    expect(barItem.status).toBe('RECEIVED');

    // Churrasqueiro aperta "Tudo Pronto"
    useTableStore.getState().updateOrderSectorItemsStatus(order.id, 'GRILL', 'READY');

    const grillItemsAfterReady = useTableStore.getState().orderItems.filter((i) => i.order_id === order.id && i.sector === 'GRILL');
    expect(grillItemsAfterReady.every((i) => i.status === 'READY')).toBe(true);
  });
});
