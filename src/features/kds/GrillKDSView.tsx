import React, { useState } from 'react';
import { 
  Flame, 
  CheckCheck, 
  AlertCircle, 
  Filter, 
  Volume2, 
  VolumeX, 
  Sparkles,
  Layers
} from 'lucide-react';
import { useTableStore } from '../../stores/useTableStore';
import { useStockStore } from '../../stores/useStockStore';
import { KDSElapsedTimer } from './KDSElapsedTimer';
import { GrillLiveSummary } from './GrillLiveSummary';
import { GrillExhaustModal } from './GrillExhaustModal';
import { formatDoneness, getOrderItemStatusConfig } from '../../lib/formatters';
import { audioService } from '../../lib/audio';

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
    <div className="min-h-screen bg-slate-950 text-slate-100 p-3 sm:p-5 space-y-4">
      
      {/* Topo do KDS: Cabeçalho com Ações de Alta Prioridade */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-600 text-slate-950 flex items-center justify-center font-black shadow-lg shadow-amber-950/60">
            <Flame className="w-7 h-7 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-wide uppercase">
                KDS Churrasqueira
              </h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 font-mono font-bold">
                Fila da Brasa
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Visualização de alta visibilidade para churrasqueiros • SLA e pontos da carne
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          {/* Botão de Áudio */}
          <button
            onClick={handleToggleAudio}
            className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 ${
              audioEnabled
                ? 'bg-emerald-950 text-emerald-300 border-emerald-700 hover:bg-emerald-900'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
            }`}
            title="Bipes de Novo Pedido e Pedido Pronto"
          >
            {audioEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline">{audioEnabled ? 'Som Ativo' : 'Mudo'}</span>
          </button>

          {/* Botão de Esgotamento Imediato */}
          <button
            onClick={() => setIsExhaustModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider transition active:scale-95 shadow-lg shadow-rose-950/60 flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4" />
            <span>Esgotar Espeto</span>
            {countExhausted > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-mono">
                {countExhausted}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Resumo Agregado da Grelha (Quantidades consolidadas de carnes e pontos) */}
      <GrillLiveSummary orderItems={orderItems} />

      {/* Filtros Rápidos da Fila */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setFilter('ALL_ACTIVE')}
          className={`px-3.5 py-2 rounded-xl font-bold transition flex items-center gap-1.5 whitespace-nowrap active:scale-95 ${
            filter === 'ALL_ACTIVE'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-950/50'
              : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          <span>Fila Ativa ({countActive})</span>
        </button>

        <button
          onClick={() => setFilter('RECEIVED')}
          className={`px-3.5 py-2 rounded-xl font-bold transition flex items-center gap-1.5 whitespace-nowrap active:scale-95 ${
            filter === 'RECEIVED'
              ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-950/50'
              : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
          }`}
        >
          <span>⏳ Aguardando Entrada ({countReceived})</span>
        </button>

        <button
          onClick={() => setFilter('IN_PREPARATION')}
          className={`px-3.5 py-2 rounded-xl font-bold transition flex items-center gap-1.5 whitespace-nowrap active:scale-95 ${
            filter === 'IN_PREPARATION'
              ? 'bg-rose-600 text-white font-black shadow-md shadow-rose-950/50'
              : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
          }`}
        >
          <span>🔥 Na Brasa ({countInPrep})</span>
        </button>

        <button
          onClick={() => setFilter('READY')}
          className={`px-3.5 py-2 rounded-xl font-bold transition flex items-center gap-1.5 whitespace-nowrap active:scale-95 ${
            filter === 'READY'
              ? 'bg-emerald-600 text-white font-black shadow-md shadow-emerald-950/50'
              : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
          }`}
        >
          <span>✅ Prontos ({countReady})</span>
        </button>
      </div>

      {/* Grade de Comandas / Pedidos em Produção */}
      {sortedOrders.length === 0 ? (
        <div className="py-20 text-center rounded-3xl bg-slate-900/60 border border-slate-800/80 p-8 space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-800/80 text-amber-500 flex items-center justify-center mx-auto">
            <Sparkles className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white">Nenhum pedido nesta fila no momento</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Quando os garçons enviarem novos pedidos de espetos pelo app, os cards aparecerão aqui com alerta sonoro automático.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sortedOrders.map((order) => {
            const table = tables.find((t) => t.id === order.table_id);
            const tableNum = table ? String(table.number).padStart(2, '0') : '??';

            // Itens de churrasqueira deste pedido específico
            const itemsInThisOrder = filteredItems.filter((i) => i.order_id === order.id);
            const allOrderGrillItems = grillItems.filter((i) => i.order_id === order.id);

            const hasReceived = allOrderGrillItems.some((i) => i.status === 'RECEIVED');
            const hasInPrep = allOrderGrillItems.some((i) => i.status === 'IN_PREPARATION');

            return (
              <div
                key={order.id}
                className="bg-slate-900 border-2 border-slate-700/80 rounded-3xl p-4 sm:p-5 shadow-2xl flex flex-col justify-between space-y-4 hover:border-amber-500/60 transition"
              >
                {/* Cabeçalho do Card */}
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
                          className={`p-3 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                            isInPrep
                              ? 'bg-amber-950/30 border-amber-500/70 shadow-md shadow-amber-950/40'
                              : isReady
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
                              {item.doneness && (
                                <span className="text-xs px-2 py-0.5 rounded-md bg-rose-950 text-rose-300 border border-rose-700 font-mono font-extrabold uppercase">
                                  {formatDoneness(item.doneness)}
                                </span>
                              )}
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

                          {/* Botão de Ação 1-Tap no Item */}
                          <div className="shrink-0 flex items-center gap-2">
                            {isReceived && (
                              <button
                                onClick={() => updateOrderItemStatus(item.id, 'IN_PREPARATION')}
                                className="w-full sm:w-auto px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider transition active:scale-95 shadow-md shadow-amber-950/50 flex items-center justify-center gap-1.5"
                              >
                                <Flame className="w-4 h-4" />
                                <span>Na Brasa</span>
                              </button>
                            )}

                            {isInPrep && (
                              <button
                                onClick={() => updateOrderItemStatus(item.id, 'READY')}
                                className="w-full sm:w-auto px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider transition active:scale-95 shadow-md shadow-emerald-950/50 flex items-center justify-center gap-1.5"
                              >
                                <CheckCheck className="w-4 h-4" />
                                <span>Pronto!</span>
                              </button>
                            )}

                            {isReady && (
                              <div className="px-3 py-2 rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-700 text-xs font-bold flex items-center gap-1.5">
                                <CheckCheck className="w-4 h-4" />
                                <span>Aguardando Garçom</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Ações em Lote do Pedido (Rapidez Máxima) */}
                <div className="border-t border-slate-800 pt-3 flex items-center gap-2">
                  {hasReceived && (
                    <button
                      onClick={() => updateOrderSectorItemsStatus(order.id, 'GRILL', 'IN_PREPARATION')}
                      className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs uppercase tracking-wider transition active:scale-95 border border-slate-700 flex items-center justify-center gap-1.5"
                    >
                      <Layers className="w-4 h-4" />
                      <span>Todos na Brasa</span>
                    </button>
                  )}

                  {hasInPrep && (
                    <button
                      onClick={() => updateOrderSectorItemsStatus(order.id, 'GRILL', 'READY')}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider transition active:scale-95 shadow-md shadow-emerald-950/50 flex items-center justify-center gap-1.5"
                    >
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
