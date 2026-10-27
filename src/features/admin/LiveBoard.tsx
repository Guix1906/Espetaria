import { Bike, Flame, UtensilsCrossed } from 'lucide-react';
import type { ActiveTab } from '../../components/layout/navigation';
import { formatBRL, formatElapsedMinutes } from '../../lib/formatters';
import { LOW_STOCK_THRESHOLD } from '../../lib/productAvailability';
import { useStockStore } from '../../stores/useStockStore';
import { useTableStore } from '../../stores/useTableStore';
import type { DeliveryOrder, Tab } from '../../types/domain';
import { LEVEL_CARD, elapsedLevel, type ElapsedLevel } from '../kds/KDSElapsedTimer';
import { ALERT_LIMITS, stageOf, type DeliveryStage } from './dashboardMetrics';

const pad2 = (n: number) => String(n).padStart(2, '0');
const RANK: Record<ElapsedLevel, number> = { urgent: 0, warning: 1, ok: 2 };
const DELIVERY_STAGE: Record<DeliveryStage, string> = {
  AWAITING_PAYMENT: 'aguardando PIX',
  IN_PRODUCTION: 'na brasa',
  READY: 'pronto',
  OUT_FOR_DELIVERY: 'saiu para entrega',
};
/** Mesmos prazos da tela da churrasqueira (cozinha e bar trabalham pelo papel, sem status na tela). */
const SECTORS = [
  { key: 'GRILL', label: 'Churrasqueira', warn: 15, urgent: 25 },
] as const;

interface Row { key: string; level: ElapsedLevel; title: string; status: string; detail: string; onClick?: () => void }

interface LiveBoardProps {
  now: number;
  openTabs: Tab[];
  tabInfo: (tab: Tab) => { ready: number; preparing: number; itemCount: number };
  readyOldest: number;
  activeDeliveries: DeliveryOrder[];
  lateIds: Set<string>;
  go?: (tab: ActiveTab) => void;
  goTable?: (tableId: string, tab: ActiveTab) => void;
}

/** Visão geral em 3 colunas (salão, produção, delivery): o mais urgente sempre em cima. */
export function LiveBoard({ now, openTabs, tabInfo, readyOldest, activeDeliveries, lateIds, go, goTable }: LiveBoardProps) {
  const { tables, orders, orderItems } = useTableStore();
  const { products, dailyPrepStock } = useStockStore();

  const salonRows: Row[] = openTabs.map((tab) => {
    const table = tables.find((t) => t.id === tab.table_id);
    const info = tabInfo(tab);
    const bill = table?.status === 'AGUARDANDO_CONTA';
    const level: ElapsedLevel = bill || (info.ready > 0 && readyOldest >= ALERT_LIMITS.readyNotServed) ? 'urgent' : info.ready > 0 ? 'warning' : 'ok';
    const status = bill ? 'conta pedida' : info.ready > 0 ? `${info.ready} pronto${info.ready > 1 ? 's' : ''} para levar` : info.preparing > 0 ? `${info.preparing} na brasa` : info.itemCount ? 'consumindo' : 'sem pedido';
    const name = tab.customer_name && tab.customer_name !== `Mesa ${table?.number}` ? ` · ${tab.customer_name}` : '';
    return {
      key: tab.id, level, status,
      title: `Mesa ${table ? pad2(table.number) : '—'}${name}`,
      detail: `${formatBRL(tab.total || tab.subtotal)} · ${formatElapsedMinutes(tab.opened_at, now)}`,
      onClick: table && goTable ? () => goTable(table.id, bill ? 'cashier' : 'waiter') : undefined,
    };
  });

  // Produção: pedidos ativos por setor (salão + delivery/retirada), pelo mais antigo
  const prodRows: Row[] = SECTORS.flatMap((sector) => {
    const salonOrders = orders.filter((o) => orderItems.some((i) => i.order_id === o.id && i.sector === sector.key && (i.status === 'RECEIVED' || i.status === 'IN_PREPARATION')));
    const remote = activeDeliveries.filter((o) => (o.status === 'PREPARING' || o.status === 'CONFIRMED') && o.items.some((i) => i.sector === sector.key));
    const starts = [...salonOrders, ...remote].map((o) => o.created_at).sort();
    const oldest = starts[0];
    if (!oldest) return [];
    return [{
      key: sector.key, level: elapsedLevel(oldest, now, sector.warn, sector.urgent),
      title: sector.label, status: `${starts.length} ${starts.length === 1 ? 'pedido' : 'pedidos'}`,
      detail: `mais antigo ${formatElapsedMinutes(oldest, now)}${remote.length ? ` · ${remote.length} de delivery` : ''}`,
      onClick: go ? () => go('kds') : undefined,
    }];
  });
  const ending = dailyPrepStock
    .map((s) => ({ s, p: products.find((p) => p.id === s.product_id) }))
    .filter(({ s, p }) => p?.active && (s.is_exhausted || s.current_quantity <= (p.low_stock_threshold ?? LOW_STOCK_THRESHOLD)))
    .sort((a, b) => a.s.current_quantity - b.s.current_quantity);
  if (ending.length) {
    prodRows.push({
      key: 'ending', level: ending.some(({ s }) => s.is_exhausted || s.current_quantity <= 0) ? 'urgent' : 'warning',
      title: 'Acabando', status: `${ending.length} ${ending.length === 1 ? 'item' : 'itens'}`,
      detail: ending.slice(0, 4).map(({ s, p }) => `${p!.name} ${s.is_exhausted ? 'esgotado' : s.current_quantity}`).join(' · '),
      onClick: go ? () => go('stock') : undefined,
    });
  }

  const deliveryRows: Row[] = activeDeliveries.map((o) => {
    const stage = stageOf(o);
    const pickup = o.order_type === 'PICKUP';
    return {
      key: o.id,
      level: lateIds.has(o.id) ? 'urgent' : elapsedLevel(o.created_at, now, 30, 45),
      title: `#${o.order_number} ${o.customer_name.trim().split(' ')[0] || o.customer_name}`,
      status: stage ? (stage === 'READY' && pickup ? 'pronto, cliente vem buscar' : DELIVERY_STAGE[stage]) : '',
      detail: `${pickup ? 'retirada' : o.address_neighborhood || 'entrega'} · ${formatBRL(o.total)} · ${formatElapsedMinutes(o.created_at, now)}`,
      onClick: go ? () => go('delivery') : undefined,
    };
  });

  const columns = [
    { id: 'salon', title: 'Salão', icon: UtensilsCrossed, head: 'bg-emerald-50 text-emerald-900', count: `${openTabs.length} ${openTabs.length === 1 ? 'mesa' : 'mesas'}`, rows: salonRows, empty: 'Nenhuma mesa aberta.' },
    { id: 'prod', title: 'Produção', icon: Flame, head: 'bg-brand-100 text-brand-900', count: (() => { const n = prodRows.filter((r) => r.key !== 'ending').length; return n ? `${n} ${n === 1 ? 'setor' : 'setores'} trabalhando` : ''; })(), rows: prodRows, empty: 'Nada em preparo.' },
    { id: 'delivery', title: 'Delivery e retirada', icon: Bike, head: 'bg-sky-50 text-sky-900', count: `${activeDeliveries.length} ${activeDeliveries.length === 1 ? 'pedido' : 'pedidos'}`, rows: deliveryRows, empty: 'Nenhum pedido em andamento.' },
  ];

  return (
    <section className="grid grid-cols-1 gap-3 lg:grid-cols-3" aria-label="Movimento agora">
      {columns.map((col) => (
        <div key={col.id} className="overflow-hidden rounded-lg border border-line bg-surface">
          <h2 className={`flex items-center justify-between gap-2 px-4 py-3 text-base font-semibold ${col.head}`}>
            <span className="flex items-center gap-2"><col.icon className="h-5 w-5" aria-hidden="true" />{col.title}</span>
            <span className="text-sm font-medium">{col.count}</span>
          </h2>
          {col.rows.length === 0 ? <p className="px-4 py-8 text-center text-sm text-ink-muted">{col.empty}</p> : (
            <ul className="max-h-[32rem] space-y-2 overflow-y-auto p-2.5">
              {[...col.rows].sort((a, b) => RANK[a.level] - RANK[b.level]).map((row) => (
                <li key={row.key}>
                  <button type="button" onClick={row.onClick} disabled={!row.onClick} className={`block w-full border border-line border-l-[6px] bg-surface-soft px-3 py-2 text-left transition hover:bg-surface-muted ${LEVEL_CARD[row.level]}`}>
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-base font-bold text-ink">{row.title}</span>
                      <span className={`shrink-0 text-sm font-semibold ${row.level === 'urgent' ? 'text-rose-700' : row.level === 'warning' ? 'text-amber-800' : 'text-ink-secondary'}`}>{row.status}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-ink-muted">{row.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}
