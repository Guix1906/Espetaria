import type { Order, OrderItem } from '../../types/domain';

/** Itens por comanda. A mesa busca pela comanda aberta dela, seja qual for o formato do id da mesa. */
export function groupItemsByTab(orders: Pick<Order, 'id' | 'tab_id'>[], items: OrderItem[]): Map<string, OrderItem[]> {
  const tabOfOrder = new Map(orders.map((order) => [order.id, order.tab_id]));
  const byTab = new Map<string, OrderItem[]>();
  for (const item of items) {
    const tabId = tabOfOrder.get(item.order_id);
    if (!tabId) continue;
    const list = byTab.get(tabId);
    if (list) list.push(item);
    else byTab.set(tabId, [item]);
  }
  return byTab;
}
