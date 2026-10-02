import { describe, it, expect, beforeEach } from 'vitest';
import { useStockStore, ProductInput } from '../../../stores/useStockStore';
import { useShiftStore } from '../../../stores/useShiftStore';

const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => { store[key] = String(val); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: storageMock,
    writable: true,
  });
}

describe('Gestão e Cadastro de Produtos do Cardápio', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    useStockStore.getState().resetProductsToDefault();
    useStockStore.setState({
      dailyPrepStock: [],
      stockMovements: [],
    });
    useShiftStore.setState({
      currentShift: null,
    });
  });

  it('deve cadastrar um novo espeto com sucesso e disponibilizá-lo para venda', () => {
    const stockStore = useStockStore.getState();
    const initialCount = stockStore.products.length;

    const newProduct: ProductInput = {
      name: 'Espeto de Cupim Nobre',
      description: 'Cupim fatiado e marinado no vinho e ervas',
      price: 24.9,
      type: 'ESPETO',
      sector: 'GRILL',
      category: 'Bovinos Especiais',
      active: true,
      tracks_stock: true,
      allows_doneness: true,
      is_cubas: false,
    };

    const created = stockStore.addProduct(newProduct);

    expect(created.id).toBeDefined();
    expect(created.name).toBe('Espeto de Cupim Nobre');
    expect(created.allows_doneness).toBe(true);

    const updatedProducts = useStockStore.getState().products;
    expect(updatedProducts.length).toBe(initialCount + 1);

    const found = updatedProducts.find((p) => p.id === created.id);
    expect(found).toBeDefined();
    expect(found?.price).toBe(24.9);
    expect(found?.sector).toBe('GRILL');

    // Cardápio do garçom e digital filtram por product.active
    const activeProducts = updatedProducts.filter((p) => p.active);
    expect(activeProducts.some((p) => p.id === created.id)).toBe(true);
  });

  it('deve injetar estoque inicial de turno para venda imediata se um turno estiver aberto', () => {
    const shiftId = 'turno-ativo-123';
    useShiftStore.setState({
      currentShift: {
        id: shiftId,
        date: '2026-09-14',
        name: 'Turno Teste',
        opened_at: new Date().toISOString(),
        closed_at: null,
        opened_by: 'gerente-1',
        closed_by: null,
        status: 'ABERTO',
        cash_drawer_start: 200,
        cash_drawer_end: null,
        initial_notes: null,
        closing_notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: null,
        version: 1,
      },
    });

    const stockStore = useStockStore.getState();

    const created = stockStore.addProduct(
      {
        name: 'Costela Angus no Bafo',
        price: 32.0,
        type: 'ESPETO',
        sector: 'GRILL',
        active: true,
        tracks_stock: true,
        allows_doneness: true,
      },
      {
        shiftId,
        initialShiftQuantity: 35,
        userId: 'gerente-1',
      }
    );

    const dailyStock = useStockStore.getState().getProductDailyStock(created.id);
    expect(dailyStock).toBeDefined();
    expect(dailyStock?.shift_id).toBe(shiftId);
    expect(dailyStock?.initial_quantity).toBe(35);
    expect(dailyStock?.current_quantity).toBe(35);

    const movements = useStockStore.getState().stockMovements;
    const movement = movements.find((m) => m.product_id === created.id);
    expect(movement).toBeDefined();
    expect(movement?.movement_type).toBe('PRODUCAO');
    expect(movement?.quantity).toBe(35);
  });

  it('deve atualizar os dados de um produto existente', () => {
    const stockStore = useStockStore.getState();
    const created = stockStore.addProduct({
      name: 'Cerveja Artesanal IPA',
      price: 18.0,
      type: 'BEBIDA',
      sector: 'BAR',
      active: true,
      tracks_stock: false,
    });

    stockStore.updateProduct(created.id, {
      name: 'Cerveja Artesanal Session IPA 500ml',
      price: 19.5,
      description: 'Lúpulos nobres e refrescância cítrica',
    });

    const updated = useStockStore.getState().products.find((p) => p.id === created.id);
    expect(updated).toBeDefined();
    expect(updated?.name).toBe('Cerveja Artesanal Session IPA 500ml');
    expect(updated?.price).toBe(19.5);
    expect(updated?.description).toBe('Lúpulos nobres e refrescância cítrica');
  });

  it('deve pausar e reativar produto do cardápio com 1 clique', () => {
    const stockStore = useStockStore.getState();
    const created = stockStore.addProduct({
      name: 'Pão de Alho Picante',
      price: 12.0,
      type: 'ESPETO',
      sector: 'GRILL',
      active: true,
    });

    expect(created.active).toBe(true);

    // Pausar
    stockStore.toggleProductActive(created.id);
    let current = useStockStore.getState().products.find((p) => p.id === created.id);
    expect(current?.active).toBe(false);

    // Reativar
    stockStore.toggleProductActive(created.id);
    current = useStockStore.getState().products.find((p) => p.id === created.id);
    expect(current?.active).toBe(true);
  });

  it('deve excluir produto do catálogo', () => {
    const stockStore = useStockStore.getState();
    const created = stockStore.addProduct({
      name: 'Sobremesa Temporária',
      price: 15.0,
      type: 'SOBREMESA',
      sector: 'KITCHEN',
      active: true,
    });

    expect(useStockStore.getState().products.some((p) => p.id === created.id)).toBe(true);

    stockStore.deleteProduct(created.id);

    expect(useStockStore.getState().products.some((p) => p.id === created.id)).toBe(false);
  });

  it('deve restaurar produtos para o catálogo padrão de fábrica', () => {
    const stockStore = useStockStore.getState();
    stockStore.addProduct({
      name: 'Item Extra 1',
      price: 10,
      type: 'BEBIDA',
      sector: 'BAR',
      active: true,
    });

    expect(useStockStore.getState().products.some((p) => p.name === 'Item Extra 1')).toBe(true);

    stockStore.resetProductsToDefault();

    expect(useStockStore.getState().products.some((p) => p.name === 'Item Extra 1')).toBe(false);
    expect(useStockStore.getState().products.some((p) => p.id === 'prod-picanha')).toBe(true);
  });
});
