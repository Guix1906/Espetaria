import { VoidTabButton } from '../tables/VoidTabButton';
import { ArrowLeftRight, ChevronDown, Trash2 } from 'lucide-react';
import { isFreshReady, isPendingProduction } from '../../lib/productionStatus';
import { useState } from 'react';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { formatBRL, formatDoneness, getOrderItemStatusConfig } from '../../lib/formatters';
import { useAuthStore } from '../../stores/useAuthStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useStockStore } from '../../stores/useStockStore';
import { useTableStore } from '../../stores/useTableStore';
import type { OrderItem, RestaurantTable } from '../../types/domain';
import { askReturnToStock } from '../../lib/askReturnToStock';

interface TabItemsPanelProps {
  table: RestaurantTable;
  /** Chamado depois de cancelar um item para troca: a tela abre o cardápio para escolher o substituto. */
  onSwap?: (item: OrderItem) => void;
  compact?: boolean;
}

/** Itens já lançados na comanda da mesa, com servir, cancelar e trocar. */
export function TabItemsPanel({ table, onSwap, compact = false }: TabItemsPanelProps) {
  const { tabs, getTabOrderItems, cancelOrderItemAtomic } = useTableStore();
  const { currentProfile } = useAuthStore();
  const { currentShift } = useShiftStore();
  const { notify, requestText, requestChoice } = useFeedback();
  const products = useStockStore((s) => s.products);
  const tab = tabs.find((t) => t.table_id === table.id && t.status === 'OPEN');
  const items = tab ? getTabOrderItems(tab.id) : [];
  const isManager = ['MASTER', 'GERENTE'].includes(currentProfile.role);
  const active = items.filter((item) => item.status !== 'CANCELLED');
  const cancelled = items.filter((item) => item.status === 'CANCELLED');
  const [expanded, setExpanded] = useState(false);
  const preparingCount = active.filter(isPendingProduction).reduce((s, i) => s + i.quantity, 0);
  const readyCount = active.filter((i) => isFreshReady(i)).reduce((s, i) => s + i.quantity, 0);
  const totalCount = active.reduce((s, i) => s + i.quantity, 0);

  const cancel = async (item: OrderItem, swap: boolean) => {
    if (!isManager) {
      notify('Garçom não tem permissão para cancelar ou alterar pedidos já lançados. Solicite ao gerente ou caixa.', 'error');
      return;
    }
    if (!currentShift) { notify('Turno fechado: não é possível alterar a comanda.', 'error'); return; }
    const reason = swap
      ? `Troca de item (${item.product_name})`
      : await requestText({
          title: `Cancelar ${item.quantity}x ${item.product_name}`,
          label: 'Motivo do cancelamento',
          message: item.status === 'RECEIVED' ? 'O item ainda não entrou em preparo.' : 'Este item já está em produção: a churrasqueira/cozinha recebe um cupom de cancelamento.',
          initialValue: 'Cliente desistiu',
          confirmText: 'Cancelar item',
          danger: true,
        });
    if (!reason) return;
    // Espeto entra direto na brasa: quem cancela diz se ainda dá para devolver ao estoque
    let returnStock: boolean | undefined;
    const tracksStock = products.find((p) => p.id === item.product_id)?.tracks_stock;
    if (item.status === 'IN_PREPARATION' && tracksStock) {
      const answer = await askReturnToStock(requestChoice, `${item.quantity}x ${item.product_name}`);
      if (answer === null) return;
      returnStock = answer;
    }
    try {
      cancelOrderItemAtomic(item.id, reason, currentProfile.id, currentShift.id, returnStock);
      notify(swap ? `${item.product_name} cancelado. Escolha o item substituto no cardápio.` : 'Item cancelado.', 'success');
      if (swap) onSwap?.(item);
    } catch (error: unknown) {
      notify(error instanceof Error ? error.message : 'Não foi possível cancelar o item.', 'error');
    }
  };

  if (!tab) return null;
  // Mesa recém-aberta: sem quadro vazio, o cardápio aparece logo
  if (!compact && items.length === 0) return null;

  // Na tela de pedido começa recolhido numa linha; toca para ver os itens
  if (!compact && !expanded) {
    const summary = [`${totalCount} na mesa`, preparingCount ? `${preparingCount} na brasa` : null, readyCount ? `${readyCount} ${readyCount === 1 ? 'pronto' : 'prontos'}` : null].filter(Boolean).join(' · ');
    return (
      <button type="button" onClick={() => setExpanded(true)} aria-expanded={false} className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-left">
        <span className="min-w-0 truncate text-[17px] text-ink"><span className="font-semibold">{summary}</span></span>
        <span className="flex shrink-0 items-center gap-1 text-base font-semibold text-brand-700">Ver<ChevronDown className="h-4 w-4" aria-hidden="true" /></span>
      </button>
    );
  }

  return (
    <section aria-labelledby={`tab-items-${table.id}`} className={compact ? 'space-y-2' : 'surface-card space-y-3 p-4'}>
      {!compact && (
        <div className="flex items-baseline justify-between gap-3">
          <button type="button" onClick={() => setExpanded(false)} aria-expanded={true} className="flex items-center gap-1 text-left"><h2 id={`tab-items-${table.id}`} className="text-base font-semibold">Já lançado nesta mesa</h2><ChevronDown className="h-4 w-4 rotate-180 text-ink-muted" aria-hidden="true" /></button>
          <span className="flex items-center gap-2 text-base text-ink-muted tabular-nums">{active.length} {active.length === 1 ? 'item' : 'itens'} · {formatBRL(tab.subtotal)}<VoidTabButton tab={tab} tableNumber={table.number} compact /></span>
        </div>
      )}
      {active.length === 0 ? (
        <p className="py-4 text-center text-base text-ink-muted">Nenhum item lançado ainda. Escolha os produtos abaixo.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {active.map((item) => {
            const status = getOrderItemStatusConfig(item.status);
            // Somente gerência ou caixa pode alterar/cancelar itens já lançados; garçom nunca cancela após lançamento
            const canChange = isManager && item.status !== 'DELIVERED';
            return (
              <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold leading-snug text-ink">{item.quantity}x {item.product_name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-base text-ink-muted">
                    <span className={`rounded-sm px-1.5 py-0.5 font-medium ${status.bg} ${status.color}`}>{status.label}</span>
                    {item.doneness && <span>Ponto: {formatDoneness(item.doneness)}</span>}
                    <span className="tabular-nums">{formatBRL(item.unit_price * item.quantity)}</span>
                  </p>
                  {item.notes && <p className="mt-0.5 text-base text-ink-secondary">Obs: {item.notes}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {canChange && (
                    <>
                      <button type="button" className="btn-secondary px-3 py-2" onClick={() => void cancel(item, true)} aria-label={`Trocar ${item.product_name}`}>
                        <ArrowLeftRight className="h-4 w-4" aria-hidden="true" /><span className="hidden xs:inline">Trocar</span>
                      </button>
                      {/* Cancelar sem troca só gerente/master (evita fraude); garçom só troca */}
                      {isManager && (
                        <button type="button" className="icon-button h-10 w-10 text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={() => void cancel(item, false)} aria-label={`Cancelar ${item.product_name}`}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {cancelled.length > 0 && (
        <details className="text-base text-ink-muted">
          <summary className="cursor-pointer py-1">{cancelled.length} {cancelled.length === 1 ? 'item cancelado' : 'itens cancelados'}</summary>
          <ul className="mt-1 space-y-0.5 pl-4">
            {cancelled.map((item) => <li key={item.id} className="line-through">{item.quantity}x {item.product_name}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}
