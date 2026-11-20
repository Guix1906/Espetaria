import { Ban, Flame, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { useAuthStore } from '../../stores/useAuthStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useStockStore } from '../../stores/useStockStore';
import { LOW_STOCK_THRESHOLD as LOW_STOCK } from '../../lib/productAvailability';

/** "X com acompanhamento" usa o saldo do espeto X + arroz: não precisa de quadrado próprio. */
const isCombo = (name: string) => /com acompanhamento/i.test(name);

/** Saldo do turno por produto (espetos primeiro), em grade, para o gerente ver o que está acabando. */
export function StockSnapshot({ onOpenStock }: { onOpenStock?: () => void }) {
  const { products, dailyPrepStock, toggleExhaustProduct } = useStockStore();
  const { currentShift } = useShiftStore();
  const { currentProfile } = useAuthStore();
  const { notify } = useFeedback();
  const [view, setView] = useState<'available' | 'blocked'>('available');

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
    .filter((row): row is { stock: typeof row.stock; product: NonNullable<typeof row.product> } => !!row.product && row.product.active && !isCombo(row.product.name))
    .sort((a, b) => (a.product.sector === 'GRILL' ? 0 : 1) - (b.product.sector === 'GRILL' ? 0 : 1) || a.stock.current_quantity - b.stock.current_quantity);

  if (rows.length === 0) return null;
  const blocked = rows.filter((r) => r.stock.is_exhausted);
  const available = rows.filter((r) => !r.stock.is_exhausted);
  const shown = view === 'blocked' ? blocked : available;

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm" aria-labelledby="stock-snapshot-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="stock-snapshot-title" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Flame className="h-4 w-4 text-brand-600" aria-hidden="true" />
          Espetos do turno
        </h2>
        {onOpenStock && (
          <button type="button" onClick={onOpenStock} className="text-xs font-medium text-brand-700 hover:underline">
            Abrir estoque
          </button>
        )}
      </div>

      <div className="mt-3 flex gap-1.5" role="group" aria-label="Filtrar espetos">
        <button
          type="button"
          aria-pressed={view === 'available'}
          onClick={() => setView('available')}
          className={`min-h-[34px] rounded-sm px-3 text-xs font-semibold ${view === 'available' ? 'bg-ink text-white' : 'bg-surface-muted text-ink-secondary hover:text-ink'}`}
        >
          Com saldo {available.length}
        </button>
        <button
          type="button"
          aria-pressed={view === 'blocked'}
          onClick={() => setView('blocked')}
          className={`min-h-[34px] rounded-sm px-3 text-xs font-semibold ${view === 'blocked' ? 'bg-ink text-white' : blocked.length > 0 ? 'bg-rose-50 text-rose-800' : 'bg-surface-muted text-ink-secondary'}`}
        >
          Bloqueados {blocked.length}
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="mt-3 text-xs text-ink-muted">{view === 'blocked' ? 'Nenhum espeto bloqueado.' : 'Nenhum item com saldo.'}</p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-1.5">
          {shown.map(({ stock, product }) => {
            const out = stock.current_quantity <= 0;
            const isLow = !out && stock.current_quantity <= LOW_STOCK;
            return (
              <li
                key={stock.id}
                className={`flex flex-col gap-1 rounded-md px-2.5 py-2 ${stock.is_exhausted || out ? 'bg-rose-50' : isLow ? 'bg-amber-50' : 'bg-surface-muted'}`}
              >
                <span className="truncate text-[13px] text-ink" title={product.name}>{product.name}</span>
                <div className="flex items-center justify-between gap-1">
                  <span className={`font-mono text-lg font-semibold leading-none ${out || stock.is_exhausted ? 'text-rose-700' : isLow ? 'text-amber-800' : 'text-ink'}`}>
                    {stock.is_exhausted ? 'Bloq.' : out ? 'Esgotou' : stock.current_quantity}
                  </span>
                  {stock.is_exhausted ? (
                    <button
                      type="button"
                      className="flex min-h-[30px] items-center gap-1 rounded-sm bg-surface px-2 text-xs font-medium text-ink hover:bg-surface-muted"
                      onClick={() => toggleBlock(product.id, product.name, false)}
                      aria-label={`Liberar ${product.name}`}
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      Liberar
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="flex min-h-[30px] items-center rounded-sm px-1.5 text-ink-muted hover:bg-rose-100 hover:text-rose-700"
                      onClick={() => toggleBlock(product.id, product.name, true)}
                      aria-label={`Bloquear ${product.name}`}
                      title="Bloquear"
                    >
                      <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-xs text-ink-muted">Espeto com acompanhamento usa o saldo do espeto + arroz.</p>
    </section>
  );
}
