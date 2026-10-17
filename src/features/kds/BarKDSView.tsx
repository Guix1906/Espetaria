import {
  Beer,
  CheckCheck,
  Filter,
  Layers,
  Sparkles,
  Volume2,
  VolumeX,
  Wine
} from 'lucide-react';
import React, { useState } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { audioService } from '../../lib/audio';
import { getOrderItemStatusConfig } from '../../lib/formatters';
import { useTableStore } from '../../stores/useTableStore';
import { KDSElapsedTimer } from './KDSElapsedTimer';

type KDSFilter = 'ALL_ACTIVE' | 'RECEIVED' | 'READY';

export const BarKDSView: React.FC = () => {
  const { orders, orderItems, tables, updateOrderItemStatus, updateOrderSectorItemsStatus } = useTableStore();
  const [filter, setFilter] = useState<KDSFilter>('ALL_ACTIVE');
  const [audioEnabled, setAudioEnabled] = useState<boolean>(audioService.getAudioEnabled());

  const handleToggleAudio = () => {
    const next = !audioEnabled;
    audioService.setAudioEnabled(next);
    setAudioEnabled(next);
    if (next) {
      audioService.playNewOrderSound();
    }
  };

  // Filtra itens apenas do setor BAR
  const barItems = orderItems.filter((i) => i.sector === 'BAR' && i.status !== 'CANCELLED');

  const filteredItems = barItems.filter((i) => {
    if (filter === 'ALL_ACTIVE') return i.status === 'RECEIVED' || i.status === 'IN_PREPARATION';
    if (filter === 'RECEIVED') return i.status === 'RECEIVED' || i.status === 'IN_PREPARATION';
    if (filter === 'READY') return i.status === 'READY';
    return true;
  });

  const orderIdsWithItems = Array.from(new Set(filteredItems.map((i) => i.order_id)));

  // Ordena pelo mais antigo primeiro (FIFO)
  const sortedOrders = orders
    .filter((o) => orderIdsWithItems.includes(o.id))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const countReceived = barItems.filter((i) => i.status === 'RECEIVED' || i.status === 'IN_PREPARATION').length;
  const countReady = barItems.filter((i) => i.status === 'READY').length;

  return (
    <div className="page-layout">

      <PageHeader eyebrow="Produção" title="Bar e bebidas" description="Prepare e libere as bebidas com rapidez. Priorize os pedidos mais antigos." icon={Beer} actions={<>
        <button type="button" onClick={handleToggleAudio} className="icon-button" aria-pressed={audioEnabled} aria-label={audioEnabled ? 'Desativar alertas sonoros' : 'Ativar alertas sonoros'} title={audioEnabled ? 'Som ativado' : 'Som desativado'}>{audioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</button>

      </>} />

      {/* Filtros da Fila do Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setFilter('ALL_ACTIVE')}
          className={`filter-chip ${filter === 'ALL_ACTIVE' ? 'is-active' : ''}`}
          type="button" aria-pressed={filter === 'ALL_ACTIVE'}>
          <Filter className="w-3.5 h-3.5" />
          <span>Fila ativa ({countReceived})</span>
        </button>

        <button
          onClick={() => setFilter('RECEIVED')}
          className={`filter-chip ${filter === 'RECEIVED' ? 'is-active' : ''}`}
          type="button" aria-pressed={filter === 'RECEIVED'}>
          <span>Aguardando ({countReceived})</span>
        </button>

        <button
          onClick={() => setFilter('READY')}
          className={`filter-chip ${filter === 'READY' ? 'is-active' : ''}`}
          type="button" aria-pressed={filter === 'READY'}>
          <span>Prontos ({countReady})</span>
        </button>
      </div>

      {/* Grade de Pedidos do Bar */}
      {sortedOrders.length === 0 ? (
        <EmptyState title="Tudo em dia no bar" description="As próximas bebidas aparecerão nesta fila." icon={Sparkles} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sortedOrders.map((order) => {
            const table = tables.find((t) => t.id === order.table_id);
            const tableNum = table ? String(table.number).padStart(2, '0') : '??';

            const itemsInThisOrder = filteredItems.filter((i) => i.order_id === order.id);
            const allOrderBarItems = barItems.filter((i) => i.order_id === order.id);

            const hasPending = allOrderBarItems.some((i) => i.status === 'RECEIVED' || i.status === 'IN_PREPARATION');

            return (
              <div
                key={order.id}
                className="bg-surface-muted border border-line hover:border-sky-300 rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4 transition duration-200"
              >
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl sm:text-2xl font-bold text-ink tabular-nums tracking-tight">
                          MESA {tableNum}
                        </span>
                        <span className="text-xs px-2.5 py-0.5 rounded-sm bg-surface-muted border-line text-ink-muted tabular-nums font-medium">
                          #{order.order_number}
                        </span>
                      </div>
                      {order.notes && (
                        <p className="text-xs text-amber-800 bg-amber-50 p-2 rounded-sm italic mt-1 font-medium">
                          Obs: {order.notes}
                        </p>
                      )}
                    </div>

                    <KDSElapsedTimer createdAt={order.created_at} warningMinutes={3} urgentMinutes={6} />
                  </div>

                  {/* Lista de Bebidas */}
                  <div className="mt-3.5 space-y-2.5">
                    {itemsInThisOrder.map((item) => {
                      const statusConf = getOrderItemStatusConfig(item.status);
                      const isPending = item.status === 'RECEIVED' || item.status === 'IN_PREPARATION';
                      const isReady = item.status === 'READY';

                      return (
                        <div
                          key={item.id}
                          className={`p-3.5 rounded-2xl border transition flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-3 shadow-sm ${isReady
                              ? 'bg-emerald-50'
                              : 'bg-surface-muted border-line'
                            }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-lg font-bold text-sky-700 tabular-nums">
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

                            <div className="mt-1 flex items-center gap-2">
                              <span
                                className={`text-xs px-2 py-0.5 rounded-sm font-medium ${statusConf.bg} ${statusConf.color}`}
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

                          {/* Botão de Ação 1-Tap */}
                          <div className="shrink-0 flex items-center gap-2">
                            {isPending && (
                              <button
                                onClick={() => updateOrderItemStatus(item.id, 'READY')}
                                className="w-full 2xl:w-auto px-4 py-2.5 rounded-xl bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs transition shadow-sm flex items-center justify-center gap-1.5"
                                type="button">
                                <Wine className="w-4 h-4" />
                                <span>Pronto!</span>
                              </button>
                            )}

                            {isReady && (
                              <div className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-1.5">
                                <CheckCheck className="w-4 h-4 text-emerald-700" />
                                <span>No balcão</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Ação em Lote */}
                {hasPending && (
                  <div className="border-t border-line pt-3">
                    <button
                      onClick={() => updateOrderSectorItemsStatus(order.id, 'BAR', 'READY')}
                      className="btn-success w-full py-3 rounded-2xl flex items-center justify-center gap-2 text-xs"
                      type="button">
                      <Layers className="w-4 h-4" />
                      <span>Liberar bebidas da mesa</span>
                    </button>
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
