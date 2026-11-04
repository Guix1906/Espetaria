import { VoidTabButton } from '../tables/VoidTabButton';
import { ArrowLeftRight, ChevronDown, Printer, Trash2 } from 'lucide-react';
import { isFreshReady, isPendingProduction } from '../../lib/productionStatus';
import { useState } from 'react';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { formatBRL, formatDoneness, getOrderItemStatusConfig } from '../../lib/formatters';
import { useAuthStore } from '../../stores/useAuthStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useStockStore } from '../../stores/useStockStore';
import { useTableStore } from '../../stores/useTableStore';
import { usePrintStore } from '../../stores/usePrintStore';
import type { OrderItem, RestaurantTable } from '../../types/domain';
import { askReturnToStock } from '../../lib/askReturnToStock';
import { ItemSwapModal } from './ItemSwapModal';

interface TabItemsPanelProps {
  table: RestaurantTable;
  /** Chamado depois de trocar um item */
  compact?: boolean;
}

/** Itens já lançados na comanda da mesa, com servir, cancelar, trocar e reimprimir. */
export function TabItemsPanel({ table, compact = false }: TabItemsPanelProps) {
  const { tabs, getTabOrderItems, cancelOrderItemAtomic, reprintOrderItemProduction, reprintTableProduction } = useTableStore();
  const { currentProfile } = useAuthStore();
  const { currentShift } = useShiftStore();
  const { notify, requestText, requestChoice } = useFeedback();
  const products = useStockStore((s) => s.products);
  const printJobs = usePrintStore((s) => s.jobs);

  const tab = tabs.find((t) => t.table_id === table.id && t.status === 'OPEN');
  const items = tab ? getTabOrderItems(tab.id) : [];
  const isManager = ['MASTER', 'GERENTE'].includes(currentProfile.role);
  const active = items.filter((item) => item.status !== 'CANCELLED');
  const cancelled = items.filter((item) => item.status === 'CANCELLED');
  const [expanded, setExpanded] = useState(false);
  const [swappingItem, setSwappingItem] = useState<OrderItem | null>(null);
  const [reprintingAll, setReprintingAll] = useState(false);

  const preparingCount = active.filter(isPendingProduction).reduce((s, i) => s + i.quantity, 0);
  const readyCount = active.filter((i) => isFreshReady(i)).reduce((s, i) => s + i.quantity, 0);
  const totalCount = active.reduce((s, i) => s + i.quantity, 0);

  const handleCancelDirect = async (item: OrderItem) => {
    if (!isManager) {
      notify('Garçom não tem permissão para excluir itens sem substituição. Use o botão Trocar ou solicite ao gerente.', 'error');
      return;
    }
    if (!currentShift) { notify('Turno fechado: não é possível alterar a comanda.', 'error'); return; }
    const reason = await requestText({
      title: `Cancelar ${item.quantity}x ${item.product_name}`,
      label: 'Motivo do cancelamento',
      message: item.status === 'DELIVERED' ? 'O item sai da conta da mesa e fica registrado na auditoria.' : item.status === 'RECEIVED' ? 'O item ainda não entrou em preparo.' : 'Este item já está em produção: a churrasqueira/cozinha recebe um cupom de cancelamento.',
      initialValue: 'Cliente desistiu',
      confirmText: 'Cancelar item',
      danger: true,
    });
    if (!reason) return;

    let returnStock: boolean | undefined;
    const tracksStock = products.find((p) => p.id === item.product_id)?.tracks_stock;
    if (item.status === 'IN_PREPARATION' && tracksStock) {
      const answer = await askReturnToStock(requestChoice, `${item.quantity}x ${item.product_name}`);
      if (answer === null) return;
      returnStock = answer;
    }
    try {
      cancelOrderItemAtomic(item.id, reason, currentProfile.id, currentShift.id, returnStock);
      notify(item.status === 'DELIVERED' ? 'Item excluído da conta.' : 'Item cancelado. Cupom de cancelamento enviado à produção.', 'success');
    } catch (error: unknown) {
      notify(error instanceof Error ? error.message : 'Não foi possível cancelar o item.', 'error');
    }
  };

  const handleReprintItem = async (item: OrderItem) => {
    try {
      const ok = await reprintOrderItemProduction(item.id);
      if (ok) {
        notify(`Cupom de ${item.product_name} reenviado para a produção (2ª Via).`, 'success');
      } else {
        notify('Não foi possível reenviar o cupom deste item.', 'error');
      }
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Erro ao reenviar cupom.', 'error');
    }
  };

  const handleReprintAllProduction = async () => {
    setReprintingAll(true);
    try {
      const ok = await reprintTableProduction(table.id);
      if (ok) {
        notify('Pedidos da mesa reenviados para a Churrasqueira e Cozinha (2ª Via).', 'success');
      } else {
        notify('Não foi possível reenviar os pedidos.', 'error');
      }
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Erro ao reenviar pedidos.', 'error');
    } finally {
      setReprintingAll(false);
    }
  };

  if (!tab) return null;
  if (!compact && items.length === 0) return null;

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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => setExpanded(false)} aria-expanded={true} className="flex items-center gap-1 text-left">
            <h2 id={`tab-items-${table.id}`} className="text-base font-semibold">Já lançado nesta mesa</h2>
            <ChevronDown className="h-4 w-4 rotate-180 text-ink-muted" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2 text-sm">
            {active.length > 0 && (
              <button
                type="button"
                onClick={() => void handleReprintAllProduction()}
                disabled={reprintingAll}
                className="btn-secondary px-2.5 py-1 text-xs font-semibold flex items-center gap-1.5 text-brand-700 border-brand-200 bg-brand-50 hover:bg-brand-100 disabled:opacity-50"
                title="Reenviar todos os pedidos da mesa para a churrasqueira e cozinha"
              >
                <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{reprintingAll ? 'Enviando...' : 'Reenviar à produção'}</span>
              </button>
            )}
            <span className="text-ink-muted tabular-nums">{active.length} {active.length === 1 ? 'item' : 'itens'} · {formatBRL(tab.subtotal)}</span>
            <VoidTabButton tab={tab} tableNumber={table.number} compact />
          </div>
        </div>
      )}
      {active.length === 0 ? (
        <p className="py-4 text-center text-base text-ink-muted">Nenhum item lançado ainda. Escolha os produtos abaixo.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {active.map((item) => {
            const status = getOrderItemStatusConfig(item.status);
            // Qualquer garçom ou gerente pode trocar o item antes da entrega
            const canSwap = item.status !== 'DELIVERED';
            // Apenas gerente/master cancela sem troca; vale também para entregue (bebida da mesa já nasce entregue)
            const canCancelDirect = isManager;
            const canReprint = item.sector === 'GRILL' || item.sector === 'KITCHEN';

            const itemJobs = printJobs.filter((j) => j.order_id === item.order_id && j.sector === item.sector);
            const isPrinted = itemJobs.some((j) => j.status === 'PRINTED');
            const isPending = itemJobs.some((j) => j.status === 'PENDING' || j.status === 'PRINTING');

            return (
              <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold leading-snug text-ink">{item.quantity}x {item.product_name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-base text-ink-muted">
                    <span className={`rounded-sm px-1.5 py-0.5 font-medium ${status.bg} ${status.color}`}>{status.label}</span>
                    {isPrinted && (
                      <span className="inline-flex items-center gap-1 rounded-sm bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
                        <Printer className="h-3 w-3" />
                        Impresso
                      </span>
                    )}
                    {isPending && (
                      <span className="inline-flex items-center gap-1 rounded-sm bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                        <Printer className="h-3 w-3" />
                        Na fila
                      </span>
                    )}
                    {item.doneness && <span>Ponto: {formatDoneness(item.doneness)}</span>}
                    <span className="tabular-nums font-mono font-medium">{formatBRL(item.unit_price * item.quantity)}</span>
                  </p>
                  {item.notes && <p className="mt-0.5 text-base text-ink-secondary">Obs: {item.notes}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {/* Botão de Reenviar à Produção (Reimprimir) */}
                  {canReprint && (
                    <button
                      type="button"
                      className="btn-secondary px-2.5 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50 border-brand-200"
                      onClick={() => void handleReprintItem(item)}
                      title={`Reenviar cupom de ${item.product_name} à produção`}
                      aria-label={`Reenviar ${item.product_name} à produção`}
                    >
                      <Printer className="h-4 w-4" aria-hidden="true" />
                      <span className="hidden xs:inline">Reenviar</span>
                    </button>
                  )}

                  {/* Botão de Trocar Item (Garçom e Gerente) */}
                  {canSwap && (
                    <button
                      type="button"
                      className="btn-secondary px-3 py-2 text-xs font-semibold"
                      onClick={() => setSwappingItem(item)}
                      title={`Substituir ${item.product_name} por outro item`}
                      aria-label={`Trocar ${item.product_name}`}
                    >
                      <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
                      <span className="hidden xs:inline">Trocar</span>
                    </button>
                  )}

                  {/* Cancelar sem troca: apenas Gerente/Master */}
                  {canCancelDirect && (
                    <button
                      type="button"
                      className="icon-button h-10 w-10 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                      onClick={() => void handleCancelDirect(item)}
                      title={`Excluir ${item.product_name} da comanda`}
                      aria-label={`Cancelar ${item.product_name}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
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

      {/* Modal de Troca Atômica de Item */}
      {swappingItem && (
        <ItemSwapModal
          isOpen={!!swappingItem}
          item={swappingItem}
          table={table}
          onClose={() => setSwappingItem(null)}
        />
      )}
    </section>
  );
}
