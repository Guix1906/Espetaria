import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useShiftStore } from '../../../stores/useShiftStore';
import { useStockStore } from '../../../stores/useStockStore';
import { useTableStore } from '../../../stores/useTableStore';
import { Product } from '../../../types/domain';

// Mock Web Audio API
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

const MOCK_ALCATRA: Product = {
  id: 'prod-alcatra',
  category_id: 'cat-espetos',
  name: 'Espeto de Alcatra com Queijo Coalho',
  description: 'Grelhado na brasa',
  price: 22.0,
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

const MOCK_FAROFA: Product = {
  id: 'prod-farofa',
  category_id: 'cat-porcoes',
  name: 'Farofa Especial da Casa',
  description: 'Porção individual',
  price: 8.0,
  image_url: null,
  active: true,
  available: true,
  sector: 'KITCHEN',
  type: 'PORCAO',
  tracks_stock: true,
  is_cubas: true,
  portions_per_cuba: 20,
  allows_doneness: false,
  allows_notes: false,
  display_order: 2,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('ETAPA 8: Painel Master, Relatórios Gerenciais & Fechamento de Turno', () => {
  const masterUserId = 'user-master-01';

  beforeEach(() => {
    useStockStore.setState({
      products: [MOCK_ALCATRA, MOCK_FAROFA],
      dailyPrepStock: [],
      stockMovements: [],
    });

    useTableStore.setState({
      tables: [],
      tabs: [],
      orders: [],
      orderItems: [],
      payments: [],
    });

    useShiftStore.setState({
      currentShift: null,
      shiftsHistory: [],
    });
  });

  it('deve abrir turno da noite com mise en place inicial e fundo de caixa', () => {
    const { openShift } = useShiftStore.getState();

    const shift = openShift(
      'Turno Noite - Sexta Brasa',
      'Noite de alta demanda esperada',
      400.0, // R$ 400 de fundo de caixa inicial
      [
        { productId: MOCK_ALCATRA.id, quantity: 50 },
        { productId: MOCK_FAROFA.id, cubasCount: 2, portionsPerCuba: 20 },
      ],
      masterUserId
    );

    expect(shift).toBeDefined();
    expect(shift.status).toBe('ABERTO');
    expect(shift.cash_drawer_start).toBe(400.0);
    expect(shift.cash_drawer_end).toBeNull();
    expect(useShiftStore.getState().currentShift?.id).toBe(shift.id);

    // Verifica estoque inicial gerado
    const prepStock = useStockStore.getState().dailyPrepStock;
    expect(prepStock.length).toBe(2);

    const alcatraStock = prepStock.find((s) => s.product_id === MOCK_ALCATRA.id);
    expect(alcatraStock?.initial_quantity).toBe(50);
    expect(alcatraStock?.current_quantity).toBe(50);

    const farofaStock = prepStock.find((s) => s.product_id === MOCK_FAROFA.id);
    expect(farofaStock?.initial_quantity).toBe(40); // 2 cubas * 20 = 40 porções
    expect(farofaStock?.current_quantity).toBe(40);
  });

  it('deve realizar a conferência de estoque físico calculando quebra/perda (diferença negativa)', () => {
    const { openShift } = useShiftStore.getState();
    const shift = openShift(
      'Turno Sábado',
      '',
      500.0,
      [{ productId: MOCK_ALCATRA.id, quantity: 30 }],
      masterUserId
    );

    // Simula consumo de 10 espetos (saldo teórico = 20)
    useStockStore.getState().consumeStockAtomic(
      shift.id,
      [{ productId: MOCK_ALCATRA.id, quantity: 10 }],
      masterUserId,
      'order-101'
    );

    let currentStock = useStockStore.getState().dailyPrepStock.find((s) => s.product_id === MOCK_ALCATRA.id);
    expect(currentStock?.current_quantity).toBe(20);

    // No fechamento do turno, o churrasqueiro conta fisicamente apenas 18 espetos (quebra de 2 espetos)
    useStockStore.getState().adjustStockPhysicalCount(
      shift.id,
      MOCK_ALCATRA.id,
      18,
      masterUserId,
      '2 espetos caíram/queimaram na brasa'
    );

    currentStock = useStockStore.getState().dailyPrepStock.find((s) => s.product_id === MOCK_ALCATRA.id);
    expect(currentStock?.last_counted_quantity).toBe(18);
    expect(currentStock?.count_difference).toBe(-2); // Divergência de -2
    expect(currentStock?.current_quantity).toBe(18);

    // Deve registrar movimentação do tipo AJUSTE
    const movements = useStockStore.getState().stockMovements;
    const adjustMovement = movements.find((m) => m.movement_type === 'AJUSTE' && m.product_id === MOCK_ALCATRA.id);
    expect(adjustMovement).toBeDefined();
    expect(adjustMovement?.quantity).toBe(-2);
    expect(adjustMovement?.previous_balance).toBe(20);
    expect(adjustMovement?.new_balance).toBe(18);
  });

  it('deve apurar reconciliação do gaveteiro do caixa e fechar o turno com sucesso', () => {
    const { openShift, closeShift } = useShiftStore.getState();
    const shift = openShift(
      'Turno Domingo',
      '',
      300.0, // Fundo inicial R$ 300
      [{ productId: MOCK_ALCATRA.id, quantity: 20 }],
      masterUserId
    );

    // Simula pagamentos em dinheiro lançados na mesa
    useTableStore.setState({
      payments: [
        {
          id: 'pay-1',
          shift_id: shift.id,
          tab_id: 'tab-01',
          amount: 150.0,
          method: 'DINHEIRO',
          status: 'PAID',
          external_reference: null,
          received_by: masterUserId,
          notes: null,
          paid_at: new Date().toISOString(),
        },
        {
          id: 'pay-2',
          shift_id: shift.id,
          tab_id: 'tab-02',
          amount: 50.0,
          method: 'DINHEIRO',
          status: 'PAID',
          external_reference: null,
          received_by: masterUserId,
          notes: null,
          paid_at: new Date().toISOString(),
        },
      ],
    });

    // Fundo inicial 300 + Vendas Dinheiro 200 = R$ 500 esperado
    const expectedCash = 300.0 + 150.0 + 50.0;
    expect(expectedCash).toBe(500.0);

    // Gerente confere o caixa físico e encontra R$ 500 certinho
    closeShift('Turno finalizado com conferência de caixa exata.', 500.0, masterUserId);

    // O turno atual deve ser nulo e constar no histórico como FECHADO
    expect(useShiftStore.getState().currentShift).toBeNull();
    const closedShift = useShiftStore.getState().shiftsHistory.find((s) => s.id === shift.id);
    expect(closedShift).toBeDefined();
    expect(closedShift?.status).toBe('FECHADO');
    expect(closedShift?.cash_drawer_end).toBe(500.0);
    expect(closedShift?.closed_by).toBe(masterUserId);
    expect(closedShift?.closed_at).toBeDefined();
  });

  it('não deve permitir abrir segundo turno simultâneo sem encerrar o primeiro', () => {
    const { openShift } = useShiftStore.getState();
    openShift('Turno 1', '', 200, [], masterUserId);

    expect(() => {
      openShift('Turno 2', '', 200, [], masterUserId);
    }).toThrowError(/Já existe um turno aberto/);
  });
});
