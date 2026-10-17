import type { DeliveryOrder, DeliveryOrderType, DeliveryPaymentMethod, DeliveryStatus } from '../types/domain';

type StatusConfig = { label: string; description: string; classes: string };

const statuses: Record<DeliveryStatus, StatusConfig> = {
  AWAITING_PAYMENT: { label: 'Aguardando PIX', description: 'Pague o PIX abaixo. Assim que o pagamento for confirmado, seu pedido vai para a brasa.', classes: 'border-amber-200 bg-amber-50 text-amber-800' },
  PENDING: { label: 'Aguardando confirmação', description: 'O pedido está aguardando confirmação da espetaria.', classes: 'border-amber-200 bg-amber-50 text-amber-800' },
  CONFIRMED: { label: 'Confirmado', description: 'Recebemos seu pedido. Ele entrará na fila de preparo.', classes: 'border-sky-200 bg-sky-50 text-sky-800' },
  PREPARING: { label: 'Na brasa', description: 'Seu pedido já está sendo preparado.', classes: 'border-amber-200 bg-amber-50 text-amber-800' },
  READY: { label: 'Pronto', description: 'Seu pedido está pronto e sai para entrega em instantes.', classes: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  OUT_FOR_DELIVERY: { label: 'A caminho', description: 'Seu pedido saiu para entrega.', classes: 'border-sky-200 bg-sky-50 text-sky-800' },
  DELIVERED: { label: 'Entregue', description: 'Entrega concluída. Bom apetite!', classes: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  CANCELLED: { label: 'Cancelado', description: 'Este pedido foi cancelado. Entre em contato se precisar de ajuda.', classes: 'border-rose-200 bg-rose-50 text-rose-800' },
};

// Retirada no local: muda só o texto das etapas finais
const pickupStatuses: Partial<Record<DeliveryStatus, Partial<StatusConfig>>> = {
  READY: { label: 'Pronto para retirada', description: 'Seu pedido está pronto. Pode vir buscar!' },
  DELIVERED: { label: 'Retirado', description: 'Pedido retirado. Bom apetite!' },
};

export function getDeliveryStatusConfig(status: DeliveryStatus, orderType: DeliveryOrderType = 'DELIVERY'): StatusConfig {
  return orderType === 'PICKUP' ? { ...statuses[status], ...pickupStatuses[status] } : statuses[status];
}

export function isPickupOrder(order: Pick<DeliveryOrder, 'order_type'>): boolean {
  return order.order_type === 'PICKUP';
}

export function deliveryPaymentLabel(method: DeliveryPaymentMethod, orderType: DeliveryOrderType = 'DELIVERY'): string {
  if (method === 'PIX') return 'PIX';
  if (method === 'DINHEIRO') return 'Dinheiro';
  return orderType === 'PICKUP' ? 'Cartão na retirada' : 'Cartão na entrega';
}
