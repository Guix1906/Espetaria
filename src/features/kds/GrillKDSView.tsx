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
    <div className="min-h-0 bg-surface text-ink p-3 sm:p-5 space-y-4">
      
      {/* Topo do KDS: Cabeçalho com Ações de Alta Prioridade */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-surface-muted border border-line p-4 sm:p-5 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-brand-700 w-12 h-12 rounded-2xl text-white flex items-center justify-center font-bold shadow-card">
            <Flame className="w-7 h-7 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-bold text-ink font-sans">
                KDS Churrasqueira
              </h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-100 text-brand-800 border border-brand-200 tabular-nums font-bold">
                Fila da Brasa
              </span>
            </div>
            <p className="text-xs text-ink-muted mt-0.5">
              Visualização de alta visibilidade para churrasqueiros • SLA e pontos da carne
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          {/* Botão de Áudio */}
          <button
            onClick={handleToggleAudio}
            className={`p-2.5 rounded-2xl border text-xs font-semibold flex items-center gap-2 transition ${
              audioEnabled
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                : 'bg-surface-muted text-ink-muted border-line hover:bg-surface-muted'
            }`}
            title="Bipes de Novo Pedido e Pedido Pronto"
           type="button" aria-label="Bipes de Novo Pedido e Pedido Pronto">
            {audioEnabled ? <Volume2 className="w-4 h-4 text-emerald-700" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline">{audioEnabled ? 'Som Ativo' : 'Mudo'}</span>
          </button>

          {/* Botão de Esgotamento Imediato */}
          <button
            onClick={() => setIsExhaustModalOpen(true)}
            className="px-4 py-2.5 rounded-2xl bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs transition shadow-sm flex items-center gap-2"
           type="button">
            <AlertCircle className="w-4 h-4" />
            <span>Esgotar Espeto</span>
            {countExhausted > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-ink text-xs tabular-nums">
                {countExhausted}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Resumo Agregado da Grelha */}
      <GrillLiveSummary orderItems={orderItems} />

      {/* Filtros Rápidos da Fila */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setFilter('ALL_ACTIVE')}
          className={`filter-chip ${filter === 'ALL_ACTIVE' ? 'is-active' : ''}`}
         type="button" aria-pressed={filter === 'ALL_ACTIVE'}>
          <Filter className="w-3.5 h-3.5" />
          <span>Fila Ativa ({countActive})</span>
        </button>

        <button
          onClick={() => setFilter('RECEIVED')}
          className={`filter-chip ${filter === 'RECEIVED' ? 'is-active' : ''}`}
         type="button" aria-pressed={filter === 'RECEIVED'}>
          <span>⏳ Aguardando Entrada ({countReceived})</span>
        </button>

        <button
          onClick={() => setFilter('IN_PREPARATION')}
          className={`filter-chip ${filter === 'IN_PREPARATION' ? 'is-active' : ''}`}
         type="button" aria-pressed={filter === 'IN_PREPARATION'}>
          <span>🔥 Na Brasa ({countInPrep})</span>
        </button>

        <button
          onClick={() => setFilter('READY')}
          className={`filter-chip ${filter === 'READY' ? 'is-active' : ''}`}
         type="button" aria-pressed={filter === 'READY'}>
          <span>✅ Prontos ({countReady})</span>
        </button>
      </div>

      {/* Grade de Comandas / Pedidos em Produção */}
      {sortedOrders.length === 0 ? (
        <div className="py-20 text-center rounded-2xl bg-surface-muted border border-line p-8 space-y-3 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-surface-muted text-brand-700 flex items-center justify-center mx-auto border border-line">
            <Sparkles className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-ink">Nenhum pedido nesta fila no momento</h3>
          <p className="text-xs text-ink-muted max-w-sm mx-auto">
            Quando os garçons enviarem novos pedidos de espetos pelo app, os cards aparecerão aqui com alerta sonoro automático.
          </p>
        </div>
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
                  <div className="flex items-center justify-between border-b border-line pb-3.5">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-3xl font-bold text-ink tabular-nums tracking-tight">
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
                          className={`p-3.5 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm ${
                            isInPrep
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
                                className="w-full sm:w-auto px-4 py-2.5 rounded-xl btn-primary text-xs transition shadow-sm flex items-center justify-center gap-1.5"
                               type="button">
                                <Flame className="w-4 h-4 text-ink" />
                                <span>Na Brasa</span>
                              </button>
                            )}

                            {isInPrep && (
                              <button
                                onClick={() => updateOrderItemStatus(item.id, 'READY')}
                                className="w-full sm:w-auto px-4 py-2.5 rounded-xl btn-success text-xs transition shadow-sm flex items-center justify-center gap-1.5"
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
