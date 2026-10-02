import { useEffect } from 'react';
import { realtimeService } from '../lib/realtime';
import { syncService } from '../lib/syncService';
import { audioService } from '../lib/audio';
import { useStockStore } from '../stores/useStockStore';
import { useAuthStore } from '../stores/useAuthStore';
import { logger } from '../lib/logger';

export function useRealtimeSync() {
  const { toggleExhaustProduct } = useStockStore();
  const { currentProfile, isAuthenticated } = useAuthStore();

  // 0. Hidratação e assinatura do Postgres só após login (o RLS exige usuário autenticado)
  useEffect(() => {
    if (!isAuthenticated) return;
    void syncService.hydrateAll();
    return syncService.subscribeToDatabaseChanges();
  }, [isAuthenticated]);

  useEffect(() => {

    // 1. Escuta mudanças imediatas de disponibilidade de estoque
    const unsubscribeStock = realtimeService.onStockChange((payload) => {
      logger.info({
        context: 'useRealtimeSync',
        message: `Sincronizando estado local do produto ${payload.product_id} (Esgotado: ${payload.is_exhausted})`,
      });

      toggleExhaustProduct(
        payload.shift_id,
        payload.product_id,
        payload.is_exhausted,
        'remote-sync-user',
        payload.reason,
        true
      );
    });

    // 2. Escuta novos pedidos para a Churrasqueira com sinal sonoro
    const unsubscribeGrill = realtimeService.onGrillOrder((payload) => {
      if (['CHURRASQUEIRA', 'GERENTE', 'MASTER'].includes(currentProfile.role)) {
        logger.info({
          context: 'useRealtimeSync',
          message: `Novo pedido na brasa para Mesa ${payload.table_number}! Tocando alerta acústico.`,
        });
        audioService.playNewOrderSound();
      }
    });

    // 3. Escuta novos pedidos para a Cozinha com sinal sonoro
    const unsubscribeKitchen = realtimeService.onKitchenOrder((payload) => {
      if (['COZINHA', 'GERENTE', 'MASTER'].includes(currentProfile.role)) {
        logger.info({
          context: 'useRealtimeSync',
          message: `Novo pedido de cozinha para Mesa ${payload.table_number}! Tocando alerta acústico.`,
        });
        audioService.playNewOrderSound();
      }
    });

    // 4. Escuta novos pedidos para o Bar com sinal sonoro
    const unsubscribeBar = realtimeService.onBarOrder((payload) => {
      if (['BAR', 'GERENTE', 'MASTER'].includes(currentProfile.role)) {
        logger.info({
          context: 'useRealtimeSync',
          message: `Novo pedido de bebidas para Mesa ${payload.table_number}! Tocando alerta acústico.`,
        });
        audioService.playNewOrderSound();
      }
    });

    // 5. Escuta pedidos prontos para entrega pelo garçom com sinal sonoro
    const unsubscribeReady = realtimeService.onOrderReady((payload) => {
      if (['GARCOM', 'GERENTE', 'MASTER'].includes(currentProfile.role)) {
        logger.info({
          context: 'useRealtimeSync',
          message: `Item pronto para servir na Mesa ${payload.table_number} (${payload.product_name})! Tocando alerta acústico.`,
        });
        audioService.playOrderReadySound();
      }
    });

    return () => {
      unsubscribeStock();
      unsubscribeGrill();
      unsubscribeKitchen();
      unsubscribeBar();
      unsubscribeReady();
    };
  }, [toggleExhaustProduct, currentProfile.role]);
}
