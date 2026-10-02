import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStockStore } from '../../../stores/useStockStore';
import { useShiftStore } from '../../../stores/useShiftStore';
import { useDeliveryStore } from '../../../stores/useDeliveryStore';
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

const MOCK_SKEWER: Product = {
  id: 'prod-picanha',
  category_id: 'cat-espetos',
  name: 'Espeto Picanha Nobre',
  description: 'Picanha maturada na brasa',
  price: 28.0,
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

const MOCK_BEVERAGE: Product = {
  id: 'prod-coca',
  category_id: 'cat-bebidas',
  name: 'Coca-Cola 2L',
  description: 'Gelada',
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
  display_order: 2,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('ETAPA 6: Delivery Próprio & Cardápio Digital', () => {
  const shiftId = 'shift-delivery-01';

  beforeEach(() => {
    useStockStore.setState({
      products: [MOCK_SKEWER, MOCK_BEVERAGE],
      dailyPrepStock: [
        {
          id: 'stock-picanha-01',
          shift_id: shiftId,
          product_id: MOCK_SKEWER.id,
          cubas_count: 0,
          portions_per_cuba: 1,
          initial_quantity: 10,
          current_quantity: 10,
          reserved_quantity: 0,
          consumed_quantity: 0,
          discarded_quantity: 0,
          adjusted_quantity: 0,
          last_counted_quantity: null,
          count_difference: null,
          is_exhausted: false,
          exhausted_at: null,
          exhausted_by: null,
          exhaust_reason: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          updated_by: null,
          version: 1,
        },
        {
          id: 'stock-coca-01',
          shift_id: shiftId,
          product_id: MOCK_BEVERAGE.id,
          cubas_count: 0,
          portions_per_cuba: 1,
          initial_quantity: 5,
          current_quantity: 5,
          reserved_quantity: 0,
          consumed_quantity: 0,
          discarded_quantity: 0,
          adjusted_quantity: 0,
          last_counted_quantity: null,
          count_difference: null,
          is_exhausted: false,
          exhausted_at: null,
          exhausted_by: null,
          exhaust_reason: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          updated_by: null,
          version: 1,
        },
      ],
      stockMovements: [],
    });

    useShiftStore.setState({
      currentShift: {
        id: shiftId,
        date: new Date().toISOString().split('T')[0]!,
        name: 'Turno Noite - Teste Delivery',
        status: 'ABERTO',
        opened_by: 'admin-01',
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

    useDeliveryStore.setState({
      cart: [],
      deliveryOrders: [],
      activeTrackingOrder: null,
    });
  });

  it('deve gerenciar carrinho do cliente (adicionar, alterar quantidade e remover)', () => {
    const { addToCart, updateCartQuantity, removeFromCart, cart } = useDeliveryStore.getState();
    expect(cart.length).toBe(0);

    addToCart(MOCK_SKEWER, 2, 'AO_PONTO', 'Sem sal extra');
    expect(useDeliveryStore.getState().cart.length).toBe(1);
    const item1 = useDeliveryStore.getState().cart[0]!;
    expect(item1.product.name).toBe('Espeto Picanha Nobre');
    expect(item1.quantity).toBe(2);
    expect(item1.doneness).toBe('AO_PONTO');
    expect(item1.notes).toBe('Sem sal extra');

    // Adiciona o mesmo produto com mesmo ponto deve somar quantidade
    addToCart(MOCK_SKEWER, 1, 'AO_PONTO', 'Sem sal extra');
    expect(useDeliveryStore.getState().cart.length).toBe(1);
    expect(useDeliveryStore.getState().cart[0]?.quantity).toBe(3);

    // Altera quantidade diretamente via delta (+2 => 3 + 2 = 5)
    updateCartQuantity(item1.id, 2);
    expect(useDeliveryStore.getState().cart[0]?.quantity).toBe(5);

    // Remove do carrinho
    removeFromCart(item1.id);
    expect(useDeliveryStore.getState().cart.length).toBe(0);
  });

  it('deve realizar pedido atômico com sucesso e abater estoque diário da espetaria', () => {
    const { addToCart, placeDeliveryOrderAtomic } = useDeliveryStore.getState();

    addToCart(MOCK_SKEWER, 3, 'AO_PONTO');
    addToCart(MOCK_BEVERAGE, 1);

    const initialStockPicanha = useStockStore.getState().dailyPrepStock.find((s) => s.product_id === MOCK_SKEWER.id);
    expect(initialStockPicanha?.current_quantity).toBe(10);

    const order = placeDeliveryOrderAtomic({
      shiftId,
      customerName: 'Carlos Delivery',
      phone: '11999887766',
      addressStreet: 'Rua das Flores',
      addressNumber: '123',
      addressNeighborhood: 'Jardim das Américas',
      addressComplement: 'Apto 42',
      paymentMethod: 'PIX',
    });

    expect(order).toBeDefined();
    expect(order.customer_name).toBe('Carlos Delivery');
    expect(order.status).toBe('CONFIRMED');
    expect(order.subtotal).toBe(28.0 * 3 + 14.0 * 1); // 84 + 14 = 98
    expect(order.delivery_fee).toBe(7.0); // Jardim das Américas fee
    expect(order.total).toBe(105.0);
    expect(order.items.length).toBe(2);

    // O carrinho deve ser limpo
    expect(useDeliveryStore.getState().cart.length).toBe(0);

    // O pedido deve constar na lista do despacho e no tracking ativo
    expect(useDeliveryStore.getState().deliveryOrders.length).toBe(1);
    expect(useDeliveryStore.getState().activeTrackingOrder?.id).toBe(order.id);

    // O estoque diário físico da espetaria deve ter sido decrementado atomicamente
    const postStockPicanha = useStockStore.getState().dailyPrepStock.find((s) => s.product_id === MOCK_SKEWER.id);
    expect(postStockPicanha?.current_quantity).toBe(7); // 10 - 3

    const postStockCoca = useStockStore.getState().dailyPrepStock.find((s) => s.product_id === MOCK_BEVERAGE.id);
    expect(postStockCoca?.current_quantity).toBe(4); // 5 - 1
  });

  it('deve rejeitar pedido se a quantidade solicitada exceder o estoque da noite (anti-overselling)', () => {
    const { addToCart, placeDeliveryOrderAtomic } = useDeliveryStore.getState();

    // 1. Tentar adicionar mais do que o estoque físico disponível falha imediatamente no carrinho
    expect(() => {
      addToCart(MOCK_SKEWER, 12, 'BEM_PASSADA');
    }).toThrowError(/não possui quantidade suficiente em estoque/);

    // 2. Adiciona item válido ao carrinho
    addToCart(MOCK_SKEWER, 5, 'AO_PONTO');

    // 3. Força esgotamento do estoque na espetaria antes de finalizar o pedido
    useStockStore.getState().toggleExhaustProduct(shiftId, MOCK_SKEWER.id, true, 'grill-01', 'Esgotado pelo churrasqueiro');

    // Ao tentar finalizar pedido atômico, a transação é bloqueada
    expect(() => {
      placeDeliveryOrderAtomic({
        shiftId,
        customerName: 'João Fome',
        phone: '11988887777',
        addressStreet: 'Av Central',
        addressNumber: '500',
        addressNeighborhood: 'Centro',
        paymentMethod: 'CARTAO_ENTREGA',
      });
    }).toThrowError();

    expect(useDeliveryStore.getState().deliveryOrders.length).toBe(0);
  });

  it('deve acompanhar o ciclo de vida do pedido de entrega (CONFIRMED -> PREPARING -> OUT_FOR_DELIVERY -> DELIVERED)', () => {
    const { addToCart, placeDeliveryOrderAtomic, updateDeliveryStatus } = useDeliveryStore.getState();

    addToCart(MOCK_SKEWER, 1, 'AO_PONTO');
    const order = placeDeliveryOrderAtomic({
      shiftId,
      customerName: 'Marina Silva',
      phone: '11977776666',
      addressStreet: 'Rua do Bosque',
      addressNumber: '45',
      addressNeighborhood: 'Centro',
      paymentMethod: 'DINHEIRO',
      cashChangeFor: 50.0,
    });

    expect(order.status).toBe('CONFIRMED');

    // 1. Cozinha/Churrasqueira inicia preparo
    updateDeliveryStatus(order.id, 'PREPARING');
    let current = useDeliveryStore.getState().deliveryOrders.find((o) => o.id === order.id);
    expect(current?.status).toBe('PREPARING');
    expect(useDeliveryStore.getState().activeTrackingOrder?.status).toBe('PREPARING');

    // 2. Despacho envia com motoboy
    updateDeliveryStatus(order.id, 'OUT_FOR_DELIVERY', 'Marcos Motoboy');
    current = useDeliveryStore.getState().deliveryOrders.find((o) => o.id === order.id);
    expect(current?.status).toBe('OUT_FOR_DELIVERY');
    expect(current?.driver_name).toBe('Marcos Motoboy');
    expect(current?.dispatched_at).toBeDefined();

    // 3. Entregue no destino
    updateDeliveryStatus(order.id, 'DELIVERED');
    current = useDeliveryStore.getState().deliveryOrders.find((o) => o.id === order.id);
    expect(current?.status).toBe('DELIVERED');
    expect(current?.delivered_at).toBeDefined();
    expect(useDeliveryStore.getState().activeTrackingOrder?.status).toBe('DELIVERED');
  });

  it('deve cancelar pedido e estornar estoque de volta ao turno da espetaria', () => {
    const { addToCart, placeDeliveryOrderAtomic, cancelDeliveryOrderAtomic } = useDeliveryStore.getState();

    addToCart(MOCK_SKEWER, 2, 'AO_PONTO');
    const order = placeDeliveryOrderAtomic({
      shiftId,
      customerName: 'Renata Desistiu',
      phone: '11966665555',
      addressStreet: 'Rua Nova',
      addressNumber: '10',
      addressNeighborhood: 'Centro',
      paymentMethod: 'PIX',
    });

    // Estoque decrementou para 8
    expect(useStockStore.getState().dailyPrepStock.find((s) => s.product_id === MOCK_SKEWER.id)?.current_quantity).toBe(8);

    // Cancela pedido
    cancelDeliveryOrderAtomic(order.id, 'Cliente solicitou cancelamento');

    const canceled = useDeliveryStore.getState().deliveryOrders.find((o) => o.id === order.id);
    expect(canceled?.status).toBe('CANCELLED');

    // Estoque deve retornar para 10
    expect(useStockStore.getState().dailyPrepStock.find((s) => s.product_id === MOCK_SKEWER.id)?.current_quantity).toBe(10);
  });
});
