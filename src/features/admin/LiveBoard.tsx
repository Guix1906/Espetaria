import { focusOrderKind, hasGrillItems, isDineInOrder } from '../../lib/deliveryStatus';
import { Search } from 'lucide-react';
import { useState } from 'react';
import type { ActiveTab } from '../../components/layout/navigation';
import { formatElapsedMinutes } from '../../lib/formatters';
import { isPendingProduction } from '../../lib/productionStatus';
import { useTableStore } from '../../stores/useTableStore';
import type { DeliveryOrder, OrderItem, RestaurantTable, Tab } from '../../types/domain';
import { LEVEL_CARD, elapsedLevel, type ElapsedLevel } from '../kds/KDSElapsedTimer';
import { stageOf, type DeliveryStage } from './dashboardMetrics';

const pad2 = (n: number) => String(n).padStart(2, '0');
const RANK: Record<ElapsedLevel, number> = { urgent: 0, warning: 1, ok: 2 };
const DELIVERY_STAGE: Record<DeliveryStage, string> = {
  AWAITING_PAYMENT: 'aguardando PIX',
  IN_PRODUCTION: 'em preparo',
  READY: 'pronto',
  OUT_FOR_DELIVERY: 'saiu para entrega',
};

export type BoardColumn = 'preparing' | 'grill' | 'delivery';
export type BoardChannel = 'Salão' | 'Delivery' | 'Consumir no local' | 'Retirada';
const FILTERS = ['Todos', 'Salão', 'Delivery', 'Consumir no local', 'Retirada'] as const;
const COLUMNS: { id: BoardColumn; title: string; dot: string; empty: string }[] = [
  { id: 'preparing', title: 'Em preparo', dot: 'bg-amber-500', empty: 'Nada em preparo' },
  { id: 'grill', title: 'Na brasa', dot: 'bg-brand-700', empty: 'Nada na brasa' },
  { id: 'delivery', title: 'Delivery', dot: 'bg-emerald-600', empty: 'Nenhum pedido em andamento' },
];

/** Espeto pendente vai para Na brasa; a mesa sem espeto fica em Em preparo, para nenhuma mesa aberta sumir do quadro. */
export function tabColumn(items: Pick<OrderItem, 'sector' | 'status'>[]): BoardColumn {
  return items.some((i) => i.sector === 'GRILL' && isPendingProduction(i)) ? 'grill' : 'preparing';
}

/** Consumir no local segue as colunas do salão; entrega e retirada ficam em Delivery. */
export function deliveryColumn(o: Pick<DeliveryOrder, 'order_type' | 'notes' | 'status' | 'items'>): BoardColumn {
  if (o.order_type !== 'PICKUP' || !isDineInOrder(o)) return 'delivery';
  return o.status !== 'READY' && hasGrillItems(o) ? 'grill' : 'preparing';
}

interface Card { key: string; column: BoardColumn; channel: BoardChannel; level: ElapsedLevel; title: string; time: string; items: string; status: string; onClick?: () => void }

interface LiveBoardProps {
  now: number;
  openTabs: Tab[];
  tabInfo: (tab: Tab) => { ready: number; preparing: number; itemCount: number };
  activeDeliveries: DeliveryOrder[];
  lateIds: Set<string>;
  go?: (tab: ActiveTab) => void;
  goTable?: (tableId: string, tab: ActiveTab) => void;
}

/** Quadro da operação em 3 colunas: o mais urgente sempre em cima. Sem valores em dinheiro. */
export function LiveBoard({ now, openTabs, tabInfo, activeDeliveries, lateIds, go, goTable }: LiveBoardProps) {
  const { tables, orders, orderItems } = useTableStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('Todos');

  const tabCard = (tab: Tab, table: RestaurantTable | undefined): Card => {
    const orderIds = new Set(orders.filter((o) => o.tab_id === tab.id).map((o) => o.id));
    const items = orderItems.filter((i) => orderIds.has(i.order_id) && i.status !== 'CANCELLED');
    const info = tabInfo(tab);
    const bill = table?.status === 'AGUARDANDO_CONTA';
    const name = tab.customer_name && tab.customer_name !== `Mesa ${table?.number}` ? ` · ${tab.customer_name}` : '';
    return {
      key: tab.id,
      column: tabColumn(items),
      channel: 'Salão',
      level: bill ? 'urgent' : info.ready > 0 ? 'warning' : 'ok',
      title: `Mesa ${table ? pad2(table.number) : '—'}${name}`,
      time: formatElapsedMinutes(tab.opened_at, now),
      items: (items.some(isPendingProduction) ? items.filter(isPendingProduction) : items).map((i) => `${i.quantity}× ${i.product_name}`).join(', ') || 'Sem pedido',
      status: bill ? 'Conta pedida' : info.ready > 0 ? `${info.ready} pronto${info.ready > 1 ? 's' : ''} para levar` : info.preparing > 0 ? `${info.preparing} ${tabColumn(items) === 'grill' ? 'na brasa' : 'em preparo'}` : info.itemCount ? 'Consumindo' : 'Sem pedido',
      onClick: table && goTable ? () => goTable(table.id, bill ? 'cashier' : 'waiter') : undefined,
    };
  };

  const deliveryCard = (o: DeliveryOrder): Card => {
    const stage = stageOf(o);
    const pickup = o.order_type === 'PICKUP';
    const dineIn = isDineInOrder(o);
    return {
      key: o.id,
      column: deliveryColumn(o),
      channel: pickup ? (dineIn ? 'Consumir no local' : 'Retirada') : 'Delivery',
      level: lateIds.has(o.id) ? 'urgent' : elapsedLevel(o.created_at, now, 30, 45),
      title: `${o.customer_name.trim().split(' ')[0] || o.customer_name} · #${o.order_number}`,
      time: formatElapsedMinutes(o.created_at, now),
      items: o.items.map((i) => `${i.quantity}× ${i.product_name}`).join(', '),
      status: stage ? (stage === 'READY' && pickup ? (dineIn ? 'Pronto no balcão' : 'Pronto, cliente vem buscar') : DELIVERY_STAGE[stage].charAt(0).toUpperCase() + DELIVERY_STAGE[stage].slice(1)) : '',
      onClick: go ? () => { if (pickup && dineIn) focusOrderKind('DINE_IN'); go('delivery'); } : undefined,
    };
  };

  const term = search.trim().toLowerCase();
  const cards = [...openTabs.map((t) => tabCard(t, tables.find((x) => x.id === t.table_id))), ...activeDeliveries.map(deliveryCard)]
    .filter((c) => filter === 'Todos' || c.channel === filter)
    .filter((c) => !term || `${c.title} ${c.items}`.toLowerCase().includes(term))
    .sort((a, b) => RANK[a.level] - RANK[b.level]);

  return (
    <section className="space-y-3" aria-label="Movimento agora">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex max-w-full gap-0.5 overflow-x-auto rounded-md bg-surface-muted p-1" role="group" aria-label="Filtrar por canal">
          {FILTERS.map((f) => <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`min-h-[44px] shrink-0 whitespace-nowrap rounded-sm px-3 text-sm font-medium ${filter === f ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted'}`}>{f}</button>)}
        </div>
        <label className="relative min-w-[12rem] flex-1">
          <span className="sr-only">Buscar mesa, cliente ou pedido</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar mesa, cliente ou pedido" className="min-h-[44px] w-full rounded-md border pl-9 pr-3 text-[15px]" />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const rows = cards.filter((c) => c.column === col.id);
          return (
            <div key={col.id} className="flex min-h-[20rem] flex-col overflow-hidden rounded-lg border border-line bg-surface">
              <h2 className="flex items-center gap-2.5 border-b border-line px-4 py-3 text-base font-semibold text-ink">
                <span className={`h-2.5 w-2.5 rounded-sm ${col.dot}`} aria-hidden="true" />
                <span className="flex-1">{col.title}</span>
                <span className="rounded-sm bg-surface-muted px-2 py-0.5 font-mono text-[13px] font-medium">{rows.length}</span>
              </h2>
              {rows.length === 0 ? <p className="m-auto p-6 text-sm text-ink-muted">{term ? 'Nada encontrado' : col.empty}</p> : (
                <ul className="max-h-[32rem] flex-1 space-y-2.5 overflow-y-auto bg-surface-soft p-3">
                  {rows.map((c) => (
                    <li key={c.key}>
                      <button type="button" onClick={c.onClick} disabled={!c.onClick} className={`block w-full space-y-1.5 rounded-md border border-line border-l-4 bg-surface px-3 py-2.5 text-left transition hover:bg-surface-muted ${LEVEL_CARD[c.level]}`}>
                        <span className="flex items-baseline justify-between gap-2"><span className="truncate font-semibold text-ink">{c.title}</span><span className="shrink-0 font-mono text-xs text-ink-muted">{c.time}</span></span>
                        <span className="line-clamp-2 block text-sm text-ink-secondary">{c.items}</span>
                        <span className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="rounded-sm bg-surface-muted px-2 py-0.5 text-ink-secondary">{c.channel}</span>
                          <span className={`font-semibold ${c.level === 'urgent' ? 'text-rose-700' : c.level === 'warning' ? 'text-amber-800' : 'text-ink-muted'}`}>{c.status}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
