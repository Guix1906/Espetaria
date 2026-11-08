import { Ban, ChevronDown, ChevronUp, Flame, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { useAuthStore } from '../../stores/useAuthStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useStockStore } from '../../stores/useStockStore';
import { LOW_STOCK_THRESHOLD as LOW_STOCK } from '../../lib/productAvailability';

/** Saldo do turno por produto (espetos primeiro), para o gerente acompanhar o que está acabando. */
export function StockSnapshot({ onOpenStock }: { onOpenStock?: () => void }) {
  const { products, dailyPrepStock, toggleExhaustProduct } = useStockStore();
  const { currentShift } = useShiftStore();
  const { currentProfile } = useAuthStore();
  const { notify } = useFeedback();
  const [isExpanded, setIsExpanded] = useState(true);

  // Trava manual: some do pedido do garçom na hora (útil se a quantidade foi lançada errada)
  const toggleBlock = (productId: string, name: string, block: boolean) => {
    if (!currentShift) return;
    try {
      toggleExhaustProduct(currentShift.id, productId, block, currentProfile.id, block ? 'Bloqueado pela gerência' : 'Liberado pela gerência');
      notify(block ? `${name} bloqueado: os garçons não conseguem mais pedir.` : `${name} liberado para pedidos.`, 'success');
    } catch (error: unknown) {
      notify(error instanceof Error ? error.message : 'Não foi possível alterar o bloqueio.', 'error');
    }
  };

  const rows = dailyPrepStock
    .map((stock) => ({ stock, product: products.find((p) => p.id === stock.product_id) }))
    .filter((row): row is { stock: typeof row.stock; product: NonNullable<typeof row.product> } => !!row.product && row.product.active)
    .sort((a, b) => (a.product.sector === 'GRILL' ? 0 : 1) - (b.product.sector === 'GRILL' ? 0 : 1) || a.stock.current_quantity - b.stock.current_quantity);

  if (rows.length === 0) return null;
  const low = rows.filter((r) => r.stock.is_exhausted || r.stock.current_quantity <= LOW_STOCK).length;

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm" aria-labelledby="stock-snapshot-title">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
        aria-expanded={isExpanded}
      >
        <h2 id="stock-snapshot-title" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Flame className="h-4 w-4 text-brand-600" aria-hidden="true" />
          Espetos disponíveis
          <span className="text-xs font-normal text-ink-muted">({rows.length})</span>
        </h2>
        <div className="flex items-center gap-2 text-xs">
          {low > 0 && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/20">
              {low} {low === 1 ? 'acabando' : 'críticos'}
            </span>
          )}
          {onOpenStock && (
            <span
              className="font-medium text-brand-700 hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                onOpenStock();
              }}
            >
              Ver estoque
            </span>
          )}
          {isExpanded ? <ChevronUp className="h-4 w-4 text-ink-muted" aria-hidden="true" /> : <ChevronDown className="h-4 w-4 text-ink-muted" aria-hidden="true" />}
        </div>
      </button>

      {isExpanded && (
        <ul className="mt-3 divide-y divide-line/60 max-h-[19rem] overflow-y-auto pr-1">
          {rows.map(({ stock, product }) => {
            const out = stock.is_exhausted || stock.current_quantity <= 0;
            const isLow = !out && stock.current_quantity <= LOW_STOCK;
            const pct = stock.initial_quantity > 0 ? Math.min(100, (stock.current_quantity / stock.initial_quantity) * 100) : 0;
            return (
              <li key={stock.id} className="flex items-center gap-2.5 py-2 text-xs first:pt-1 last:pb-0">
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{product.name}</span>
                <span className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                  <span
                    className={`block h-full rounded-full ${out ? 'bg-rose-600' : isLow ? 'bg-amber-500' : 'bg-emerald-600'}`}
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className={`w-14 shrink-0 text-right ${out ? 'font-bold text-rose-700' : isLow ? 'font-bold text-amber-700' : 'text-ink'}`}>
                  {stock.is_exhausted ? 'Bloqueado' : out ? 'Esgotado' : <><span className="tabular-nums">{stock.current_quantity}</span><span className="text-ink-muted tabular-nums font-normal">/{stock.initial_quantity}</span></>}
                </span>
                {stock.is_exhausted ? (
                  <button
                    type="button"
                    className="btn-secondary h-7 min-h-0 shrink-0 px-2 text-[11px]"
                    onClick={() => toggleBlock(product.id, product.name, false)}
                    aria-label={`Liberar ${product.name}`}
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    Liberar
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary h-7 min-h-0 shrink-0 px-2 text-[11px] text-rose-700 hover:bg-rose-50"
                    onClick={() => toggleBlock(product.id, product.name, true)}
                    aria-label={`Bloquear ${product.name}`}
                  >
                    <Ban className="h-3 w-3" aria-hidden="true" />
                    Bloquear
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
