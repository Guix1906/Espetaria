import type { OrderItem } from '../types/domain';

/** Depois desse tempo o aviso de "pronto para levar" some sozinho (o garçom não precisa tocar em "Servir"). */
export const READY_ALERT_MINUTES = 10;

/**
 * Só a churrasqueira acompanha o pedido na tela ("Espeto pronto").
 * Cozinha e bar trabalham pelo cupom impresso: seus itens não contam como pendentes.
 */
export function isPendingProduction(item: Pick<OrderItem, 'sector' | 'status'>) {
  return item.sector === 'GRILL' && (item.status === 'RECEIVED' || item.status === 'IN_PREPARATION');
}

/** Item pronto que ainda deve aparecer como "levar à mesa". */
export function isFreshReady(item: Pick<OrderItem, 'status' | 'prepared_at' | 'updated_at'>, now = Date.now()) {
  if (item.status !== 'READY') return false;
  const at = item.prepared_at ?? item.updated_at;
  return !at || now - new Date(at).getTime() < READY_ALERT_MINUTES * 60000;
}
