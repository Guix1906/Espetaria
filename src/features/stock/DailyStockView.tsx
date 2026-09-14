import {
  Ban,
  CheckCircle,
  Clock,
  Flame,
  RotateCcw,
  SlidersHorizontal
} from 'lucide-react';
import React,{ useState } from 'react';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { FilterChip } from '../../components/ui/FilterChip';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchField } from '../../components/ui/SearchField';
import { StatCard } from '../../components/ui/StatCard';
import { useAuthStore } from '../../stores/useAuthStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useStockStore } from '../../stores/useStockStore';
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
    return <div className="page-layout"><PageHeader eyebrow="Controle de produção" title="Estoque diário" description="Acompanhe a disponibilidade dos produtos e a preparação do turno." icon={Flame} /><EmptyState title="Vamos preparar o próximo turno?" description="Informe os espetos, as bebidas e as cubas preparados para começar a acompanhar o estoque." icon={Clock} action={<button type="button" onClick={onOpenShiftClick} className="btn-primary">Abrir turno</button>} /></div>;
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
    <div className="page-layout">
      
      <PageHeader eyebrow="Controle de produção" title="Estoque diário" description={<>Disponibilidade, reposição e contagem física dos produtos.<span className="mt-1 block font-medium text-ink-secondary">{currentShift.name}</span></>} icon={Flame} />
      <div className="stat-grid">
        <StatCard label="Produtos disponíveis" value={dailyPrepStock.filter((stock) => !stock.is_exhausted && stock.current_quantity > 0).length} hint="Liberados para atendimento" icon={CheckCircle} tone="success" />
        <StatCard label="Estoque baixo" value={dailyPrepStock.filter((stock) => !stock.is_exhausted && stock.current_quantity > 0 && stock.current_quantity <= 5).length} hint="Até 5 unidades disponíveis" icon={SlidersHorizontal} tone="warning" />
        <StatCard label="Produtos esgotados" value={dailyPrepStock.filter((stock) => stock.is_exhausted || stock.current_quantity <= 0).length} hint="Bloqueados para novos pedidos" icon={Ban} tone="info" />
      </div>
      <div className="filter-bar" aria-label="Setor do estoque">{(['ALL', 'GRILL', 'KITCHEN', 'BAR'] as const).map((sector) => <FilterChip key={sector} active={selectedSector === sector} onClick={() => setSelectedSector(sector)}>{sector === 'ALL' ? 'Todos os setores' : sector === 'GRILL' ? 'Churrasqueira' : sector === 'KITCHEN' ? 'Cozinha e cubas' : 'Bar'}</FilterChip>)}</div>

      <SearchField value={searchTerm} onChange={setSearchTerm} label="Buscar produto no estoque" placeholder="Buscar espeto, porção ou bebida" />
      {filteredStock.length === 0 && <EmptyState title="Nenhum produto encontrado" description="Tente outro nome ou selecione todos os setores." action={<button type="button" className="btn-secondary" onClick={() => { setSearchTerm(''); setSelectedSector('ALL'); }}>Limpar filtros</button>} />}

      {/* Cards de Itens em Produção Diária */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
              className={`p-5 rounded-2xl border transition flex flex-col justify-between space-y-4 shadow-sm ${
                isExhausted
                  ? 'bg-surface-muted border-red-200 opacity-90'
                  : 'bg-surface-muted border-line hover:border-line'
              }`}
            >
              {/* Topo do Card */}
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-ink text-base leading-tight font-sans">
                      {prod.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-surface-muted border border-line text-ink tabular-nums font-bold">
                        {prod.sector === 'GRILL' ? 'Churrasqueira' : prod.sector === 'KITCHEN' ? 'Cozinha' : prod.sector === 'BAR' ? 'Bar' : 'Outros'}
                      </span>
                      {prod.is_cubas && (
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 tabular-nums font-semibold">
                          {stock.cubas_count} CUBAS ({stock.portions_per_cuba} porções/cuba)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Badge de Disponibilidade */}
                  {isExhausted ? (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-700 flex items-center gap-1 shrink-0 tabular-nums">
                      <Ban className="w-3 h-3" />
                      <span>ESGOTADO</span>
                    </span>
                  ) : (
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center gap-1 shrink-0 tabular-nums">
                      <CheckCircle className="w-3 h-3" />
                      <span>DISPONÍVEL</span>
                    </span>
                  )}
                </div>

                {/* Motivo do esgotamento, se houver */}
                {stock.is_exhausted && stock.exhaust_reason && (
                  <div className="mt-2.5 text-xs text-red-800 bg-red-50 p-2.5 rounded-xl border border-red-200 italic">
                    Motivo: {stock.exhaust_reason}
                  </div>
                )}
              </div>

              {/* Métricas e Barra de Progresso */}
              <div className="space-y-2 py-2 border-y border-line text-xs">
                
                {/* Barra */}
                <div>
                  <div className="flex justify-between text-xs text-ink-muted mb-1">
                    <span>Restante: <strong className={isExhausted ? 'text-red-700 tabular-nums' : 'text-emerald-700 tabular-nums font-bold'}>{stock.current_quantity} un</strong></span>
                    <span className="tabular-nums text-ink-muted">Produção: {stock.initial_quantity} un</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-surface-muted overflow-hidden">
                    <div
                      className={`h-full transition-colors duration-500 rounded-full ${
                        isExhausted
                          ? 'bg-red-700'
                          : percentRemaining > 30
                          ? 'bg-emerald-700'
                          : 'bg-amber-700'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, percentRemaining))}%` }}
                    />
                  </div>
                </div>

                {/* Contadores */}
                <div className="grid grid-cols-3 gap-2 text-center pt-1 tabular-nums text-xs">
                  <div className="p-2 rounded-xl bg-surface-muted border border-line">
                    <div className="text-ink-muted text-xs font-bold">Vendido</div>
                    <div className="font-bold text-ink text-xs">{stock.consumed_quantity}</div>
                  </div>
                  <div className="p-2 rounded-xl bg-surface-muted border border-line">
                    <div className="text-ink-muted text-xs font-bold">Perda / Descarte</div>
                    <div className="font-bold text-red-700 text-xs">{stock.discarded_quantity}</div>
                  </div>
                  <div className="p-2 rounded-xl bg-surface-muted border border-line">
                    <div className="text-ink-muted text-xs font-bold">Ajustes</div>
                    <div className="font-bold text-amber-800 text-xs">{stock.adjusted_quantity}</div>
                  </div>
                </div>
              </div>

              {/* Ações Rápidas: Esgotar / Reativar & Ajustar */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => handleToggleExhaust(stock)}
                  className={`py-2.5 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-sm ${
                    isExhausted
                      ? 'btn-success text-white'
                      : 'bg-red-700 hover:bg-red-800 text-white shadow-sm'
                  }`}
                 type="button">
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
                  className="bg-surface-muted hover:bg-surface-muted text-ink border border-line font-semibold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
                 type="button">
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
        <Dialog label="Ajustar contagem física" onClose={() => setAdjustModalItem(null)}>
          <div className="dialog-panel bg-surface-muted border border-line rounded-2xl w-full max-w-md p-5 sm:p-6 shadow-card space-y-4 zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-base font-bold text-ink flex items-center gap-2 font-sans">
                <SlidersHorizontal className="w-5 h-5 text-amber-800" />
                <span>Contagem Física: {adjustModalItem.product?.name}</span>
              </h3>
            </div>

            <form onSubmit={handleAdjustSubmit} className="space-y-3 text-xs sm:text-sm">
              <div className="p-3.5 rounded-2xl bg-surface-muted border border-line text-ink">
                Saldo atual no sistema: <strong className="text-brand-700 tabular-nums font-bold">{adjustModalItem.current_quantity} unidades</strong>
              </div>

              <div>
                <label className="block text-ink font-semibold mb-1" htmlFor="dailystockview-field-1">
                  Nova Quantidade Física Contada
                </label>
                <input
                  type="number"
                  min="0"
                  value={newCount}
                  onChange={(e) => setNewCount(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-surface-muted border border-line rounded-xl px-3.5 py-2.5 text-ink font-bold tabular-nums text-base focus:outline-none focus:border-brand-600"
                 aria-label="Nova Quantidade Física Contada" id="dailystockview-field-1"/>
              </div>

              <div>
                <label className="block text-ink font-semibold mb-1" htmlFor="dailystockview-field-2">
                  Motivo da Divergência (Obrigatório para Auditoria)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Queimou na brasa / contagem incorreta na abertura"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  required
                  className="w-full bg-surface-muted border border-line rounded-xl px-3.5 py-2.5 text-ink focus:outline-none focus:border-brand-600 text-xs"
                 aria-label="Motivo da Divergência (Obrigatório para Auditoria)" id="dailystockview-field-2"/>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustModalItem(null)}
                  className="bg-surface-muted hover:bg-surface-muted text-ink border border-line py-3 rounded-xl font-bold text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary py-3 rounded-xl font-bold text-xs shadow-sm"
                >
                  Confirmar Ajuste
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}

    </div>
  );
};
