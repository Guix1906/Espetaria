import React, { useState } from 'react';
import { 
  UtensilsCrossed, 
  CheckCheck, 
  Filter, 
  Volume2, 
  VolumeX, 
  Sparkles,
  Layers,
  Soup,
  CheckCircle2,
  AlertOctagon
} from 'lucide-react';
import { useTableStore } from '../../stores/useTableStore';
import { useStockStore } from '../../stores/useStockStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { KDSElapsedTimer } from './KDSElapsedTimer';
import { getOrderItemStatusConfig } from '../../lib/formatters';
import { audioService } from '../../lib/audio';

type KDSFilter = 'ALL_ACTIVE' | 'RECEIVED' | 'IN_PREPARATION' | 'READY';

export const KitchenKDSView: React.FC = () => {
  const { orders, orderItems, tables, updateOrderItemStatus, updateOrderSectorItemsStatus } = useTableStore();
  const { products, dailyPrepStock, toggleExhaustProduct } = useStockStore();
  const { currentShift } = useShiftStore();
  const { currentProfile } = useAuthStore();

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
    <div className="min-h-screen bg-[#090a0f] text-stone-100 p-3 sm:p-5 space-y-4">
      
      {/* Topo do KDS: Cabeçalho com Ações de Alta Prioridade */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#14151f] border border-white/10 p-4 sm:p-5 rounded-3xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-teal-600 to-emerald-500 text-white flex items-center justify-center font-black shadow-lg shadow-teal-500/25">
            <UtensilsCrossed className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-wide uppercase font-brand">
                KDS Cozinha & Guarnições
              </h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-400 border border-teal-500/30 font-mono font-bold">
                Acompanhamentos & Cubas
              </span>
            </div>
            <p className="text-xs text-stone-400 mt-0.5">
              Fila de porções, arrozes, feijão tropeiro e monitoramento de cubas gastronômicas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <button
            onClick={() => setShowCubasMonitor(!showCubasMonitor)}
            className={`px-4 py-2.5 rounded-2xl border text-xs font-bold flex items-center gap-2 transition active:scale-95 ${
              showCubasMonitor
                ? 'bg-teal-500/20 text-teal-300 border-teal-500/40 shadow-sm'
                : 'bg-white/5 text-stone-400 border-white/10 hover:text-white'
            }`}
          >
            <Soup className="w-4 h-4 text-teal-400" />
            <span>{showCubasMonitor ? 'Ocultar Cubas' : 'Monitor de Cubas'}</span>
          </button>

          <button
            onClick={handleToggleAudio}
            className={`p-2.5 rounded-2xl border text-xs font-semibold flex items-center gap-2 transition active:scale-95 ${
              audioEnabled
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                : 'bg-white/5 text-stone-400 border-white/10 hover:bg-white/10'
            }`}
            title="Sons de Alerta"
          >
            {audioEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline">{audioEnabled ? 'Som Ativo' : 'Mudo'}</span>
          </button>
        </div>
      </div>

      {/* MONITOR DE CUBAS GASTRONÔMICAS (GN) */}
      {showCubasMonitor && (
        <div className="bg-[#14151f] border-2 border-teal-500/30 rounded-3xl shadow-xl overflow-hidden p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2.5">
              <Soup className="w-5 h-5 text-teal-400" />
              <h3 className="font-black text-white text-sm uppercase tracking-wider font-brand">
                Monitor em Tempo Real das Cubas Gastronômicas
              </h3>
            </div>
            <span className="text-xs text-stone-400 font-mono">
              Baixa atômica automática por porção
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
                  className={`p-3.5 rounded-2xl border transition flex flex-col justify-between shadow-md ${
                    isExhausted
                      ? 'bg-rose-500/10 border-rose-500/30 text-stone-400'
                      : isLow
                      ? 'bg-amber-500/10 border-amber-500/40'
                      : 'bg-[#090a0f] border-white/10'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-1">
                      <h4 className="font-bold text-xs text-white line-clamp-1">
                        {prod.name}
                      </h4>
                      {isExhausted ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-black uppercase">
                          Zero
                        </span>
                      ) : isLow ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-black uppercase">
                          Baixo
                        </span>
                      ) : null}
                    </div>

                    {/* Barra de Progresso da Cuba */}
                    <div className="mt-2.5 space-y-1">
                      <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            isExhausted
                              ? 'bg-rose-500'
                              : isLow
                              ? 'bg-amber-400'
                              : 'bg-teal-400'
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] font-mono text-stone-400">
                        <span>Resta: <strong className="text-white font-bold">{item.current_quantity}</strong></span>
                        <span>{percent}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Botão de Bloqueio Rápido de Cuba */}
                  <button
                    onClick={() => handleToggleExhaustCuba(item.product_id, item.is_exhausted)}
                    className={`mt-3 w-full py-1.5 px-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition active:scale-95 flex items-center justify-center gap-1 ${
                      isExhausted
                        ? 'bg-teal-600 hover:bg-teal-500 text-white'
                        : 'bg-white/5 hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/40 text-stone-300 hover:text-rose-300'
                    }`}
                  >
                    {isExhausted ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Reativar Cuba</span>
                      </>
                    ) : (
                      <>
                        <AlertOctagon className="w-3 h-3 text-rose-400" />
                        <span>Esgotar Cuba</span>
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
          className={`px-4 py-2 rounded-2xl font-bold transition flex items-center gap-2 whitespace-nowrap active:scale-95 ${
            filter === 'ALL_ACTIVE'
              ? 'bg-gradient-to-r from-teal-500 to-emerald-600 text-white shadow-md shadow-teal-500/25 font-black'
              : 'bg-[#14151f] text-stone-400 border border-white/10 hover:text-white'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          <span>Fila Ativa ({countActive})</span>
        </button>

        <button
          onClick={() => setFilter('RECEIVED')}
          className={`px-4 py-2 rounded-2xl font-bold transition flex items-center gap-2 whitespace-nowrap active:scale-95 ${
            filter === 'RECEIVED'
              ? 'bg-amber-500 text-stone-950 font-black shadow-md shadow-amber-500/25'
              : 'bg-[#14151f] text-stone-400 border border-white/10 hover:text-white'
          }`}
        >
          <span>⏳ Aguardando Preparo ({countReceived})</span>
        </button>

        <button
          onClick={() => setFilter('IN_PREPARATION')}
          className={`px-4 py-2 rounded-2xl font-bold transition flex items-center gap-2 whitespace-nowrap active:scale-95 ${
            filter === 'IN_PREPARATION'
              ? 'bg-teal-500 text-stone-950 font-black shadow-md shadow-teal-500/25'
              : 'bg-[#14151f] text-stone-400 border border-white/10 hover:text-white'
          }`}
        >
          <span>🍳 Em Preparo ({countInPrep})</span>
        </button>

        <button
          onClick={() => setFilter('READY')}
          className={`px-4 py-2 rounded-2xl font-bold transition flex items-center gap-2 whitespace-nowrap active:scale-95 ${
            filter === 'READY'
              ? 'bg-emerald-600 text-white font-black shadow-md shadow-emerald-950/50'
              : 'bg-[#14151f] text-stone-400 border border-white/10 hover:text-white'
          }`}
        >
          <span>✅ Prontos ({countReady})</span>
        </button>
      </div>

      {/* Grade de Pedidos da Cozinha */}
      {sortedOrders.length === 0 ? (
        <div className="py-20 text-center rounded-3xl bg-[#14151f] border border-white/10 p-8 space-y-3 shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-white/5 text-teal-400 flex items-center justify-center mx-auto border border-white/10">
            <Sparkles className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-black text-white">Nenhuma porção ou acompanhamento pendente</h3>
          <p className="text-xs text-stone-400 max-w-sm mx-auto">
            Quando os garçons solicitarem mandioca, arroz, vinagrete ou feijão tropeiro, aparecerão imediatamente nesta tela.
          </p>
        </div>
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
                className="bg-[#14151f] border-2 border-white/10 rounded-3xl p-4 sm:p-5 shadow-2xl flex flex-col justify-between space-y-4 hover:border-teal-500/50 transition"
              >
                <div>
                  <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-3xl font-black text-white font-mono tracking-tight">
                          MESA {tableNum}
                        </span>
                        <span className="text-xs px-2.5 py-0.5 rounded-xl bg-white/10 text-stone-300 font-mono font-bold">
                          #{order.order_number}
                        </span>
                      </div>
                      {order.notes && (
                        <p className="text-xs text-amber-300/90 italic mt-1 font-semibold">
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
                          className={`p-3.5 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md ${
                            isInPrep
                              ? 'bg-teal-500/10 border-teal-500/40 shadow-teal-950/30'
                              : isReady
                              ? 'bg-emerald-500/10 border-emerald-500/40'
                              : 'bg-[#090a0f] border-white/10'
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

                            <div className="mt-1.5 flex items-center gap-2">
                              <span
                                className={`text-[10px] px-2.5 py-0.5 rounded-full border font-bold ${statusConf.bg} ${statusConf.color}`}
                              >
                                {statusConf.label}
                              </span>
                              {item.prepared_at && (
                                <span className="text-[10px] text-stone-500 font-mono">
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
                                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-stone-950 font-black text-xs uppercase tracking-wider transition active:scale-95 shadow-md shadow-teal-500/20 flex items-center justify-center gap-1.5"
                              >
                                <UtensilsCrossed className="w-4 h-4" />
                                <span>Preparar</span>
                              </button>
                            )}

                            {isInPrep && (
                              <button
                                onClick={() => updateOrderItemStatus(item.id, 'READY')}
                                className="w-full sm:w-auto px-4 py-2.5 rounded-xl btn-emerald text-xs uppercase tracking-wider transition active:scale-95 shadow-md shadow-emerald-500/20 flex items-center justify-center gap-1.5"
                              >
                                <CheckCheck className="w-4 h-4" />
                                <span>Pronto!</span>
                              </button>
                            )}

                            {isReady && (
                              <div className="px-3 py-2 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5">
                                <CheckCheck className="w-4 h-4 text-emerald-400" />
                                <span>Aguardando Garçom</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Ações em Lote */}
                <div className="border-t border-white/10 pt-3.5 flex items-center gap-2">
                  {hasReceived && (
                    <button
                      onClick={() => updateOrderSectorItemsStatus(order.id, 'KITCHEN', 'IN_PREPARATION')}
                      className="flex-1 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-teal-300 font-bold text-xs uppercase tracking-wider transition active:scale-95 border border-white/10 flex items-center justify-center gap-1.5"
                    >
                      <Layers className="w-4 h-4" />
                      <span>Preparar Todos</span>
                    </button>
                  )}

                  {hasInPrep && (
                    <button
                      onClick={() => updateOrderSectorItemsStatus(order.id, 'KITCHEN', 'READY')}
                      className="flex-1 py-3 rounded-2xl btn-emerald text-xs uppercase tracking-wider transition active:scale-95 shadow-md shadow-emerald-950/40 flex items-center justify-center gap-1.5"
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

    </div>
  );
};
