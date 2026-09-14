import React, { useState } from 'react';
import { 
  Flame, 
  CheckCircle, 
  Ban, 
  RotateCcw, 
  SlidersHorizontal, 
  Search,
  Clock,
} from 'lucide-react';
import { useStockStore } from '../../stores/useStockStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { DailyPrepStock } from '../../types/domain';

interface DailyStockViewProps {
  onOpenShiftClick: () => void;
}

export const DailyStockView: React.FC<DailyStockViewProps> = ({ onOpenShiftClick }) => {
  const { dailyPrepStock, toggleExhaustProduct, adjustStockPhysicalCount } = useStockStore();
  const { currentShift } = useShiftStore();
  const { currentProfile } = useAuthStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSector, setSelectedSector] = useState<'ALL' | 'GRILL' | 'KITCHEN' | 'BAR'>('ALL');

  // Modal de ajuste de contagem
  const [adjustModalItem, setAdjustModalItem] = useState<DailyPrepStock | null>(null);
  const [newCount, setNewCount] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState<string>('');

  if (!currentShift || currentShift.status !== 'ABERTO') {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 card-carbon border border-carbon-800 rounded-3xl text-center space-y-4 shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-ember-600/20 to-gold-600/20 border border-ember-600/40 text-gold-400 flex items-center justify-center mx-auto shadow-lg shadow-ember-950/40">
          <Clock className="w-8 h-8 animate-pulse" />
        </div>
        <h2 className="text-xl font-bold text-white font-serif">Nenhum Turno Aberto no Momento</h2>
        <p className="text-sm text-obsidian-400">
          Para acompanhar o estoque diário e a produção da noite, abra o turno informando os espetos e cubas preparados.
        </p>
        <button
          onClick={onOpenShiftClick}
          className="btn-ember px-8 py-3.5 rounded-2xl text-obsidian-950 font-black text-sm uppercase tracking-wider shadow-xl shadow-ember-950/60"
        >
          Iniciar Abertura da Noite
        </button>
      </div>
    );
  }

  const handleToggleExhaust = (stock: DailyPrepStock) => {
    const isExhausting = !stock.is_exhausted;
    let reason: string | undefined = undefined;

    if (isExhausting) {
      const input = prompt(
        `Confirma esgotar "${stock.product?.name}"? Ele será bloqueado imediatamente nos celulares dos garçons e no delivery.\n\nMotivo (opcional):`,
        'Acabou a produção na grelha'
      );
      if (input === null) return; // cancelou o prompt
      reason = input || 'Esgotado pelo operador';
    }

    toggleExhaustProduct(
      currentShift.id,
      stock.product_id,
      isExhausting,
      currentProfile.id,
      reason
    );
  };

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustModalItem) return;

    try {
      adjustStockPhysicalCount(
        currentShift.id,
        adjustModalItem.product_id,
        newCount,
        currentProfile.id,
        adjustReason || 'Divergência na contagem física da churrasqueira/cozinha'
      );
      setAdjustModalItem(null);
      setAdjustReason('');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao ajustar estoque.');
    }
  };

  const filteredStock = dailyPrepStock.filter((s) => {
    const prod = s.product;
    if (!prod) return false;
    const matchesSearch = prod.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSector = selectedSector === 'ALL' || prod.sector === selectedSector;
    return matchesSearch && matchesSector;
  });

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-5">
      
      {/* Cabeçalho da Visão de Estoque */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-carbon-900 p-5 rounded-3xl border border-carbon-800 shadow-2xl">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-ember-600 to-gold-600 text-obsidian-950 flex items-center justify-center font-black shadow-lg shadow-ember-950/60">
            <Flame className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-base sm:text-xl font-bold text-white tracking-tight flex items-center gap-2 font-serif">
              <span>Estoque Operacional da Noite (Mise en Place)</span>
            </h2>
            <p className="text-xs text-obsidian-400 mt-0.5">
              Turno: <strong className="text-gold-400 font-mono">{currentShift.name}</strong> • Bloqueio instantâneo para churrasqueira e cozinha
            </p>
          </div>
        </div>

        {/* Filtros por Setor */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {(['ALL', 'GRILL', 'KITCHEN', 'BAR'] as const).map((sector) => {
            const label = 
              sector === 'ALL' ? 'Todos os Setores' :
              sector === 'GRILL' ? 'Churrasqueira' :
              sector === 'KITCHEN' ? 'Cozinha (Cubas)' : 'Bar';
            const isActive = selectedSector === sector;

            return (
              <button
                key={sector}
                onClick={() => setSelectedSector(sector)}
                className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition whitespace-nowrap active:scale-95 ${
                  isActive
                    ? 'btn-ember text-obsidian-950 shadow-md'
                    : 'bg-carbon-800 text-obsidian-400 hover:text-white border border-carbon-700'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Barra de Busca Rápida */}
      <div className="relative">
        <Search className="w-4 h-4 text-obsidian-400 absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Buscar espeto, porção ou acompanhamento..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-carbon-900 border border-carbon-800 rounded-2xl pl-11 pr-4 py-3 text-xs sm:text-sm text-white placeholder-obsidian-500 focus:outline-none focus:border-ember-500 shadow-inner"
        />
      </div>

      {/* Cards de Itens em Produção Diária */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredStock.map((stock) => {
          const prod = stock.product;
          if (!prod) return null;

          const percentRemaining = stock.initial_quantity > 0 
            ? Math.round((stock.current_quantity / stock.initial_quantity) * 100) 
            : 0;

          const isExhausted = stock.is_exhausted || stock.current_quantity <= 0;

          return (
            <div
              key={stock.id}
              className={`p-5 rounded-3xl border transition flex flex-col justify-between space-y-4 shadow-xl ${
                isExhausted
                  ? 'bg-carbon-900/60 border-ruby-900/40 opacity-85'
                  : 'bg-carbon-900 border-carbon-800 hover:border-carbon-700'
              }`}
            >
              {/* Topo do Card */}
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-white text-base leading-tight font-serif">
                      {prod.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-carbon-800 border border-carbon-700 text-obsidian-300 font-mono font-bold">
                        {prod.sector}
                      </span>
                      {prod.is_cubas && (
                        <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-gold-950/70 text-gold-300 border border-gold-800/60 font-mono font-semibold">
                          {stock.cubas_count} CUBAS ({stock.portions_per_cuba} porções/cuba)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Badge de Disponibilidade */}
                  {isExhausted ? (
                    <span className="text-[10px] uppercase font-black px-2.5 py-1 rounded-full bg-ruby-950/80 border border-ruby-600 text-ruby-300 flex items-center gap-1 shrink-0 animate-pulse font-mono tracking-wider">
                      <Ban className="w-3 h-3" />
                      <span>ESGOTADO</span>
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-700 text-emerald-300 flex items-center gap-1 shrink-0 font-mono">
                      <CheckCircle className="w-3 h-3" />
                      <span>DISPONÍVEL</span>
                    </span>
                  )}
                </div>

                {/* Motivo do esgotamento, se houver */}
                {stock.is_exhausted && stock.exhaust_reason && (
                  <div className="mt-2.5 text-xs text-ruby-300 bg-ruby-950/40 p-2.5 rounded-xl border border-ruby-900/50 italic">
                    Motivo: {stock.exhaust_reason}
                  </div>
                )}
              </div>

              {/* Métricas e Barra de Progresso */}
              <div className="space-y-2 py-2 border-y border-carbon-800 text-xs">
                
                {/* Barra */}
                <div>
                  <div className="flex justify-between text-[11px] text-obsidian-400 mb-1">
                    <span>Restante: <strong className={isExhausted ? 'text-ruby-400 font-mono' : 'text-emerald-400 font-mono font-bold'}>{stock.current_quantity} un</strong></span>
                    <span className="font-mono">Produção: {stock.initial_quantity} un</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-carbon-800 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 rounded-full ${
                        isExhausted
                          ? 'bg-ruby-600'
                          : percentRemaining > 30
                          ? 'bg-gradient-to-r from-emerald-600 to-teal-500'
                          : 'bg-gradient-to-r from-gold-600 to-ember-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, percentRemaining))}%` }}
                    />
                  </div>
                </div>

                {/* Contadores */}
                <div className="grid grid-cols-3 gap-2 text-center pt-1 font-mono text-[11px]">
                  <div className="p-2 rounded-xl bg-carbon-800/60 border border-carbon-700/50">
                    <div className="text-obsidian-500 text-[9px] uppercase font-bold">Vendido</div>
                    <div className="font-bold text-white text-xs">{stock.consumed_quantity}</div>
                  </div>
                  <div className="p-2 rounded-xl bg-carbon-800/60 border border-carbon-700/50">
                    <div className="text-obsidian-500 text-[9px] uppercase font-bold">Perda / Descarte</div>
                    <div className="font-bold text-ruby-400 text-xs">{stock.discarded_quantity}</div>
                  </div>
                  <div className="p-2 rounded-xl bg-carbon-800/60 border border-carbon-700/50">
                    <div className="text-obsidian-500 text-[9px] uppercase font-bold">Ajustes</div>
                    <div className="font-bold text-gold-400 text-xs">{stock.adjusted_quantity}</div>
                  </div>
                </div>
              </div>

              {/* Ações Rápidas: Esgotar / Reativar & Ajustar */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => handleToggleExhaust(stock)}
                  className={`py-2.5 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 active:scale-95 shadow-md ${
                    isExhausted
                      ? 'btn-emerald text-white'
                      : 'bg-ruby-600 hover:bg-ruby-500 text-white shadow-ruby-950/40'
                  }`}
                >
                  {isExhausted ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reativar</span>
                    </>
                  ) : (
                    <>
                      <Ban className="w-3.5 h-3.5" />
                      <span>Esgotar</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    setAdjustModalItem(stock);
                    setNewCount(stock.current_quantity);
                  }}
                  className="btn-carbon py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Contagem</span>
                </button>
              </div>

            </div>
          );
        })}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* MODAL: AJUSTE DE CONTAGEM FÍSICA */}
      {/* ------------------------------------------------------------------ */}
      {adjustModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="card-carbon border border-carbon-700 rounded-3xl w-full max-w-md p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-carbon-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2 font-serif">
                <SlidersHorizontal className="w-5 h-5 text-gold-400" />
                <span>Contagem Física: {adjustModalItem.product?.name}</span>
              </h3>
            </div>

            <form onSubmit={handleAdjustSubmit} className="space-y-3 text-xs sm:text-sm">
              <div className="p-3.5 rounded-2xl bg-obsidian-900/80 border border-carbon-800 text-obsidian-300">
                Saldo atual no sistema: <strong className="text-gold-400 font-mono font-bold">{adjustModalItem.current_quantity} unidades</strong>
              </div>

              <div>
                <label className="block text-obsidian-300 font-semibold mb-1">
                  Nova Quantidade Física Contada
                </label>
                <input
                  type="number"
                  min="0"
                  value={newCount}
                  onChange={(e) => setNewCount(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-obsidian-900 border border-carbon-700 rounded-xl px-3.5 py-2.5 text-white font-bold font-mono text-base focus:outline-none focus:border-gold-500"
                />
              </div>

              <div>
                <label className="block text-obsidian-300 font-semibold mb-1">
                  Motivo da Divergência (Obrigatório para Auditoria)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Queimou na brasa / contagem incorreta na abertura"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  required
                  className="w-full bg-obsidian-900 border border-carbon-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-gold-500 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustModalItem(null)}
                  className="btn-carbon py-3 rounded-xl font-bold text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-gold py-3 rounded-xl font-bold text-xs shadow-lg shadow-gold-950/50"
                >
                  Confirmar Ajuste
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
