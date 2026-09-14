import type { DeliveryStatus } from '../types/domain';

const statuses: Record<DeliveryStatus, { label: string; description: string; classes: string }> = {
  PENDING: { label: 'Aguardando confirmação', description: 'O pedido está aguardando confirmação da espetaria.', classes: 'border-amber-200 bg-amber-50 text-amber-800' },
  CONFIRMED: { label: 'Confirmado', description: 'Recebemos seu pedido. Ele entrará na fila de preparo.', classes: 'border-sky-200 bg-sky-50 text-sky-800' },
  PREPARING: { label: 'Em preparo', description: 'Nossa equipe está preparando seu pedido.', classes: 'border-amber-200 bg-amber-50 text-amber-800' },
  OUT_FOR_DELIVERY: { label: 'A caminho', description: 'Seu pedido saiu para entrega.', classes: 'border-sky-200 bg-sky-50 text-sky-800' },
  DELIVERED: { label: 'Entregue', description: 'Entrega concluída. Bom apetite!', classes: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  CANCELLED: { label: 'Cancelado', description: 'Este pedido foi cancelado. Entre em contato se precisar de ajuda.', classes: 'border-rose-200 bg-rose-50 text-rose-800' },
};

export function getDeliveryStatusConfig(status: DeliveryStatus) {
  return statuses[status];
}
