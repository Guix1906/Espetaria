import { STAGE_LABELS, STATUS_STYLES, type StatusKind } from './statusStyles';
import type { DeliveryOrder, DeliveryOrderType, DeliveryPaymentMethod, DeliveryStatus } from '../types/domain';

type StatusConfig = { label: string; description: string; kind: StatusKind; classes: string };

const statuses: Record<DeliveryStatus, StatusConfig> = {
  AWAITING_PAYMENT: { label: 'Aguardando PIX', description: 'Pague o PIX abaixo. Assim que o pagamento for confirmado, seu pedido vai para a brasa.', kind: 'preparing', classes: STATUS_STYLES.preparing },
  PENDING: { label: STAGE_LABELS.received, description: 'O pedido está aguardando confirmação da espetaria.', kind: 'bill', classes: STATUS_STYLES.bill },
  CONFIRMED: { label: STAGE_LABELS.received, description: 'Recebemos seu pedido. Ele entrará na fila de preparo.', kind: 'occupied', classes: STATUS_STYLES.occupied },
  PREPARING: { label: STAGE_LABELS.onGrill, description: 'Seu pedido já está sendo preparado.', kind: 'preparing', classes: STATUS_STYLES.preparing },
  READY: { label: STAGE_LABELS.ready, description: 'Seu pedido está pronto e sai para entrega em instantes.', kind: 'ready', classes: STATUS_STYLES.ready },
  OUT_FOR_DELIVERY: { label: STAGE_LABELS.out, description: 'Seu pedido saiu para entrega.', kind: 'occupied', classes: STATUS_STYLES.occupied },
  DELIVERED: { label: STAGE_LABELS.delivered, description: 'Entrega concluída. Bom apetite!', kind: 'occupied', classes: STATUS_STYLES.occupied },
  CANCELLED: { label: 'Cancelado', description: 'Este pedido foi cancelado. Entre em contato se precisar de ajuda.', kind: 'alert', classes: STATUS_STYLES.alert },
};

// Retirada no local: muda só o texto das etapas finais
const pickupStatuses: Partial<Record<DeliveryStatus, Partial<StatusConfig>>> = {
  READY: { label: STAGE_LABELS.ready, description: 'Seu pedido está pronto. Pode vir buscar!' },
  DELIVERED: { label: STAGE_LABELS.pickedUp, description: 'Pedido retirado. Bom apetite!' },
};

export function getDeliveryStatusConfig(status: DeliveryStatus, orderType: DeliveryOrderType = 'DELIVERY'): StatusConfig {
  return orderType === 'PICKUP' ? { ...statuses[status], ...pickupStatuses[status] } : statuses[status];
}

/**
 * Consumir no local: no banco é um pedido PICKUP (sem endereço nem taxa) marcado na observação,
 * que já chega aos cupons e não exige mudança nas funções do banco.
 */
export const DINE_IN_NOTE = 'CONSUMIR NO LOCAL';
export function isDineInOrder(order: { notes?: string | null }): boolean {
  return /^CONSUMIR NO LOCAL/i.test(order.notes?.trim() ?? '');
}
/** Nome do tipo de pedido sem entrega: "Consumir no local" ou "Retirada". */
export function localOrderLabel(order: { notes?: string | null }): string {
  return isDineInOrder(order) ? 'Consumir no local' : 'Retirada';
}

export type OrderKind = 'DELIVERY' | 'DINE_IN' | 'PICKUP';
/** Os 3 tipos de pedido do cardápio. */
export function orderKind(order: Pick<DeliveryOrder, 'order_type' | 'notes'>): OrderKind {
  if (order.order_type !== 'PICKUP') return 'DELIVERY';
  return isDineInOrder(order) ? 'DINE_IN' : 'PICKUP';
}

export function isPickupOrder(order: Pick<DeliveryOrder, 'order_type'>): boolean {
  return order.order_type === 'PICKUP';
}

export function deliveryPaymentLabel(method: DeliveryPaymentMethod, orderType: DeliveryOrderType = 'DELIVERY'): string {
  if (method === 'PIX') return 'PIX';
  if (method === 'DINHEIRO') return 'Dinheiro';
  return orderType === 'PICKUP' ? 'Cartão na retirada' : 'Cartão na entrega';
}
