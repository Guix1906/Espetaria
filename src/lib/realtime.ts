import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';
import { ProductionSector } from '../types/enums';
import { logger } from './logger';

export interface StockBroadcastPayload {
  shift_id: string;
  product_id: string;
  is_exhausted: boolean;
  reason?: string;
  timestamp: string;
}

export interface OrderBroadcastPayload {
  order_id: string;
  tab_id: string;
  table_number: number;
  sector: 'GRILL' | 'KITCHEN' | 'BAR';
  items: {
    product_name: string;
    quantity: number;
    doneness?: string | null;
    notes?: string | null;
  }[];
}

export interface OrderItemReadyPayload {
  order_id: string;
  order_item_id: string;
  table_number: number;
  product_name: string;
  quantity: number;
  sector: ProductionSector;
  timestamp: string;
}

class RealtimeService {
  private activeChannels: Map<string, RealtimeChannel> = new Map();
  private stockListeners: Set<(payload: StockBroadcastPayload) => void> = new Set();
  private grillListeners: Set<(payload: OrderBroadcastPayload) => void> = new Set();
  private kitchenListeners: Set<(payload: OrderBroadcastPayload) => void> = new Set();
  private barListeners: Set<(payload: OrderBroadcastPayload) => void> = new Set();
  private orderReadyListeners: Set<(payload: OrderItemReadyPayload) => void> = new Set();

  constructor() {
    this.initStockChannel();
    this.initOrdersChannel();
  }

  /**
   * Canal de Alta Prioridade para Esgotar/Reativar Produtos (< 100ms)
   */
  private initStockChannel(): void {
    if (!isSupabaseConfigured) return;

    try {
      const channel = supabase.channel('stock-events', {
        config: { broadcast: { self: false } },
      });

      channel
        .on('broadcast', { event: 'STOCK_AVAILABILITY_CHANGED' }, ({ payload }) => {
          logger.info({
            context: 'RealtimeService',
            message: `Evento de estoque recebido via WebSocket: Produto ${payload.product_id}, Esgotado: ${payload.is_exhausted}`,
          });
          this.stockListeners.forEach((listener) => listener(payload as StockBroadcastPayload));
        })
        .subscribe((status) => {
          logger.debug({ context: 'RealtimeService', message: `Canal stock-events status: ${status}` });
        });

      this.activeChannels.set('stock-events', channel);
    } catch (err) {
      logger.warn({ context: 'RealtimeService', message: 'Erro ao assinar canal de estoque', error: err });
    }
  }

  /**
   * Canal de Pedidos por Setor (Churrasqueira, Cozinha & Bar) e Alertas de Pronto
   */
  private initOrdersChannel(): void {
    if (!isSupabaseConfigured) return;

    try {
      const channel = supabase.channel('production-orders', {
        config: { broadcast: { self: false } },
      });

      channel
        .on('broadcast', { event: 'NEW_PRODUCTION_ORDER' }, ({ payload }) => {
          const order = payload as OrderBroadcastPayload;
          logger.info({
            context: 'RealtimeService',
            message: `Novo pedido recebido para setor ${order.sector} (Mesa ${order.table_number})`,
          });

          if (order.sector === 'GRILL') {
            this.grillListeners.forEach((l) => l(order));
          } else if (order.sector === 'KITCHEN') {
            this.kitchenListeners.forEach((l) => l(order));
          } else if (order.sector === 'BAR') {
            this.barListeners.forEach((l) => l(order));
          }
        })
        .on('broadcast', { event: 'ORDER_ITEM_READY' }, ({ payload }) => {
          const itemReady = payload as OrderItemReadyPayload;
          logger.info({
            context: 'RealtimeService',
            message: `Item pronto para servir: Mesa ${itemReady.table_number} (${itemReady.product_name})`,
          });
          this.orderReadyListeners.forEach((l) => l(itemReady));
        })
        .subscribe((status) => {
          logger.debug({ context: 'RealtimeService', message: `Canal production-orders status: ${status}` });
        });

      this.activeChannels.set('production-orders', channel);
    } catch (err) {
      logger.warn({ context: 'RealtimeService', message: 'Erro ao assinar canal de produção', error: err });
    }
  }

  /**
   * Dispara broadcast imediato de produto esgotado para todos os dispositivos
   */
  public async broadcastExhaustion(
    shiftId: string,
    productId: string,
    isExhausted: boolean,
    reason?: string
  ): Promise<void> {
    const payload: StockBroadcastPayload = {
      shift_id: shiftId,
      product_id: productId,
      is_exhausted: isExhausted,
      reason,
      timestamp: new Date().toISOString(),
    };

    // Notifica ouvintes locais no mesmo browser
    this.stockListeners.forEach((l) => l(payload));

    const channel = this.activeChannels.get('stock-events');
    if (channel && isSupabaseConfigured) {
      await channel.send({
        type: 'broadcast',
        event: 'STOCK_AVAILABILITY_CHANGED',
        payload,
      });
      logger.info({
        context: 'RealtimeService',
        message: `Broadcast de esgotamento transmitido: ${productId} -> ${isExhausted}`,
      });
    }
  }

  /**
   * Dispara broadcast de novo pedido para a tela da churrasqueira, cozinha ou bar
   */
  public async broadcastNewOrder(order: OrderBroadcastPayload): Promise<void> {
    if (order.sector === 'GRILL') {
      this.grillListeners.forEach((l) => l(order));
    } else if (order.sector === 'KITCHEN') {
      this.kitchenListeners.forEach((l) => l(order));
    } else if (order.sector === 'BAR') {
      this.barListeners.forEach((l) => l(order));
    }

    const channel = this.activeChannels.get('production-orders');
    if (channel && isSupabaseConfigured) {
      await channel.send({
        type: 'broadcast',
        event: 'NEW_PRODUCTION_ORDER',
        payload: order,
      });
    }
  }

  /**
   * Dispara broadcast de item pronto para servir na mesa
   */
  public async broadcastOrderReady(payload: OrderItemReadyPayload): Promise<void> {
    // Notifica listeners locais
    this.orderReadyListeners.forEach((l) => l(payload));

    const channel = this.activeChannels.get('production-orders');
    if (channel && isSupabaseConfigured) {
      await channel.send({
        type: 'broadcast',
        event: 'ORDER_ITEM_READY',
        payload,
      });
    }
  }

  /**
   * Registra listener de alterações de estoque
   */
  public onStockChange(callback: (payload: StockBroadcastPayload) => void): () => void {
    this.stockListeners.add(callback);
    return () => {
      this.stockListeners.delete(callback);
    };
  }

  /**
   * Registra listener de pedidos para a Churrasqueira
   */
  public onGrillOrder(callback: (payload: OrderBroadcastPayload) => void): () => void {
    this.grillListeners.add(callback);
    return () => {
      this.grillListeners.delete(callback);
    };
  }

  /**
   * Registra listener de pedidos para a Cozinha
   */
  public onKitchenOrder(callback: (payload: OrderBroadcastPayload) => void): () => void {
    this.kitchenListeners.add(callback);
    return () => {
      this.kitchenListeners.delete(callback);
    };
  }

  /**
   * Registra listener de pedidos para o Bar
   */
  public onBarOrder(callback: (payload: OrderBroadcastPayload) => void): () => void {
    this.barListeners.add(callback);
    return () => {
      this.barListeners.delete(callback);
    };
  }

  /**
   * Registra listener de pedidos prontos para servir
   */
  public onOrderReady(callback: (payload: OrderItemReadyPayload) => void): () => void {
    this.orderReadyListeners.add(callback);
    return () => {
      this.orderReadyListeners.delete(callback);
    };
  }

  /**
   * Desconecta e limpa canais de forma segura (evita memory leaks)
   */
  public cleanup(): void {
    this.activeChannels.forEach((channel) => {
      channel.unsubscribe();
    });
    this.activeChannels.clear();
    this.stockListeners.clear();
    this.grillListeners.clear();
    this.kitchenListeners.clear();
    this.barListeners.clear();
    this.orderReadyListeners.clear();
  }
}

export const realtimeService = new RealtimeService();
