import {
  AlertOctagon,
  CheckCheck,
  CheckCircle2,
  Filter,
  Layers,
  Printer,
  Soup,
  Sparkles,
  UtensilsCrossed,
  Volume2,
  VolumeX
} from 'lucide-react';
import React, { useState } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { audioService } from '../../lib/audio';
import { getOrderItemStatusConfig } from '../../lib/formatters';
import { useAuthStore } from '../../stores/useAuthStore';
import { usePrintStore } from '../../stores/usePrintStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useStockStore } from '../../stores/useStockStore';
import { useTableStore } from '../../stores/useTableStore';
import { GrillReadyAlerts } from './GrillReadyAlerts';
import { KDSElapsedTimer } from './KDSElapsedTimer';

type KDSFilter = 'ALL_ACTIVE' | 'RECEIVED' | 'IN_PREPARATION' | 'READY';

export const KitchenKDSView: React.FC = () => {
  const { orders, orderItems, tables, updateOrderItemStatus, updateOrderSectorItemsStatus } = useTableStore();
  const { products, dailyPrepStock, toggleExhaustProduct } = useStockStore();
  const { currentShift } = useShiftStore();
  const { currentProfile } = useAuthStore();
  const { jobs } = usePrintStore();

  const kitchenPrintJobsCount = jobs.filter((j) => j.sector === 'KITCHEN' && j.status === 'PRINTED').length;

  const [filter, setFilter] = useState<KDSFilter>('ALL_ACTIVE');
  const [audioEnabled, setAudioEnabled] = useState<boolean>(audioService.getAudioEnabled());
  const [showCubasMonitor, setShowCubasMonitor] = useState<boolean>(true);

  const handleToggleAudio = () => {
    const next = !audioEnabled;
    audioService.setAudioEnabled(next);
    setAudioEnabled(next);
    if (next) {
      audioService.playNewOrderSound();
    }
  };

  // Produtos gerenciados em cubas ou da cozinha
  const cubaStockItems = dailyPrepStock.filter((s) => {
    const prod = products.find((p) => p.id === s.product_id);
    return prod?.is_cubas || prod?.sector === 'KITCHEN';
  });

  const handleToggleExhaustCuba = (productId: string, currentExhausted: boolean) => {
    if (!currentShift) return;
    const nextStatus = !currentExhausted;
    const reason = nextStatus ? 'Esgotado pelo cozinheiro via KDS Cubas' : undefined;
    toggleExhaustProduct(currentShift.id, productId, nextStatus, currentProfile.id, reason);
  };

  // Filtra itens apenas do setor KITCHEN
  const kitchenItems = orderItems.filter((i) => i.sector === 'KITCHEN' && i.status !== 'CANCELLED');

  const filteredItems = kitchenItems.filter((i) => {
    if (filter === 'ALL_ACTIVE') return i.status === 'RECEIVED' || i.status === 'IN_PREPARATION';
    if (filter === 'RECEIVED') return i.status === 'RECEIVED';
    if (filter === 'IN_PREPARATION') return i.status === 'IN_PREPARATION';
    if (filter === 'READY') return i.status === 'READY';
    return true;
  });

  const orderIdsWithItems = Array.from(new Set(filteredItems.map((i) => i.order_id)));

  // Ordena pelo mais antigo primeiro (FIFO)
  const sortedOrders = orders
    .filter((o) => orderIdsWithItems.includes(o.id))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const countReceived = kitchenItems.filter((i) => i.status === 'RECEIVED').length;
  const countInPrep = kitchenItems.filter((i) => i.status === 'IN_PREPARATION').length;
  const countReady = kitchenItems.filter((i) => i.status === 'READY').length;
  const countActive = countReceived + countInPrep;

  return (
    <div className="page-layout">

      <PageHeader eyebrow="Produção" title="Cozinha" description="Produção conduzida por impressora térmica. Porções e acompanhamentos impressos na bobina." icon={UtensilsCrossed} actions={<>
        <button type="button" onClick={handleToggleAudio} className="icon-button" aria-pressed={audioEnabled} aria-label={audioEnabled ? 'Desativar alertas sonoros' : 'Ativar alertas sonoros'} title={audioEnabled ? 'Som ativado' : 'Som desativado'}>{audioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</button>
        <button type="button" aria-expanded={showCubasMonitor} onClick={() => setShowCubasMonitor(!showCubasMonitor)} className="btn-secondary"><Soup className="h-4 w-4" aria-hidden="true" />{showCubasMonitor ? 'Ocultar cubas' : 'Mostrar cubas'}</button>
      </>} />

      <GrillReadyAlerts />

      {/* Indicador de Operação por Impressora Térmica (Sem Celulares) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-sm text-xs">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-emerald-100 text-emerald-800">
            <Printer className="h-4 w-4" />
          </span>
          <div>
            <span className="font-bold text-ink flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Impressora da Cozinha Ativa (Execução 100% no Papel)
            </span>
            <p className="text-ink-muted text-[11px]">
              As porções e acompanhamentos saem impressos diretamente na bobina por ordem de chegada. Sem celulares na produção.
            </p>
          </div>
        </div>
        <span className="badge-brand text-xs font-semibold">
          Comandas impressas: {kitchenPrintJobsCount}
        </span>
      </div>

      {/* MONITOR DE CUBAS GASTRONÔMICAS (GN) */}
      {showCubasMonitor && (
        <div className="bg-surface-muted border border-emerald-200 rounded-2xl shadow-sm overflow-hidden p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <Soup className="w-5 h-5 text-emerald-700" />
              <h3 className="font-bold text-ink text-sm font-sans">
                Estoque das cubas
              </h3>
            </div>
            <span className="text-xs text-ink-muted tabular-nums">
              Saldo disponível em porções
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
            {cubaStockItems.map((item) => {
              const prod = products.find((p) => p.id === item.product_id);
              if (!prod) return null;

              const isExhausted = item.is_exhausted || item.current_quantity <= 0;
              const isLow = item.current_quantity <= 10 && !isExhausted;
              const percent = item.initial_quantity > 0
                ? Math.max(0, Math.min(100, Math.round((item.current_quantity / item.initial_quantity) * 100)))
                : 0;

              return (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-2xl border transition flex flex-col justify-between shadow-sm ${isExhausted
                      ? 'bg-rose-50 border-rose-200 text-ink-muted'
                      : isLow
                        ? 'bg-amber-50'
                        : 'bg-surface-muted border-line'
                    }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-1">
                      <h4 className="font-bold text-xs text-ink line-clamp-1">
                        {prod.name}
                      </h4>
                      {isExhausted ? (
                        <span className="text-xs px-1.5 py-0.5 rounded-sm bg-rose-100 text-rose-800 font-medium">
                          Zero
                        </span>
                      ) : isLow ? (
                        <span className="text-xs px-1.5 py-0.5 rounded-sm bg-amber-100 text-amber-800 font-medium">
                          Baixo
                        </span>
                      ) : null}
                    </div>

                    {/* Barra de Progresso da Cuba */}
                    <div className="mt-2.5 space-y-1">
                      <div className="w-full h-2 rounded-sm bg-surface-muted overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${isExhausted
                              ? 'bg-rose-700'
                              : isLow
                                ? 'bg-amber-700'
                                : 'bg-emerald-700'
                            }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs tabular-nums text-ink-muted">
                        <span>Resta: <strong className="text-ink font-bold">{item.current_quantity}</strong></span>
                        <span>{percent}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Botão de Bloqueio Rápido de Cuba */}
                  <button
                    onClick={() => handleToggleExhaustCuba(item.product_id, item.is_exhausted)}
                    className={`mt-3 w-full py-1.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 ${isExhausted
                        ? 'btn-success'
                        : 'bg-surface-muted hover:bg-rose-50 border-line hover: text-ink hover:text-rose-700'
                      }`}
                    type="button">
                    {isExhausted ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Reativar cuba</span>
                      </>
                    ) : (
                      <>
                        <AlertOctagon className="w-3 h-3 text-rose-700" />
                        <span>Marcar cuba esgotada</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtros Rápidos da Fila da Cozinha */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setFilter('ALL_ACTIVE')}
          className={`filter-chip ${filter === 'ALL_ACTIVE' ? 'is-active' : ''}`}
          type="button" aria-pressed={filter === 'ALL_ACTIVE'}>
          <Filter className="w-3.5 h-3.5" />
          <span>Fila ativa ({countActive})</span>
        </button>

        <button
          onClick={() => setFilter('RECEIVED')}
          className={`filter-chip ${filter === 'RECEIVED' ? 'is-active' : ''}`}
          type="button" aria-pressed={filter === 'RECEIVED'}>
          <span>Aguardando ({countReceived})</span>
        </button>

        <button
          onClick={() => setFilter('IN_PREPARATION')}
          className={`filter-chip ${filter === 'IN_PREPARATION' ? 'is-active' : ''}`}
          type="button" aria-pressed={filter === 'IN_PREPARATION'}>
          <span>Em preparo ({countInPrep})</span>
        </button>

        <button
          onClick={() => setFilter('READY')}
          className={`filter-chip ${filter === 'READY' ? 'is-active' : ''}`}
          type="button" aria-pressed={filter === 'READY'}>
          <span>Prontos ({countReady})</span>
        </button>
      </div>

      {/* Grade de Pedidos da Cozinha */}
      {sortedOrders.length === 0 ? (
        <EmptyState title="Tudo em dia na cozinha" description="Os próximos acompanhamentos aparecerão nesta fila." icon={Sparkles} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sortedOrders.map((order) => {
            const table = tables.find((t) => t.id === order.table_id);
            const tableNum = table ? String(table.number).padStart(2, '0') : '??';

            const itemsInThisOrder = filteredItems.filter((i) => i.order_id === order.id);
            const allOrderKitchenItems = kitchenItems.filter((i) => i.order_id === order.id);

            const hasReceived = allOrderKitchenItems.some((i) => i.status === 'RECEIVED');
            const hasInPrep = allOrderKitchenItems.some((i) => i.status === 'IN_PREPARATION');

            return (
              <div
                key={order.id}
                className="bg-surface-muted border border-line hover:border-emerald-300 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between space-y-4 transition"
              >
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3.5">
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="text-2xl font-bold text-ink tabular-nums tracking-tight">
                          MESA {tableNum}
                        </span>
                        <span className="text-xs px-2.5 py-0.5 rounded-sm bg-surface-muted border-line text-ink-muted tabular-nums font-medium">
                          #{order.order_number}
                        </span>
                      </div>
                      {order.notes && (
                        <p className="text-xs text-amber-800 bg-amber-50 p-2 rounded-sm italic mt-1 font-semibold">
                          Obs Mesa: {order.notes}
                        </p>
                      )}
                    </div>

                    <KDSElapsedTimer createdAt={order.created_at} warningMinutes={10} urgentMinutes={20} />
                  </div>

                  {/* Lista de Porções e Guarnições */}
                  <div className="mt-3.5 space-y-2.5">
                    {itemsInThisOrder.map((item) => {
                      const statusConf = getOrderItemStatusConfig(item.status);
                      const isReceived = item.status === 'RECEIVED';
                      const isInPrep = item.status === 'IN_PREPARATION';
                      const isReady = item.status === 'READY';

                      return (
                        <div
                          key={item.id}
                          className={`p-3.5 rounded-2xl border transition flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-3 shadow-sm ${isInPrep
                              ? 'bg-emerald-50'
                              : isReady
                                ? 'bg-emerald-50'
                                : 'bg-surface-muted border-line'
                            }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-lg font-bold text-ink tabular-nums">
                                {item.quantity}x
                              </span>
                              <span className="font-bold text-ink text-base">
                                {item.product_name}
                              </span>
                            </div>

                            {item.notes && (
                              <p className="text-xs text-amber-800 italic mt-0.5">
                                Obs: {item.notes}
                              </p>
                            )}

                            <div className="mt-1.5 flex items-center gap-2">
                              <span
                                className={`text-xs px-2.5 py-0.5 rounded-sm font-medium ${statusConf.bg} ${statusConf.color}`}
                              >
                                {statusConf.label}
                              </span>
                              {item.prepared_at && (
                                <span className="text-xs text-ink-muted tabular-nums">
                                  Pronto às {new Date(item.prepared_at).toLocaleTimeString()}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Botão de Ação 1-Tap no Item */}
                          <div className="shrink-0 flex items-center gap-2">
                            {isReceived && (
                              <button
                                onClick={() => updateOrderItemStatus(item.id, 'IN_PREPARATION')}
                                className="w-full 2xl:w-auto px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition shadow-sm flex items-center justify-center gap-1.5"
                                type="button">
                                <UtensilsCrossed className="w-4 h-4" />
                                <span>Preparar</span>
                              </button>
                            )}

                            {isInPrep && (
                              <button
                                onClick={() => updateOrderItemStatus(item.id, 'READY')}
                                className="w-full 2xl:w-auto px-4 py-2.5 rounded-xl btn-success text-xs transition shadow-sm flex items-center justify-center gap-1.5"
                                type="button">
                                <CheckCheck className="w-4 h-4" />
                                <span>Pronto!</span>
                              </button>
                            )}

                            {isReady && (
                              <div className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-1.5">
                                <CheckCheck className="w-4 h-4 text-emerald-700" />
                                <span>Aguardando garçom</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Ações em Lote */}
                <div className="border-t border-line pt-3.5 flex items-center gap-2">
                  {hasReceived && (
                    <button
                      onClick={() => updateOrderSectorItemsStatus(order.id, 'KITCHEN', 'IN_PREPARATION')}
                      className="flex-1 py-3 rounded-sm bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-medium text-xs transition flex items-center justify-center gap-1.5"
                      type="button">
                      <Layers className="w-4 h-4" />
                      <span>Preparar todos</span>
                    </button>
                  )}

                  {hasInPrep && (
                    <button
                      onClick={() => updateOrderSectorItemsStatus(order.id, 'KITCHEN', 'READY')}
                      className="flex-1 py-3 rounded-2xl btn-success text-xs transition shadow-sm flex items-center justify-center gap-1.5"
                      type="button">
                      <CheckCheck className="w-4 h-4" />
                      <span>Tudo pronto</span>
                    </button>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
