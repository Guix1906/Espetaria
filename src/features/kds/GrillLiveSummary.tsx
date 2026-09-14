import { useId, useState } from 'react';
import { ChevronDown, ChevronUp, Flame } from 'lucide-react';
import type { OrderItem } from '../../types/domain';
import type { MeatDoneness } from '../../types/enums';
import { formatDoneness } from '../../lib/formatters';

interface AggregatedSkewer {
  productId: string;
  productName: string;
  onGrillCount: number;
  waitingCount: number;
  totalCount: number;
  donenessBreakdown: Record<MeatDoneness, number>;
}

export function GrillLiveSummary({ orderItems }: { orderItems: OrderItem[] }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const contentId = useId();
  const activeItems = orderItems.filter((item) => item.sector === 'GRILL' && (item.status === 'IN_PREPARATION' || item.status === 'RECEIVED'));
  const totalOnGrill = activeItems.filter((item) => item.status === 'IN_PREPARATION').reduce((sum, item) => sum + item.quantity, 0);
  const totalWaiting = activeItems.filter((item) => item.status === 'RECEIVED').reduce((sum, item) => sum + item.quantity, 0);
  const aggregated = new Map<string, AggregatedSkewer>();

  activeItems.forEach((item) => {
    let entry = aggregated.get(item.product_id);
    if (!entry) {
      entry = { productId: item.product_id, productName: item.product_name, onGrillCount: 0, waitingCount: 0, totalCount: 0, donenessBreakdown: { MAL_PASSADA: 0, AO_PONTO_PARA_MAL: 0, AO_PONTO: 0, AO_PONTO_PARA_BEM: 0, BEM_PASSADA: 0 } };
      aggregated.set(item.product_id, entry);
    }
    if (item.status === 'IN_PREPARATION') entry.onGrillCount += item.quantity;
    else entry.waitingCount += item.quantity;
    entry.totalCount += item.quantity;
    if (item.doneness) entry.donenessBreakdown[item.doneness] += item.quantity;
  });
  const skewers = [...aggregated.values()].sort((first, second) => second.totalCount - first.totalCount);

  if (!activeItems.length) return <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 text-sm text-ink-muted"><Flame className="h-5 w-5 text-accent-700" aria-hidden="true" />Nenhum espeto na brasa ou na fila neste momento.</div>;

  return (
    <section className="surface-card overflow-hidden">
      <button type="button" aria-expanded={isExpanded} aria-controls={contentId} onClick={() => setIsExpanded(!isExpanded)} className="flex w-full flex-wrap items-center justify-between gap-3 bg-surface-soft px-5 py-4 text-left">
        <span className="flex items-center gap-3"><span className="icon-tile bg-accent-50 text-accent-700"><Flame className="h-5 w-5" aria-hidden="true" /></span><span><span className="block text-base font-semibold text-ink">Resumo da grelha</span><span className="block text-xs text-ink-muted">{skewers.length} tipos de espeto em produção</span></span></span>
        <span className="flex flex-wrap items-center gap-2"><span className="status-badge border-brand-200 bg-brand-50 text-brand-800">{totalOnGrill} na brasa</span><span className="status-badge border-amber-200 bg-amber-50 text-amber-800">{totalWaiting} na fila</span>{isExpanded ? <ChevronUp className="h-4 w-4 text-ink-muted" /> : <ChevronDown className="h-4 w-4 text-ink-muted" />}</span>
      </button>
      {isExpanded && <div id={contentId} className="grid grid-cols-1 gap-3 border-t border-line p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{skewers.map((skewer) => <div key={skewer.productId} className="rounded-xl border border-line bg-surface p-4"><div className="flex items-start justify-between gap-2"><h2 className="text-sm font-semibold text-ink">{skewer.productName}</h2><span className="text-lg font-bold text-brand-800 tabular-nums">{skewer.totalCount}x</span></div><p className="mt-2 text-xs text-ink-muted">{skewer.onGrillCount} assando · {skewer.waitingCount} aguardando</p><div className="mt-3 flex flex-wrap gap-1.5">{(Object.entries(skewer.donenessBreakdown) as [MeatDoneness, number][]).filter(([, count]) => count > 0).map(([doneness, count]) => <span key={doneness} className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">{count}x {formatDoneness(doneness)}</span>)}</div></div>)}</div>}
    </section>
  );
}
