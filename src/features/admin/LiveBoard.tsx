import { focusOrderKind, hasGrillItems, isDineInOrder } from '../../lib/deliveryStatus';
import { Search } from 'lucide-react';
import { useState } from 'react';
import type { ActiveTab } from '../../components/layout/navigation';
import { formatElapsedMinutes } from '../../lib/formatters';
import { isPendingProduction } from '../../lib/productionStatus';
import { useTableStore } from '../../stores/useTableStore';
import type { DeliveryOrder, OrderItem, RestaurantTable, Tab } from '../../types/domain';
import { elapsedLevel, type ElapsedLevel } from '../kds/KDSElapsedTimer';
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
  { id: 'grill', title: 'Na brasa', dot: 'bg-brand-600', empty: 'Nada na brasa' },
  { id: 'delivery', title: 'Delivery', dot: 'bg-sky-600', empty: 'Nenhum pedido em andamento' },
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

interface Card {
  key: string;
  column: BoardColumn;
  channel: BoardChannel;
  level: ElapsedLevel;
  title: string;
  time: string;
  items: string;
  status: string;
  onClick?: () => void;
}

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
      {/* FILTROS E BUSCA INTEGRADOS E COMPACTOS */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-surface-muted p-1" role="group" aria-label="Filtrar por canal">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`min-h-[34px] shrink-0 whitespace-nowrap rounded-md px-3 text-xs font-semibold transition ${
                filter === f ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <label className="relative min-w-[14rem] flex-1 sm:max-w-xs">
          <span className="sr-only">Buscar mesa, cliente ou pedido</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar mesa ou cliente..."
            className="min-h-[36px] w-full rounded-lg border border-line bg-surface pl-8 pr-3 text-xs shadow-inner focus:border-brand-500 focus:outline-none"
          />
        </label>
      </div>

      {/* 3 COLUNAS KANBAN */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const rows = cards.filter((c) => c.column === col.id);
          return (
            <div key={col.id} className="flex min-h-[22rem] flex-col overflow-hidden rounded-xl border border-line bg-surface-soft/40 shadow-sm">
              <h3 className="flex items-center gap-2 border-b border-line bg-surface px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider text-ink">
                <span className={`h-2 w-2 rounded-full ${col.dot}`} aria-hidden="true" />
                <span className="flex-1">{col.title}</span>
                <span className="rounded-full bg-surface-muted px-2 py-0.5 font-mono text-[11px] font-bold text-ink-muted">
                  {rows.length}
                </span>
              </h3>
              {rows.length === 0 ? (
                <div className="m-auto p-6 text-center text-xs text-ink-muted">
                  {term ? 'Nenhum resultado' : col.empty}
                </div>
              ) : (
                <ul className="max-h-[32rem] flex-1 space-y-2 overflow-y-auto p-2.5">
                  {rows.map((c) => (
                    <li key={c.key}>
                      <button
                        type="button"
                        onClick={c.onClick}
                        disabled={!c.onClick}
                        className={`group block w-full space-y-1 rounded-xl border bg-surface p-3 text-left transition-all duration-150 hover:shadow-sm hover:border-ink/30 ${
                          c.level === 'urgent'
                            ? 'border-l-[4px] border-l-rose-600 border-rose-200 bg-rose-50/20'
                            : c.level === 'warning'
                            ? 'border-l-[4px] border-l-amber-500 border-amber-200 bg-amber-50/20'
                            : 'border-line hover:border-brand-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-bold text-ink">{c.title}</span>
                          <span className="shrink-0 font-mono text-[11px] text-ink-muted">{c.time}</span>
                        </div>
                        <p className="line-clamp-2 text-xs text-ink-secondary leading-snug">{c.items}</p>
                        <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5 text-[11px]">
                          <span className="rounded bg-surface-muted px-1.5 py-0.5 text-ink-muted font-medium">
                            {c.channel}
                          </span>
                          <span
                            className={`font-semibold ${
                              c.level === 'urgent'
                                ? 'text-rose-700'
                                : c.level === 'warning'
                                ? 'text-amber-800'
                                : 'text-ink-muted'
                            }`}
                          >
                            {c.status}
                          </span>
                        </div>
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
