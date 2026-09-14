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
      <div className="max-w-xl mx-auto my-12 p-8 bg-slate-900 border border-slate-800 rounded-3xl text-center space-y-4 shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-amber-600/20 border border-amber-600/30 text-amber-400 flex items-center justify-center mx-auto">
          <Clock className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white">Nenhum Turno Aberto no Momento</h2>
        <p className="text-sm text-slate-400">
          Para acompanhar o estoque diário e a produção da noite, abra o turno informando os espetos e cubas preparados.
        </p>
        <button
          onClick={onOpenShiftClick}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-sm transition shadow-lg shadow-rose-950/60 active:scale-95"
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <Flame className="w-5 h-5 text-rose-500" />
            <span>Estoque Operacional da Noite (Mise en Place)</span>
          </h2>
          <p className="text-xs text-slate-400">
            Turno: <strong className="text-white">{currentShift.name}</strong> • Bloqueio instantâneo para churrasqueira e cozinha
          </p>
        </div>

        {/* Filtros por Setor */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {(['ALL', 'GRILL', 'KITCHEN', 'BAR'] as const).map((sector) => {
            const label = 
              sector === 'ALL' ? 'Todos' :
              sector === 'GRILL' ? 'Churrasqueira' :
              sector === 'KITCHEN' ? 'Cozinha (Cubas)' : 'Bar';
            const isActive = selectedSector === sector;

            return (
              <button
                key={sector}
                onClick={() => setSelectedSector(sector)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition whitespace-nowrap active:scale-95 ${
                  isActive
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-950/50'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
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
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Buscar espeto ou acompanhamento..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
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
              className={`p-4 rounded-2xl border transition flex flex-col justify-between space-y-3 ${
                isExhausted
                  ? 'bg-slate-900/60 border-rose-900/50 opacity-85'
                  : 'bg-slate-900/95 border-slate-800 hover:border-slate-700 shadow-lg shadow-black/20'
              }`}
            >
              {/* Topo do Card */}
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-white text-base leading-tight">
                      {prod.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                        {prod.sector}
                      </span>
                      {prod.is_cubas && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800 font-mono">
                          {stock.cubas_count} CUBAS ({stock.portions_per_cuba} porções/cuba)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Badge de Disponibilidade */}
                  {isExhausted ? (
                    <span className="text-[10px] uppercase font-black px-2.5 py-1 rounded-lg bg-rose-950 border border-rose-700 text-rose-400 flex items-center gap-1 shrink-0 animate-pulse">
                      <Ban className="w-3 h-3" />
                      <span>ESGOTADO</span>
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-lg bg-emerald-950 border border-emerald-800 text-emerald-300 flex items-center gap-1 shrink-0">
                      <CheckCircle className="w-3 h-3" />
                      <span>DISPONÍVEL</span>
                    </span>
                  )}
                </div>

                {/* Motivo do esgotamento, se houver */}
                {stock.is_exhausted && stock.exhaust_reason && (
                  <div className="mt-2 text-xs text-rose-300 bg-rose-950/40 p-2 rounded-lg border border-rose-900/40 italic">
                    Motivo: {stock.exhaust_reason}
                  </div>
                )}
              </div>

              {/* Métricas e Barra de Progresso */}
              <div className="space-y-2 py-2 border-y border-slate-800/80 text-xs">
                
                {/* Barra */}
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>Restante: <strong className={isExhausted ? 'text-rose-400' : 'text-emerald-400'}>{stock.current_quantity} un</strong></span>
                    <span>Produção: {stock.initial_quantity} un</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        isExhausted
                          ? 'bg-rose-600'
                          : percentRemaining > 30
                          ? 'bg-emerald-500'
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, percentRemaining))}%` }}
                    />
                  </div>
                </div>

                {/* Contadores */}
                <div className="grid grid-cols-3 gap-2 text-center pt-1 font-mono text-[11px]">
                  <div className="p-1.5 rounded-lg bg-slate-800/50">
                    <div className="text-slate-400 text-[9px] uppercase">Vendido</div>
                    <div className="font-bold text-white">{stock.consumed_quantity}</div>
                  </div>
                  <div className="p-1.5 rounded-lg bg-slate-800/50">
                    <div className="text-slate-400 text-[9px] uppercase">Perda / Descarte</div>
                    <div className="font-bold text-rose-400">{stock.discarded_quantity}</div>
                  </div>
                  <div className="p-1.5 rounded-lg bg-slate-800/50">
                    <div className="text-slate-400 text-[9px] uppercase">Ajustes</div>
                    <div className="font-bold text-amber-400">{stock.adjusted_quantity}</div>
                  </div>
                </div>
              </div>

              {/* Ações Rápidas: Esgotar / Reativar & Ajustar */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => handleToggleExhaust(stock)}
                  className={`py-2 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 active:scale-95 shadow-md ${
                    isExhausted
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40'
                      : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/40'
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
                  className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white font-semibold text-xs transition flex items-center justify-center gap-1.5 active:scale-95"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-amber-400" />
                <span>Contagem Física: {adjustModalItem.product?.name}</span>
              </h3>
            </div>

            <form onSubmit={handleAdjustSubmit} className="space-y-3 text-xs sm:text-sm">
              <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700 text-slate-300">
                Saldo atual no sistema: <strong className="text-white font-mono">{adjustModalItem.current_quantity} unidades</strong>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Nova Quantidade Física Contada
                </label>
                <input
                  type="number"
                  min="0"
                  value={newCount}
                  onChange={(e) => setNewCount(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold font-mono text-base focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Motivo da Divergência (Obrigatório para Auditoria)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Queimou na brasa / contagem incorreta na abertura"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustModalItem(null)}
                  className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold shadow-lg shadow-amber-950/50"
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
