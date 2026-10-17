import { describe, it, expect, beforeEach, vi } from 'vitest';
import { audioService } from '../audio';
import { realtimeService, StockBroadcastPayload, OrderBroadcastPayload } from '../realtime';

describe('ETAPA 2: Realtime WebSockets & Web Audio API (Espetaria)', () => {
  const mockStorage: Record<string, string> = {};

  beforeEach(() => {
    // Mock local storage for Node test environment
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => mockStorage[k] ?? null,
        setItem: (k: string, v: string) => { mockStorage[k] = v; },
        removeItem: (k: string) => { delete mockStorage[k]; },
        clear: () => {
          Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
        },
      }
    });

    realtimeService.cleanup();
  });

  it('1. AudioService deve gerenciar e persistir o estado de ativação de som', () => {
    audioService.setAudioEnabled(false);
    expect(audioService.getAudioEnabled()).toBe(false);

    audioService.setAudioEnabled(true);
    expect(audioService.getAudioEnabled()).toBe(true);

    audioService.setAudioEnabled(false);
    expect(audioService.getAudioEnabled()).toBe(false);
  });

  it('2. RealtimeService deve propagar broadcast de produto esgotado para ouvintes inscritos', async () => {
    let receivedPayload: StockBroadcastPayload | null = null;

    const unsubscribe = realtimeService.onStockChange((payload) => {
      receivedPayload = payload;
    });

    await realtimeService.broadcastExhaustion(
      'shift-123',
      'prod-picanha',
      true,
      'Acabou picanha na grelha'
    );

    expect(receivedPayload).not.toBeNull();
    const payload = receivedPayload as unknown as StockBroadcastPayload;
    expect(payload.product_id).toBe('prod-picanha');
    expect(payload.is_exhausted).toBe(true);
    expect(payload.reason).toBe('Acabou picanha na grelha');

    // Desinscreve e garante que não recebe novas mensagens
    unsubscribe();
    receivedPayload = null;

    await realtimeService.broadcastExhaustion('shift-123', 'prod-alcatra', true);
    expect(receivedPayload).toBeNull();
  });

  it('3. RealtimeService deve rotear pedidos para o setor correto (GRILL vs KITCHEN)', async () => {
    let grillOrder: OrderBroadcastPayload | null = null;
    let kitchenOrder: OrderBroadcastPayload | null = null;

    const unsubGrill = realtimeService.onGrillOrder((order) => {
      grillOrder = order;
    });

    const unsubKitchen = realtimeService.onKitchenOrder((order) => {
      kitchenOrder = order;
    });

    // Envia pedido para Churrasqueira
    await realtimeService.broadcastNewOrder({
      order_id: 'ord-1',
      tab_id: 'tab-1',
      table_number: 8,
      sector: 'GRILL',
      items: [{ product_name: 'Espeto de Picanha', quantity: 2, doneness: 'AO_PONTO' }],
    });

    expect(grillOrder).not.toBeNull();
    const gOrder = grillOrder as unknown as OrderBroadcastPayload;
    expect(gOrder.table_number).toBe(8);
    expect(kitchenOrder).toBeNull(); // Cozinha não recebeu

    // Envia pedido para Cozinha
    await realtimeService.broadcastNewOrder({
      order_id: 'ord-2',
      tab_id: 'tab-1',
      table_number: 8,
      sector: 'KITCHEN',
      items: [{ product_name: 'Arroz Branco', quantity: 1 }],
    });

    expect(kitchenOrder).not.toBeNull();
    const kOrder = kitchenOrder as unknown as OrderBroadcastPayload;
    expect(kOrder.table_number).toBe(8);

    unsubGrill();
    unsubKitchen();
  });

  it('4. RealtimeService deve executar cleanup() sem vazamento de memória ou erros', () => {
    realtimeService.onStockChange(() => {});
    realtimeService.onGrillOrder(() => {});
    realtimeService.onKitchenOrder(() => {});

    expect(() => realtimeService.cleanup()).not.toThrow();
  });
});
