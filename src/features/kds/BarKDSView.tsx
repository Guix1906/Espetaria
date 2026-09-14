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
    <div className="min-h-screen bg-slate-950 text-slate-100 p-3 sm:p-5 space-y-4">
      
      {/* Topo do Bar KDS */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-sky-600 text-slate-950 flex items-center justify-center font-black shadow-lg shadow-sky-950/60">
            <Beer className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-wide uppercase">
                KDS Bar & Bebidas Geladas
              </h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/40 font-mono font-bold">
                Expedição Rápida
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Cervejas, caipirinhas, refrigerantes e sucos • SLA crítico &lt; 3 minutos
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <button
            onClick={handleToggleAudio}
            className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 ${
              audioEnabled
                ? 'bg-emerald-950 text-emerald-300 border-emerald-700 hover:bg-emerald-900'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
            }`}
            title="Sons de Alerta"
          >
            {audioEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline">{audioEnabled ? 'Som Ativo' : 'Mudo'}</span>
          </button>
        </div>
      </div>

      {/* Filtros da Fila do Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setFilter('ALL_ACTIVE')}
          className={`px-3.5 py-2 rounded-xl font-bold transition flex items-center gap-1.5 whitespace-nowrap active:scale-95 ${
            filter === 'ALL_ACTIVE'
              ? 'bg-sky-600 text-white shadow-md shadow-sky-950/50'
              : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          <span>Fila Ativa ({countReceived})</span>
        </button>

        <button
          onClick={() => setFilter('RECEIVED')}
          className={`px-3.5 py-2 rounded-xl font-bold transition flex items-center gap-1.5 whitespace-nowrap active:scale-95 ${
            filter === 'RECEIVED'
              ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-950/50'
              : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
          }`}
        >
          <span>⏳ Aguardando Encher / Tirar ({countReceived})</span>
        </button>

        <button
          onClick={() => setFilter('READY')}
          className={`px-3.5 py-2 rounded-xl font-bold transition flex items-center gap-1.5 whitespace-nowrap active:scale-95 ${
            filter === 'READY'
              ? 'bg-emerald-600 text-white font-black shadow-md shadow-emerald-950/50'
              : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
          }`}
        >
          <span>✅ Prontos no Balcão ({countReady})</span>
        </button>
      </div>

      {/* Grade de Pedidos do Bar */}
      {sortedOrders.length === 0 ? (
        <div className="py-20 text-center rounded-3xl bg-slate-900/60 border border-slate-800/80 p-8 space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-800/80 text-sky-400 flex items-center justify-center mx-auto">
            <Sparkles className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white">Nenhuma bebida pendente no balcão</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Bebidas pedidas pelos garçons cairão instantaneamente aqui para preparo e saída rápida.
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
                className="bg-slate-900 border-2 border-slate-700/80 rounded-3xl p-4 sm:p-5 shadow-2xl flex flex-col justify-between space-y-4 hover:border-sky-500/60 transition"
              >
                <div>
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-3xl font-black text-white font-mono tracking-tight">
                          MESA {tableNum}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 font-mono font-bold">
                          #{order.order_number}
                        </span>
                      </div>
                      {order.notes && (
                        <p className="text-xs text-amber-400/90 italic mt-1 font-semibold">
                          Obs: {order.notes}
                        </p>
                      )}
                    </div>

                    <KDSElapsedTimer createdAt={order.created_at} warningMinutes={5} urgentMinutes={10} />
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
                          className={`p-3 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                            isReady
                              ? 'bg-emerald-950/40 border-emerald-600/70'
                              : 'bg-slate-800/70 border-slate-700/80'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-lg font-black text-white font-mono">
                                {item.quantity}x
                              </span>
                              <span className="font-bold text-white text-base">
                                {item.product_name}
                              </span>
                            </div>

                            {item.notes && (
                              <p className="text-xs text-amber-300/90 italic mt-0.5">
                                Obs: {item.notes}
                              </p>
                            )}

                            <div className="mt-1 flex items-center gap-2">
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${statusConf.bg} ${statusConf.color}`}
                              >
                                {statusConf.label}
                              </span>
                              {item.prepared_at && (
                                <span className="text-[10px] text-slate-500 font-mono">
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
                                className="w-full sm:w-auto px-4 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs uppercase tracking-wider transition active:scale-95 shadow-md shadow-sky-950/50 flex items-center justify-center gap-1.5"
                              >
                                <Wine className="w-4 h-4" />
                                <span>Pronto!</span>
                              </button>
                            )}

                            {isReady && (
                              <div className="px-3 py-2 rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-700 text-xs font-bold flex items-center gap-1.5">
                                <CheckCheck className="w-4 h-4" />
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
                  <div className="border-t border-slate-800 pt-3">
                    <button
                      onClick={() => updateOrderSectorItemsStatus(order.id, 'BAR', 'READY')}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider transition active:scale-95 shadow-md shadow-emerald-950/50 flex items-center justify-center gap-1.5"
                    >
                      <Layers className="w-4 h-4" />
                      <span>Todas Bebidas Prontas!</span>
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
