import {
  AlertCircle,
  CheckCheck,
  Filter,
  Flame,
  Layers,
  Sparkles,
  Volume2,
  VolumeX
} from 'lucide-react';
import React, { useState } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { audioService } from '../../lib/audio';
import { formatDoneness, getOrderItemStatusConfig } from '../../lib/formatters';
import { useStockStore } from '../../stores/useStockStore';
import { useTableStore } from '../../stores/useTableStore';
import { GrillExhaustModal } from './GrillExhaustModal';
import { GrillLiveSummary } from './GrillLiveSummary';
import { KDSElapsedTimer } from './KDSElapsedTimer';

type KDSFilter = 'ALL_ACTIVE' | 'RECEIVED' | 'IN_PREPARATION' | 'READY';

export const GrillKDSView: React.FC = () => {
  const { orders, orderItems, tables, updateOrderItemStatus, updateOrderSectorItemsStatus } = useTableStore();
  const { dailyPrepStock } = useStockStore();

  const [filter, setFilter] = useState<KDSFilter>('ALL_ACTIVE');
  const [isExhaustModalOpen, setIsExhaustModalOpen] = useState<boolean>(false);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(audioService.getAudioEnabled());

  const handleToggleAudio = () => {
    const next = !audioEnabled;
    audioService.setAudioEnabled(next);
    setAudioEnabled(next);
    if (next) {
      audioService.playNewOrderSound();
    }
  };

  // Filtra itens apenas do setor GRILL
  const grillItems = orderItems.filter((i) => i.sector === 'GRILL' && i.status !== 'CANCELLED');

  // Filtra de acordo com a aba selecionada
  const filteredItems = grillItems.filter((i) => {
    if (filter === 'ALL_ACTIVE') return i.status === 'RECEIVED' || i.status === 'IN_PREPARATION';
    if (filter === 'RECEIVED') return i.status === 'RECEIVED';
    if (filter === 'IN_PREPARATION') return i.status === 'IN_PREPARATION';
    if (filter === 'READY') return i.status === 'READY';
    return true;
  });

  // Agrupa pedidos que possuem itens filtrados de churrasqueira
  const orderIdsWithItems = Array.from(new Set(filteredItems.map((i) => i.order_id)));

  // Ordena os pedidos pelo mais antigo primeiro (prioridade FIFO de restaurante)
  const sortedOrders = orders
    .filter((o) => orderIdsWithItems.includes(o.id))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // Contagens para os botões de filtro
  const countReceived = grillItems.filter((i) => i.status === 'RECEIVED').length;
  const countInPrep = grillItems.filter((i) => i.status === 'IN_PREPARATION').length;
  const countReady = grillItems.filter((i) => i.status === 'READY').length;
  const countActive = countReceived + countInPrep;

  const countExhausted = dailyPrepStock.filter((s) => s.is_exhausted || s.current_quantity <= 0).length;

  return (
    <div className="page-layout">

      <PageHeader eyebrow="Produção" title="Churrasqueira" description="Pedidos em ordem de chegada. Confira o ponto da carne antes de enviar à brasa." icon={Flame} actions={<>
        <button type="button" onClick={handleToggleAudio} className="icon-button" aria-pressed={audioEnabled} aria-label={audioEnabled ? 'Desativar alertas sonoros' : 'Ativar alertas sonoros'} title={audioEnabled ? 'Som ativado' : 'Som desativado'}>{audioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</button>
        <button type="button" onClick={() => setIsExhaustModalOpen(true)} className="btn-secondary text-rose-700"><AlertCircle className="h-4 w-4" aria-hidden="true" />Disponibilidade dos espetos{countExhausted > 0 && <span className="rounded-md bg-rose-50 px-2 py-0.5 text-xs">{countExhausted}</span>}</button>
      </>} />

      {/* Resumo Agregado da Grelha */}
      <GrillLiveSummary orderItems={orderItems} />

      {/* Filtros Rápidos da Fila */}
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
          <span>Na brasa ({countInPrep})</span>
        </button>

        <button
          onClick={() => setFilter('READY')}
          className={`filter-chip ${filter === 'READY' ? 'is-active' : ''}`}
          type="button" aria-pressed={filter === 'READY'}>
          <span>Prontos ({countReady})</span>
        </button>
      </div>

      {/* Grade de Comandas / Pedidos em Produção */}
      {sortedOrders.length === 0 ? (
        <EmptyState title="Tudo em dia na churrasqueira" description="Os próximos pedidos de espetos aparecerão nesta fila." icon={Sparkles} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sortedOrders.map((order) => {
            const table = tables.find((t) => t.id === order.table_id);
            const tableNum = table ? String(table.number).padStart(2, '0') : '??';

            const itemsInThisOrder = filteredItems.filter((i) => i.order_id === order.id);
            const allOrderGrillItems = grillItems.filter((i) => i.order_id === order.id);

            const hasReceived = allOrderGrillItems.some((i) => i.status === 'RECEIVED');
            const hasInPrep = allOrderGrillItems.some((i) => i.status === 'IN_PREPARATION');

            return (
              <div
                key={order.id}
                className="bg-surface-muted border border-line hover:border-brand-300 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between space-y-4 transition"
              >
                {/* Cabeçalho do Card */}
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3.5">
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="text-2xl font-bold text-ink tabular-nums tracking-tight">
                          MESA {tableNum}
                        </span>
                        <span className="text-xs px-2.5 py-0.5 rounded-xl bg-surface-muted border border-line text-ink-muted tabular-nums font-bold">
                          #{order.order_number}
                        </span>
                      </div>
                      {order.notes && (
                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 p-2 rounded-xl italic mt-1 font-semibold">
                          Obs Mesa: {order.notes}
                        </p>
                      )}
                    </div>

                    {/* Cronômetro SLA */}
                    <KDSElapsedTimer createdAt={order.created_at} warningMinutes={10} urgentMinutes={20} />
                  </div>

                  {/* Lista de Espetos */}
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
                              ? 'bg-amber-50 border-amber-300'
                              : isReady
                                ? 'bg-emerald-50 border-emerald-300'
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
                              {item.doneness && (
                                <span className="text-xs px-2.5 py-0.5 rounded-lg bg-amber-100 text-amber-800 border border-amber-200 tabular-nums font-bold">
                                  {formatDoneness(item.doneness)}
                                </span>
                              )}
                            </div>

                            {item.notes && (
                              <p className="text-xs text-amber-800 italic mt-0.5">
                                Obs: {item.notes}
                              </p>
                            )}

                            <div className="mt-1.5 flex items-center gap-2">
                              <span
                                className={`text-xs px-2.5 py-0.5 rounded-full border font-bold ${statusConf.bg} ${statusConf.color}`}
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
                                className="w-full 2xl:w-auto px-4 py-2.5 rounded-xl btn-primary text-xs transition shadow-sm flex items-center justify-center gap-1.5"
                                type="button">
                                <Flame className="w-4 h-4 text-ink" />
                                <span>Na Brasa</span>
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
                                <span>Aguardando Garçom</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Ações em Lote do Pedido */}
                <div className="border-t border-line pt-3.5 flex items-center gap-2">
                  {hasReceived && (
                    <button
                      onClick={() => updateOrderSectorItemsStatus(order.id, 'GRILL', 'IN_PREPARATION')}
                      className="flex-1 py-3 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs transition border border-amber-200 flex items-center justify-center gap-1.5 shadow-sm"
                      type="button">
                      <Layers className="w-4 h-4" />
                      <span>Todos na Brasa</span>
                    </button>
                  )}

                  {hasInPrep && (
                    <button
                      onClick={() => updateOrderSectorItemsStatus(order.id, 'GRILL', 'READY')}
                      className="flex-1 py-3 rounded-2xl btn-success text-xs transition shadow-sm flex items-center justify-center gap-1.5"
                      type="button">
                      <CheckCheck className="w-4 h-4" />
                      <span>Tudo Pronto!</span>
                    </button>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Esgotamento de Espetos */}
      <GrillExhaustModal
        isOpen={isExhaustModalOpen}
        onClose={() => setIsExhaustModalOpen(false)}
      />

    </div>
  );
};
