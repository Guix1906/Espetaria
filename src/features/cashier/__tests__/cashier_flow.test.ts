import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStockStore } from '../../../stores/useStockStore';
import { useTableStore } from '../../../stores/useTableStore';
import { useShiftStore } from '../../../stores/useShiftStore';
import { Product } from '../../../types/domain';
import { setServiceFeeRate } from '../../../lib/utils';
// Estes testes conferem a conta com taxa de serviço de 10%
setServiceFeeRate(10);

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

const MOCK_PRODUCT_A: Product = {
  id: 'prod-espeto-misto',
  category_id: 'cat-espetos',
  name: 'Espeto Misto Especial',
  description: 'Carne e linguiça',
  price: 20.0,
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

const MOCK_PRODUCT_B: Product = {
  id: 'prod-chopp',
  category_id: 'cat-bebidas',
  name: 'Chopp Artesanal 500ml',
  description: 'Chopp pilsen gelado',
  price: 15.0,
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
  display_order: 2,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('ETAPA 5: Módulo do Caixa & Fechamento de Mesas', () => {
  const shiftId = 'shift-caixa-01';
  const userId = 'user-caixa-01';

  beforeEach(() => {
    useStockStore.setState({
      products: [MOCK_PRODUCT_A, MOCK_PRODUCT_B],
      dailyPrepStock: [],
      stockMovements: [],
    });

    useShiftStore.setState({
      currentShift: {
        id: shiftId,
        date: new Date().toISOString().split('T')[0]!,
        name: 'Turno Noite - Teste Caixa',
        status: 'ABERTO',
        opened_by: userId,
        closed_by: null,
        opened_at: new Date().toISOString(),
        closed_at: null,
        initial_notes: null,
        closing_notes: null,
        cash_drawer_start: 500,
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
      payments: [],
    });

    useStockStore.getState().initShiftStock(
      shiftId,
      [
        { productId: MOCK_PRODUCT_A.id, quantity: 50 },
        { productId: MOCK_PRODUCT_B.id, quantity: 50 },
      ],
      userId
    );
  });

  it('1. Deve calcular subtotal, alternar taxa de serviço (10%) e aplicar desconto com recálculo do total', () => {
    const tableId = useTableStore.getState().tables[0]!.id; // Mesa 1
    const tab = useTableStore.getState().openTab(tableId, 'Família Oliveira', 3, '', userId, shiftId);

    // Lança 2 espetos mistos (R$ 40) e 2 chopps (R$ 30) = Subtotal R$ 70,00
    useTableStore.getState().addOrderAtomic(
      shiftId,
      tab.id,
      [
        { productId: MOCK_PRODUCT_A.id, quantity: 2 },
        { productId: MOCK_PRODUCT_B.id, quantity: 2 },
      ],
      userId
    );

    let currentTab = useTableStore.getState().tabs.find((t) => t.id === tab.id)!;
    expect(currentTab.subtotal).toBe(70.0);
    expect(currentTab.service_fee).toBe(7.0); // 10%
    expect(currentTab.discount).toBe(0);
    expect(currentTab.total).toBe(77.0);

    // Cliente opta por NÃO pagar taxa de 10%
    useTableStore.getState().updateTabBillAdjustments(currentTab.id, {
      includeServiceFee: false,
      discountAmount: 0,
    });

    currentTab = useTableStore.getState().tabs.find((t) => t.id === tab.id)!;
    expect(currentTab.service_fee).toBe(0);
    expect(currentTab.total).toBe(70.0);

    // Caixa aplica cortesia/desconto de R$ 10,00
    useTableStore.getState().updateTabBillAdjustments(currentTab.id, {
      includeServiceFee: false,
      discountAmount: 10.0,
    });

    currentTab = useTableStore.getState().tabs.find((t) => t.id === tab.id)!;
    expect(currentTab.discount).toBe(10.0);
    expect(currentTab.total).toBe(60.0); // 70 - 10 = 60
  });

  it('2. Deve permitir pagamento multimeios dividido (ex: parte PIX e parte Débito)', () => {
    const tableId = useTableStore.getState().tables[1]!.id; // Mesa 2
    const tab = useTableStore.getState().openTab(tableId, 'Mesa Dividida', 2, '', userId, shiftId);

    // 4 Chopps = R$ 60,00 (+ 10% = R$ 66,00)
    useTableStore.getState().addOrderAtomic(
      shiftId,
      tab.id,
      [{ productId: MOCK_PRODUCT_B.id, quantity: 4 }],
      userId
    );

    const currentTab = useTableStore.getState().tabs.find((t) => t.id === tab.id)!;
    expect(currentTab.total).toBe(66.0);

    // Pagamento 1: R$ 36,00 via PIX
    const payment1 = useTableStore.getState().addPaymentAtomic(
      shiftId,
      tab.id,
      36.0,
      'PIX',
      userId,
      'Amigo 1'
    );
    expect(payment1.amount).toBe(36.0);
    expect(payment1.method).toBe('PIX');

    // Pagamento 2: R$ 30,00 via Cartão de Débito
    const payment2 = useTableStore.getState().addPaymentAtomic(
      shiftId,
      tab.id,
      30.0,
      'DEBITO',
      userId,
      'Amigo 2'
    );
    expect(payment2.amount).toBe(30.0);
    expect(payment2.method).toBe('DEBITO');

    const tabPayments = useTableStore.getState().getTabPayments(tab.id);
    expect(tabPayments.length).toBe(2);
    const sumPaid = tabPayments.reduce((s, p) => s + p.amount, 0);
    expect(sumPaid).toBe(66.0);
  });

  it('3. NUNCA deve permitir fechar comanda com valor pago inferior ao total (Trava de Segurança)', () => {
    const tableId = useTableStore.getState().tables[2]!.id; // Mesa 3
    const tab = useTableStore.getState().openTab(tableId, 'Mesa Inadimplente', 1, '', userId, shiftId);

    // Consumo de R$ 20,00 + 10% = R$ 22,00
    useTableStore.getState().addOrderAtomic(
      shiftId,
      tab.id,
      [{ productId: MOCK_PRODUCT_A.id, quantity: 1 }],
      userId
    );

    // Paga apenas R$ 15,00
    useTableStore.getState().addPaymentAtomic(shiftId, tab.id, 15.0, 'DINHEIRO', userId);

    // Tentativa de fechar conta deve ser rejeitada
    expect(() => {
      useTableStore.getState().closeTabAtomic(shiftId, tab.id, userId);
    }).toThrow(/Pagamento insuficiente/i);

    // A mesa deve continuar ocupada
    const table = useTableStore.getState().tables.find((t) => t.id === tableId)!;
    expect(table.status).toBe('OCUPADA');
    const tabStillOpen = useTableStore.getState().tabs.find((t) => t.id === tab.id)!;
    expect(tabStillOpen.status).toBe('OPEN');
  });

  it('4. Fechamento com sucesso: encerra comanda, libera mesa, fecha pedidos e retorna recibo completo', () => {
    const tableId = useTableStore.getState().tables[3]!.id; // Mesa 4
    const tab = useTableStore.getState().openTab(tableId, 'Mesa 4 Fechamento', 2, '', userId, shiftId);

    useTableStore.getState().addOrderAtomic(
      shiftId,
      tab.id,
      [{ productId: MOCK_PRODUCT_A.id, quantity: 2 }], // R$ 40 + R$ 4 (10%) = R$ 44,00
      userId
    );

    const currentTab = useTableStore.getState().tabs.find((t) => t.id === tab.id)!;
    expect(currentTab.total).toBe(44.0);

    // Quita integralmente os R$ 44,00 via Cartão de Crédito
    useTableStore.getState().addPaymentAtomic(shiftId, tab.id, 44.0, 'CREDITO', userId);

    // Fecha a comanda
    const receipt = useTableStore.getState().closeTabAtomic(shiftId, tab.id, userId);

    expect(receipt.tab.status).toBe('CLOSED');
    expect(receipt.tab.closed_at).not.toBeNull();
    expect(receipt.tab.closed_by).toBe(userId);
    expect(receipt.payments.length).toBe(1);
    expect(receipt.items.length).toBe(1);

    // Mesa deve estar livre e desvinculada
    const tableAfterClose = useTableStore.getState().tables.find((t) => t.id === tableId)!;
    expect(tableAfterClose.status).toBe('LIVRE');
    expect(tableAfterClose.current_tab).toBeUndefined();

    // Pedidos vinculados devem estar com status CLOSED
    const tabOrders = useTableStore.getState().orders.filter((o) => o.tab_id === tab.id);
    expect(tabOrders.every((o) => o.status === 'CLOSED')).toBe(true);
  });

  it('5. Reabertura de comanda por Gerente/Master restaura o status e reocupa a mesa', () => {
    const tableId = useTableStore.getState().tables[4]!.id; // Mesa 5
    const tab = useTableStore.getState().openTab(tableId, 'Mesa 5 Reabrir', 1, '', userId, shiftId);

    useTableStore.getState().addOrderAtomic(
      shiftId,
      tab.id,
      [{ productId: MOCK_PRODUCT_B.id, quantity: 1 }], // R$ 15 + R$ 1.50 = R$ 16.50
      userId
    );

    useTableStore.getState().addPaymentAtomic(shiftId, tab.id, 16.50, 'PIX', userId);
    useTableStore.getState().closeTabAtomic(shiftId, tab.id, userId);

    // Mesa está LIVRE agora
    let table = useTableStore.getState().tables.find((t) => t.id === tableId)!;
    expect(table.status).toBe('LIVRE');

    // Gerente detecta erro e reabre a comanda
    useTableStore.getState().reopenTabAtomic(tab.id, userId, 'Cliente esqueceu de pagar sobremesa adicional');

    const reopenedTab = useTableStore.getState().tabs.find((t) => t.id === tab.id)!;
    expect(reopenedTab.status).toBe('OPEN');
    expect(reopenedTab.closed_at).toBeNull();

    table = useTableStore.getState().tables.find((t) => t.id === tableId)!;
    expect(table.status).toBe('OCUPADA');
    expect(table.current_tab?.id).toBe(tab.id);
  });
});
