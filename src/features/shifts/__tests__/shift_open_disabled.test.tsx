import { describe, it, expect, beforeEach } from 'vitest';
import { useStockStore } from '../../../stores/useStockStore';
import { useShiftStore } from '../../../stores/useShiftStore';
import { remainingFor } from '../../../lib/comboStock';
import { getProductAvailability, getStockLevel } from '../../../lib/productAvailability';
import type { Product } from '../../../types/domain';

const SKEWER_PICANHA: Product = {
  id: 'prod-picanha-test',
  category_id: 'cat-espetos',
  name: 'Picanha',
  description: null,
  price: 54,
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

const COMBO_PICANHA: Product = {
  id: 'prod-combo-picanha-test',
  category_id: 'cat-combos',
  name: 'Picanha com acompanhamento',
  description: 'Acompanha arroz, vinagrete, farofa',
  price: 60,
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
  display_order: 2,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const RICE: Product = {
  id: 'prod-arroz-test',
  category_id: 'cat-porcoes',
  name: 'Arroz',
  description: null,
  price: 8,
  image_url: null,
  active: true,
  available: true,
  sector: 'KITCHEN',
  type: 'PORCAO',
  tracks_stock: true,
  is_cubas: false,
  portions_per_cuba: 1,
  allows_doneness: false,
  allows_notes: true,
  display_order: 3,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('Abertura de turno com botão de desabilitar item (Sem estoque hoje)', () => {
  const SHIFT_ID = 'shift-disable-test-1';
  const USER_ID = 'user-admin-1';

  beforeEach(() => {
    useStockStore.setState({
      products: [SKEWER_PICANHA, COMBO_PICANHA, RICE],
      dailyPrepStock: [],
      stockMovements: [],
    });
    useShiftStore.setState({
      currentShift: null,
      shiftsHistory: [],
    });
  });

  it('1. Desabilitar espeto na abertura de turno marca espeto e combo como esgotados', () => {
    const { initShiftStock } = useStockStore.getState();

    // Abre o turno com arroz preparado (40 porções), mas Picanha desabilitada (não tem hoje)
    initShiftStock(
      SHIFT_ID,
      [{ productId: RICE.id, quantity: 40 }],
      USER_ID,
      [SKEWER_PICANHA.id] // Desabilitado na abertura
    );

    const { products, dailyPrepStock } = useStockStore.getState();

    // Picanha deve estar indisponível e esgotada
    const picanhaProduct = products.find((p) => p.id === SKEWER_PICANHA.id);
    expect(picanhaProduct?.available).toBe(false);

    const picanhaStock = dailyPrepStock.find((s) => s.product_id === SKEWER_PICANHA.id);
    expect(picanhaStock?.is_exhausted).toBe(true);
    expect(picanhaStock?.current_quantity).toBe(0);

    // O combo de Picanha com acompanhamento também deve estar indisponível
    const comboProduct = products.find((p) => p.id === COMBO_PICANHA.id);
    expect(comboProduct?.available).toBe(false);

    // Para o garçom, o saldo deve ser 0
    const remainingPicanha = remainingFor(picanhaProduct!, products, dailyPrepStock, []);
    expect(remainingPicanha).toBe(0);

    const remainingCombo = remainingFor(comboProduct!, products, dailyPrepStock, []);
    expect(remainingCombo).toBe(0);

    const availPicanha = getProductAvailability(picanhaProduct!, picanhaStock);
    expect(availPicanha.isAvailable).toBe(false);
    expect(getStockLevel(availPicanha.isAvailable, remainingPicanha)).toBe('out');
  });

  it('2. Desabilitar Arroz na abertura de turno marca todos os combos como esgotados', () => {
    const { initShiftStock } = useStockStore.getState();

    // Abre o turno com Picanha preparada (50 un), mas Arroz desabilitado (não tem arroz hoje)
    initShiftStock(
      SHIFT_ID,
      [{ productId: SKEWER_PICANHA.id, quantity: 50 }],
      USER_ID,
      [RICE.id] // Arroz desabilitado
    );

    const { products, dailyPrepStock } = useStockStore.getState();

    const riceProduct = products.find((p) => p.id === RICE.id);
    expect(riceProduct?.available).toBe(false);

    // O combo de Picanha com acompanhamento deve estar indisponível por falta de arroz
    const comboProduct = products.find((p) => p.id === COMBO_PICANHA.id);
    expect(comboProduct?.available).toBe(false);

    const remainingCombo = remainingFor(comboProduct!, products, dailyPrepStock, []);
    expect(remainingCombo).toBe(0);

    // O espeto simples continua disponível pois teve 50 preparados
    const picanhaProduct = products.find((p) => p.id === SKEWER_PICANHA.id);
    expect(picanhaProduct?.available).toBe(true);
    const remainingPicanha = remainingFor(picanhaProduct!, products, dailyPrepStock, []);
    expect(remainingPicanha).toBe(50);
  });
});
