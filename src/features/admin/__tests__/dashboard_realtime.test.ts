import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useShiftStore } from '../../../stores/useShiftStore';
import { useStockStore } from '../../../stores/useStockStore';
import { useTableStore } from '../../../stores/useTableStore';
import { usePrintStore } from '../../../stores/usePrintStore';
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

const MOCK_PICANHA: Product = {
  id: 'prod-picanha-test',
  category_id: 'cat-espetos',
  name: 'Espeto de Picanha Nobre',
  description: 'Grelhado na brasa',
  price: 25.0,
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

describe('Visão Geral e Interligação Operacional em Tempo Real', () => {
  beforeEach(() => {
    // Reset stores
    useShiftStore.setState({ currentShift: null, shiftsHistory: [] });
    useTableStore.setState({
      tabs: [],
      orders: [],
      orderItems: [],
      payments: [],
    });
    useStockStore.setState({
      products: [MOCK_PICANHA],
      dailyPrepStock: [],
      stockMovements: [],
    });
    usePrintStore.setState({ jobs: [] });
  });

  it('1. Deve refletir a abertura de comanda e pedidos no Salão em Atendimento ao Vivo antes do fechamento', () => {
    // Abre turno
    const shift = useShiftStore.getState().openShift(
      'Turno Noite - Teste Visão Geral',
      'Observações iniciais',
      200.0,
      [{ productId: MOCK_PICANHA.id, quantity: 20 }],
      'user-admin'
    );

    const tableId = useTableStore.getState().tables[0]!.id;

    // 1. Abre a comanda na Mesa
    const openTab = useTableStore.getState().openTab(
      tableId,
      'Roberto Cliente',
      3,
      'Mesa de teste',
      'user-waiter',
      shift.id
    );

    expect(openTab.status).toBe('OPEN');
    expect(openTab.people_count).toBe(3);

    // 2. Lança pedido de 2x Picanha (R$ 50,00)
    useTableStore.getState().addOrderAtomic(
      shift.id,
      openTab.id,
      [{ productId: MOCK_PICANHA.id, quantity: 2, doneness: 'AO_PONTO' }],
      'user-waiter'
    );

    const updatedTab = useTableStore.getState().tabs.find((t) => t.id === openTab.id)!;
    expect(updatedTab.subtotal).toBe(50.0);
    // Subtotal 50 + 10% serviço (5.00) = 55.00
    expect(updatedTab.total).toBe(55.0);

    // 3. Verifica dados que alimentam a Visão Geral (Master Dashboard):
    const currentShiftTabs = useTableStore.getState().tabs.filter((t) => t.shift_id === shift.id || t.status === 'OPEN');
    const liveOpenTabs = currentShiftTabs.filter((t) => t.status === 'OPEN');
    const closedTabs = currentShiftTabs.filter((t) => t.status === 'CLOSED');

    const salonOpenGross = liveOpenTabs.reduce((sum, t) => sum + t.subtotal, 0);
    const realizedGrossRevenue = closedTabs.reduce((sum, t) => sum + t.subtotal, 0);
    const projectedGrossRevenue = realizedGrossRevenue + salonOpenGross;

    // A comanda aberta NÃO fica zerada!
    expect(liveOpenTabs.length).toBe(1);
    expect(salonOpenGross).toBe(50.0);
    expect(realizedGrossRevenue).toBe(0.0);
    expect(projectedGrossRevenue).toBe(50.0);

    // Clientes presentes no salão
    const peopleInSalon = liveOpenTabs.reduce((sum, t) => sum + (t.people_count || 1), 0);
    expect(peopleInSalon).toBe(3);
  });

  it('2. Deve integrar pedidos da comanda aberta na Fila de Produção e na Fila de Impressão Térmica', () => {
    const shift = useShiftStore.getState().openShift(
      'Turno Noite - Teste Impressão',
      '',
      150.0,
      [{ productId: MOCK_PICANHA.id, quantity: 15 }],
      'user-admin'
    );

    const tableId = useTableStore.getState().tables[1]!.id;
    const openTab = useTableStore.getState().openTab(
      tableId,
      'Família Silva',
      4,
      '',
      'user-waiter',
      shift.id
    );

    useTableStore.getState().addOrderAtomic(
      shift.id,
      openTab.id,
      [{ productId: MOCK_PICANHA.id, quantity: 3, doneness: 'BEM_PASSADA' }],
      'user-waiter'
    );

    // Verifica itens em preparo
    const pendingItems = useTableStore.getState().orderItems.filter(
      (i) => i.status === 'RECEIVED' || i.status === 'IN_PREPARATION'
    );
    expect(pendingItems.length).toBe(1);
    expect(pendingItems[0]!.sector).toBe('GRILL');
    expect(pendingItems[0]!.quantity).toBe(3);

    // Verifica se a fila de impressão térmica foi enfileirada automaticamente para a Churrasqueira
    const printJobs = usePrintStore.getState().jobs;
    expect(printJobs.length).toBe(1);
    expect(printJobs[0]!.sector).toBe('GRILL');
    expect(printJobs[0]!.items[0]!.name).toBe('Espeto de Picanha Nobre');
  });

  it('3. Deve manter visibilidade de comandas abertas mesmo se consultadas sem turno formal', () => {
    // Situação onde uma comanda foi aberta
    const tableId = useTableStore.getState().tables[2]!.id;
    useTableStore.getState().openTab(
      tableId,
      'Cliente Avulso',
      2,
      '',
      'user-waiter',
      'shift-fallback-id'
    );

    const allTabs = useTableStore.getState().tabs;
    // O fallback da Visão Geral quando currentShift é null deve capturar comandas OPEN
    const liveTabs = allTabs.filter((t) => t.status === 'OPEN');
    expect(liveTabs.length).toBe(1);
    expect(liveTabs[0]!.customer_name).toBe('Cliente Avulso');
  });
});
