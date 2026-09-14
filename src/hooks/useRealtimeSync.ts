import { useEffect } from 'react';
import { realtimeService } from '../lib/realtime';
import { audioService } from '../lib/audio';
import { useStockStore } from '../stores/useStockStore';
import { useAuthStore } from '../stores/useAuthStore';
import { logger } from '../lib/logger';

export function useRealtimeSync() {
  const { toggleExhaustProduct } = useStockStore();
  const { currentProfile } = useAuthStore();

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
        payload.reason
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

    return () => {
      unsubscribeStock();
      unsubscribeGrill();
      unsubscribeKitchen();
    };
  }, [toggleExhaustProduct, currentProfile.role]);
}
