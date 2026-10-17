import { useFeedback } from '../../components/ui/FeedbackProvider';
import { askReturnToStock } from '../../lib/askReturnToStock';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDeliveryStore } from '../../stores/useDeliveryStore';
import type { DeliveryOrder } from '../../types/domain';

/**
 * Cancelar pedido de delivery/retirada (mesma regra do banco, cancel_delivery_order):
 * gerência e caixa logados; pede motivo e, se estiver na brasa, se volta ao estoque.
 * Nada é apagado: o pedido fica como cancelado e registrado na auditoria.
 */
export function useCancelDeliveryOrder() {
  const { requestText, requestChoice, notify } = useFeedback();
  const { currentProfile, isAuthenticated } = useAuthStore();
  const canCancel = isAuthenticated && ['MASTER', 'GERENTE', 'CAIXA'].includes(currentProfile.role);
  const isCancellable = (order: DeliveryOrder) => order.status !== 'DELIVERED' && order.status !== 'CANCELLED';

  const cancel = async (order: DeliveryOrder) => {
    try {
      const reason = await requestText({ title: `Cancelar pedido #${order.order_number}`, label: 'Motivo do cancelamento', confirmText: 'Cancelar pedido', danger: true, message: 'O pedido sai da fila e da produção e fica registrado como cancelado.', initialValue: 'Desistência do cliente' });
      if (!reason) return false;
      let returnStock: boolean | undefined;
      if (order.status === 'PREPARING') {
        const answer = await askReturnToStock(requestChoice, `pedido #${order.order_number}`);
        if (answer === null) return false;
        returnStock = answer;
      }
      useDeliveryStore.getState().cancelDeliveryOrderAtomic(order.id, reason, currentProfile.id, returnStock);
      notify(`Pedido #${order.order_number} cancelado.`, 'success');
      return true;
    } catch (error: unknown) {
      notify(error instanceof Error ? error.message : 'Não foi possível cancelar o pedido. Tente novamente.', 'error');
      return false;
    }
  };

  return { canCancel, isCancellable, cancel };
}
