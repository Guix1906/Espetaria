import React, { useState } from 'react';
import { 
  Wine, 
  CheckCheck, 
  Filter, 
  Volume2, 
  VolumeX, 
  Sparkles,
  Layers,
  Beer
} from 'lucide-react';
import { useTableStore } from '../../stores/useTableStore';
import { KDSElapsedTimer } from './KDSElapsedTimer';
import { getOrderItemStatusConfig } from '../../lib/formatters';
import { audioService } from '../../lib/audio';

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
    <div className="min-h-0 bg-surface text-ink p-3 sm:p-5 space-y-4">
      
      {/* Topo do Bar KDS */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-surface-muted border border-line p-4 sm:p-5 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="bg-sky-700 w-12 h-12 rounded-2xl text-white flex items-center justify-center font-bold shadow-card">
            <Beer className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-bold text-ink font-sans">
                KDS Bar & Bebidas
              </h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200 tabular-nums font-bold">
                EXPEDIÇÃO &lt; 3 MIN
              </span>
            </div>
            <p className="text-xs text-ink-muted mt-0.5">
              Chopps, caipirinhas artesanais, drinks, refrigerantes e sucos naturais
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <button
            onClick={handleToggleAudio}
            className={`px-3.5 py-2.5 rounded-2xl border text-xs font-bold flex items-center gap-2 transition ${
              audioEnabled
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-sm'
                : 'bg-surface-muted text-ink-muted border-line hover:bg-surface-muted'
            }`}
            title="Sons de Alerta"
           type="button" aria-label="Sons de Alerta">
            {audioEnabled ? <Volume2 className="w-4 h-4 text-emerald-700" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline">{audioEnabled ? 'Alerta Sonoro Ativo' : 'Mudo'}</span>
          </button>
        </div>
      </div>

      {/* Filtros da Fila do Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setFilter('ALL_ACTIVE')}
          className={`filter-chip ${filter === 'ALL_ACTIVE' ? 'is-active' : ''}`}
         type="button" aria-pressed={filter === 'ALL_ACTIVE'}>
          <Filter className="w-3.5 h-3.5" />
          <span>Fila Ativa ({countReceived})</span>
        </button>

        <button
          onClick={() => setFilter('RECEIVED')}
          className={`filter-chip ${filter === 'RECEIVED' ? 'is-active' : ''}`}
         type="button" aria-pressed={filter === 'RECEIVED'}>
          <span>⏳ Aguardando Tirar ({countReceived})</span>
        </button>

        <button
          onClick={() => setFilter('READY')}
          className={`filter-chip ${filter === 'READY' ? 'is-active' : ''}`}
         type="button" aria-pressed={filter === 'READY'}>
          <span>✅ Prontos no Balcão ({countReady})</span>
        </button>
      </div>

      {/* Grade de Pedidos do Bar */}
      {sortedOrders.length === 0 ? (
        <div className="py-20 text-center rounded-2xl bg-surface-muted border border-line p-8 space-y-3 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-surface-muted border border-line text-sky-700 flex items-center justify-center mx-auto shadow-sm">
            <Sparkles className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-ink font-sans">Nenhuma bebida pendente no balcão</h3>
          <p className="text-xs text-ink-muted max-w-sm mx-auto">
            Drinks e bebidas pedidas pelos garçons ou clientes cairão instantaneamente nesta esteira.
          </p>
        </div>
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
                  <div className="flex items-center justify-between border-b border-line pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl sm:text-3xl font-bold text-ink tabular-nums tracking-tight">
                          MESA {tableNum}
                        </span>
                        <span className="text-xs px-2.5 py-0.5 rounded-lg bg-surface-muted border border-line text-ink-muted tabular-nums font-bold">
                          #{order.order_number}
                        </span>
                      </div>
                      {order.notes && (
                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 p-2 rounded-xl italic mt-1 font-medium">
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
                          className={`p-3.5 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm ${
                            isReady
                              ? 'bg-emerald-50 border-emerald-300'
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
                                className={`text-xs px-2 py-0.5 rounded-full border font-bold ${statusConf.bg} ${statusConf.color}`}
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
                                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs transition shadow-sm flex items-center justify-center gap-1.5"
                               type="button">
                                <Wine className="w-4 h-4" />
                                <span>Pronto!</span>
                              </button>
                            )}

                            {isReady && (
                              <div className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-1.5">
                                <CheckCheck className="w-4 h-4 text-emerald-700" />
                                <span>No Balcão</span>
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
                      <span>Liberar Todas as Bebidas da Mesa!</span>
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
