import { describe, it, expect, beforeEach } from 'vitest';
import { useTableStore } from '../../../stores/useTableStore';
import { useStockStore } from '../../../stores/useStockStore';
import { usePrintStore } from '../../../stores/usePrintStore';
import { useAuthStore } from '../../../stores/useAuthStore';
import type { Product, RestaurantTable, Profile } from '../../../types/domain';

const mockWaiter: Profile = {
  id: 'waiter-1',
  name: 'Garçom João',
  email: 'garcom@teste.com',
  role: 'GARCOM',
  is_active: true,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

const mockTable: RestaurantTable = {
  id: 'table-10',
  number: 10,
  status: 'LIVRE',
  capacity: 4,
  active: true,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  updated_by: 'system',
  version: 1,
};

const picanha: Product = {
  id: 'prod-picanha',
  category_id: 'cat-espetos',
  name: 'Picanha',
  price: 25.0,
  type: 'ESPETO',
  sector: 'GRILL',
  active: true,
  available: true,
  tracks_stock: true,
  allows_doneness: true,
  allows_notes: true,
  display_order: 1,
  description: null,
  image_url: null,
  is_cubas: false,
  portions_per_cuba: 1,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

const alcatra: Product = {
  id: 'prod-alcatra',
  category_id: 'cat-espetos',
  name: 'Alcatra',
  price: 20.0,
  type: 'ESPETO',
  sector: 'GRILL',
  active: true,
  available: true,
  tracks_stock: true,
  allows_doneness: true,
  allows_notes: true,
  display_order: 2,
  description: null,
  image_url: null,
  is_cubas: false,
  portions_per_cuba: 1,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

describe('Troca Inteligente de Item e Reenvio à Produção', () => {
  beforeEach(() => {
    useAuthStore.setState({ currentProfile: mockWaiter });
    useTableStore.setState({
      tables: [mockTable],
      tabs: [],
      orders: [],
      orderItems: [],
      payments: [],
    });
    useStockStore.setState({
      products: [picanha, alcatra],
      dailyPrepStock: [],
      stockMovements: [],
    });
    usePrintStore.setState({
      jobs: [],
    });
  });

  it('permite ao garçom trocar um item lançado por engano com atualização atômica e cupons para churrasqueira', () => {
    const shiftId = 'shift-1';
    useStockStore.getState().initShiftStock(
      shiftId,
      [
        { productId: alcatra.id, quantity: 5 },
        { productId: picanha.id, quantity: 5 },
      ],
      mockWaiter.id
    );

    // 1. Abre mesa e lança Alcatra
    const tab = useTableStore.getState().openTab(mockTable.id, 'Mesa 10', 2, '', mockWaiter.id, shiftId);
    useTableStore.getState().addOrderAtomic(
      shiftId,
      tab.id,
      [{ productId: alcatra.id, quantity: 1, doneness: 'BEM_PASSADA' }],
      mockWaiter.id
    );

    const initialItems = useTableStore.getState().orderItems;
    expect(initialItems).toHaveLength(1);
    const oldItem = initialItems[0]!;
    expect(oldItem.product_name).toBe('Alcatra');
    expect(oldItem.status).toBe('IN_PREPARATION');

    // Estoque após pedido inicial: Alcatra deve ter 4 restantes
    let alcatraStock = useStockStore.getState().dailyPrepStock.find((d) => d.product_id === alcatra.id);
    expect(alcatraStock?.current_quantity).toBe(4);

    // 2. Garçom troca Alcatra por Picanha (ao ponto)
    const newItem = useTableStore.getState().swapOrderItemAtomic(
      oldItem.id,
      picanha.id,
      1,
      'AO_PONTO',
      'Cliente pediu para trocar',
      mockWaiter.id,
      shiftId,
      true // Devolve Alcatra ao estoque
    );

    expect(newItem.product_name).toBe('Picanha');
    expect(newItem.doneness).toBe('AO_PONTO');
    expect(newItem.status).toBe('IN_PREPARATION');

    // 3. Verifica estado dos itens
    const updatedItems = useTableStore.getState().orderItems;
    expect(updatedItems).toHaveLength(2);
    const cancelledOld = updatedItems.find((i) => i.id === oldItem.id);
    expect(cancelledOld?.status).toBe('CANCELLED');

    // 4. Verifica devolução de estoque da Alcatra e baixa da Picanha
    alcatraStock = useStockStore.getState().dailyPrepStock.find((d) => d.product_id === alcatra.id);
    expect(alcatraStock?.current_quantity).toBe(5); // Voltou para 5!

    const picanhaStock = useStockStore.getState().dailyPrepStock.find((d) => d.product_id === picanha.id);
    expect(picanhaStock?.current_quantity).toBe(4); // Baixou para 4!

    // 5. Verifica recálculo financeiro da comanda (Alcatra R$20 -> Picanha R$25)
    const updatedTab = useTableStore.getState().tabs.find((t) => t.id === tab.id);
    expect(updatedTab?.subtotal).toBe(25.0);

    // 6. Verifica cupons enfileirados na fila de impressão
    const printJobs = usePrintStore.getState().jobs;
    expect(printJobs.length).toBeGreaterThanOrEqual(2);

    const cancelJob = printJobs.find((j) => j.items.some((i) => i.name.includes('[CANCELADO] Alcatra')));
    expect(cancelJob).toBeDefined();
    expect(cancelJob?.sector).toBe('GRILL');

    const newOrderJob = printJobs.find((j) => j.items.some((i) => i.name === 'Picanha'));
    expect(newOrderJob).toBeDefined();
    expect(newOrderJob?.sector).toBe('GRILL');
  });

  it('permite reenviar/reimprimir um item específico para a produção (2ª Via)', async () => {
    const shiftId = 'shift-1';
    useStockStore.getState().initShiftStock(shiftId, [{ productId: picanha.id, quantity: 5 }], mockWaiter.id);

    const tab = useTableStore.getState().openTab(mockTable.id, 'Mesa 10', 2, '', mockWaiter.id, shiftId);
    useTableStore.getState().addOrderAtomic(
      shiftId,
      tab.id,
      [{ productId: picanha.id, quantity: 2, doneness: 'AO_PONTO' }],
      mockWaiter.id
    );

    const item = useTableStore.getState().orderItems[0]!;

    const ok = await useTableStore.getState().reprintOrderItemProduction(item.id, 'Churrasqueiro pediu 2ª via');
    expect(ok).toBe(true);

    const jobs = usePrintStore.getState().jobs;
    const reprintJob = jobs.find((j) => j.is_reprint);
    expect(reprintJob).toBeDefined();
    expect(reprintJob?.reprint_reason).toContain('Churrasqueiro');
  });

  it('permite reenviar todos os pedidos da mesa para a produção', async () => {
    const shiftId = 'shift-1';
    useStockStore.getState().initShiftStock(shiftId, [{ productId: picanha.id, quantity: 5 }], mockWaiter.id);

    const tab = useTableStore.getState().openTab(mockTable.id, 'Mesa 10', 2, '', mockWaiter.id, shiftId);
    useTableStore.getState().addOrderAtomic(
      shiftId,
      tab.id,
      [{ productId: picanha.id, quantity: 1, doneness: 'AO_PONTO' }],
      mockWaiter.id
    );

    const ok = await useTableStore.getState().reprintTableProduction(mockTable.id);
    expect(ok).toBe(true);

    const jobs = usePrintStore.getState().jobs;
    const reprintJob = jobs.find((j) => j.is_reprint);
    expect(reprintJob).toBeDefined();
  });
});
