import { Ban, CheckCircle, Clock, Flame, RotateCcw, SlidersHorizontal } from 'lucide-react';
import React, { useState } from 'react';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { FilterChip } from '../../components/ui/FilterChip';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchField } from '../../components/ui/SearchField';
import { StatCard } from '../../components/ui/StatCard';
import { StatusTag } from '../../components/ui/StatusTag';
import { useAuthStore } from '../../stores/useAuthStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useStockStore } from '../../stores/useStockStore';
import { DailyPrepStock, Product } from '../../types/domain';

interface DailyStockViewProps {
  onOpenShiftClick: () => void;
}

const DEFAULT_LOW_STOCK = 5;
/** Limite de estoque baixo do produto (cadastro) ou o padrão de 5. */
export const lowStockLimit = (product?: Pick<Product, 'low_stock_threshold'> | null) => product?.low_stock_threshold ?? DEFAULT_LOW_STOCK;
const SECTOR_LABEL: Record<string, string> = { GRILL: 'Churrasqueira', KITCHEN: 'Cozinha', BAR: 'Bar' };

export const DailyStockView: React.FC<DailyStockViewProps> = ({ onOpenShiftClick }) => {
  const { requestText, notify } = useFeedback();
  const { dailyPrepStock, toggleExhaustProduct, adjustStockPhysicalCount } = useStockStore();
  const { currentShift } = useShiftStore();
  const { currentProfile } = useAuthStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSector, setSelectedSector] = useState<'ALL' | 'GRILL' | 'KITCHEN' | 'BAR'>('ALL');
  const [adjustModalItem, setAdjustModalItem] = useState<DailyPrepStock | null>(null);
  const [newCount, setNewCount] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState<string>('');

  if (!currentShift || currentShift.status !== 'ABERTO') {
    return <div className="page-layout"><PageHeader eyebrow="Controle de produção" title="Estoque diário" description="Acompanhe a disponibilidade dos produtos e a preparação do turno." icon={Flame} /><EmptyState title="Turno fechado" description="Informe os espetos, as bebidas e as cubas preparados para começar a acompanhar o estoque." icon={Clock} action={<button type="button" onClick={onOpenShiftClick} className="btn-primary">Abrir turno</button>} /></div>;
  }

  const handleToggleExhaust = async (stock: DailyPrepStock) => {
    try {
      const isExhausting = !stock.is_exhausted;
      let reason: string | undefined;
      if (isExhausting) {
        const input = await requestText({ title: 'Esgotar produto', label: 'Motivo', confirmText: 'Esgotar produto', danger: true, required: false, message: `Esgotar "${stock.product?.name}"? Ele some na hora dos celulares dos garçons e do delivery.`, initialValue: 'Acabou a produção na grelha' });
        if (input === null) return;
        reason = input || 'Esgotado pelo operador';
      }
      toggleExhaustProduct(currentShift.id, stock.product_id, isExhausting, currentProfile.id, reason);
    } catch (error: unknown) {
      notify(error instanceof Error ? error.message : 'Não foi possível concluir a operação. Tente novamente.', 'error');
    }
  };

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustModalItem) return;
    try {
      adjustStockPhysicalCount(currentShift.id, adjustModalItem.product_id, newCount, currentProfile.id, adjustReason || 'Diferença na contagem física');
      setAdjustModalItem(null);
      setAdjustReason('');
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Erro ao ajustar estoque.', 'error');
    }
  };

  const isOut = (s: DailyPrepStock) => s.is_exhausted || s.current_quantity <= 0;
  const isLow = (s: DailyPrepStock) => !isOut(s) && s.current_quantity <= lowStockLimit(s.product);
  const query = searchTerm.trim().toLocaleLowerCase('pt-BR');
  const filteredStock = dailyPrepStock.filter((s) => {
    const prod = s.product;
    if (!prod) return false;
    return prod.name.toLocaleLowerCase('pt-BR').includes(query) && (selectedSector === 'ALL' || prod.sector === selectedSector);
  });

  return (
    <div className="page-layout">
      <PageHeader eyebrow="Controle de produção" title="Estoque diário" description={<>Disponibilidade, reposição e contagem física dos produtos.<span className="mt-1 block font-medium text-ink-secondary">{currentShift.name}</span></>} icon={Flame} />
      <div className="stat-grid stat-grid--three">
        <StatCard label="Produtos disponíveis" value={dailyPrepStock.filter((s) => !isOut(s)).length} hint="Liberados para atendimento" icon={CheckCircle} tone="success" />
        <StatCard label="Estoque baixo" value={dailyPrepStock.filter(isLow).length} hint="No limite de cada produto" icon={SlidersHorizontal} tone="warning" />
        <StatCard label="Produtos esgotados" value={dailyPrepStock.filter(isOut).length} hint="Bloqueados para novos pedidos" icon={Ban} tone="danger" />
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="filter-bar" aria-label="Setor do estoque">{(['ALL', 'GRILL', 'KITCHEN', 'BAR'] as const).map((sector) => <FilterChip key={sector} active={selectedSector === sector} onClick={() => setSelectedSector(sector)}>{sector === 'ALL' ? 'Todos os setores' : sector === 'KITCHEN' ? 'Cozinha e cubas' : SECTOR_LABEL[sector]}</FilterChip>)}</div>
        <SearchField value={searchTerm} onChange={setSearchTerm} label="Buscar produto no estoque" placeholder="Buscar espeto, porção ou bebida" className="w-full lg:w-72" />
      </div>

      {filteredStock.length === 0 ? <EmptyState title="Nenhum produto encontrado" description="Tente outro nome ou selecione todos os setores." action={<button type="button" className="btn-secondary" onClick={() => { setSearchTerm(''); setSelectedSector('ALL'); }}>Limpar filtros</button>} /> : (
        <div className="surface-card overflow-hidden">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_70px_70px_70px_auto] items-center gap-4 border-b border-line bg-surface-soft px-4 py-3 text-sm font-semibold text-ink-muted lg:grid">
            <span>Produto</span><span>Restante</span><span className="text-right">Vendido</span><span className="text-right">Perda</span><span className="text-right">Ajuste</span><span className="text-right">Ações</span>
          </div>
          <ul className="divide-y divide-line">
            {filteredStock.map((stock) => {
              const prod = stock.product!;
              const out = isOut(stock);
              const low = isLow(stock);
              const pct = stock.initial_quantity > 0 ? Math.min(100, Math.max(0, Math.round((stock.current_quantity / stock.initial_quantity) * 100))) : 0;
              return (
                <li key={stock.id} className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_70px_70px_70px_auto] lg:items-center lg:gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[15px] font-semibold text-ink">{prod.name}</h3>
                      {out ? <StatusTag kind="alert">Esgotado</StatusTag> : low ? <StatusTag kind="preparing">Estoque baixo</StatusTag> : <StatusTag kind="occupied">Disponível</StatusTag>}
                    </div>
                    <p className="mt-0.5 text-[13px] text-ink-muted">
                      {SECTOR_LABEL[prod.sector] ?? 'Outros'}{prod.is_cubas && ` · ${stock.cubas_count} ${stock.cubas_count === 1 ? 'cuba' : 'cubas'} (${stock.portions_per_cuba} porções cada)`}
                    </p>
                    {stock.is_exhausted && stock.exhaust_reason && <p className="mt-1 text-[13px] text-rose-800">Motivo: {stock.exhaust_reason}</p>}
                  </div>
                  <div>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className={`font-mono text-[15px] font-bold ${out ? 'text-rose-700' : low ? 'text-amber-800' : 'text-ink'}`}>{stock.current_quantity}</span>
                      <span className="font-mono text-[13px] text-ink-muted">de {stock.initial_quantity}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-sm bg-surface-muted">
                      <div className={`h-full rounded-sm ${out ? 'bg-rose-600' : low ? 'bg-amber-500' : 'bg-emerald-600'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm lg:contents">
                    <p className="rounded-md bg-surface-soft p-2 text-center lg:bg-transparent lg:p-0 lg:text-right"><span className="block text-[13px] text-ink-muted lg:hidden">Vendido</span><span className="font-mono font-semibold text-ink">{stock.consumed_quantity}</span></p>
                    <p className="rounded-md bg-surface-soft p-2 text-center lg:bg-transparent lg:p-0 lg:text-right"><span className="block text-[13px] text-ink-muted lg:hidden">Perda</span><span className={`font-mono font-semibold ${stock.discarded_quantity ? 'text-rose-700' : 'text-ink'}`}>{stock.discarded_quantity}</span></p>
                    <p className="rounded-md bg-surface-soft p-2 text-center lg:bg-transparent lg:p-0 lg:text-right"><span className="block text-[13px] text-ink-muted lg:hidden">Ajuste</span><span className="font-mono font-semibold text-ink">{stock.adjusted_quantity}</span></p>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button type="button" onClick={() => void handleToggleExhaust(stock)} className={`min-h-[44px] flex-1 lg:flex-none ${out ? 'btn-secondary' : 'btn-danger'}`}>
                      {out ? <><RotateCcw className="h-4 w-4" />Reativar</> : <><Ban className="h-4 w-4" />Esgotar</>}
                    </button>
                    <button type="button" onClick={() => { setAdjustModalItem(stock); setNewCount(stock.current_quantity); }} className="btn-secondary min-h-[44px] flex-1 lg:flex-none">
                      <SlidersHorizontal className="h-4 w-4" />Contagem
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {adjustModalItem && (
        <Dialog label="Contagem física" onClose={() => setAdjustModalItem(null)}>
          <div className="dialog-panel w-full max-w-md space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
            <h3 className="flex items-center gap-2 border-b border-line pb-3 text-base font-bold text-ink">
              <SlidersHorizontal className="h-5 w-5 text-amber-700" />
              <span>Contagem física: {adjustModalItem.product?.name}</span>
            </h3>
            <form onSubmit={handleAdjustSubmit} className="space-y-3 text-sm">
              <p className="rounded-md bg-surface-soft p-3 text-ink">No sistema: <strong className="font-mono text-ink">{adjustModalItem.current_quantity}</strong></p>
              <div>
                <label className="mb-1 block font-semibold text-ink" htmlFor="stock-new-count">Nova quantidade contada</label>
                <input id="stock-new-count" type="number" min="0" inputMode="numeric" value={newCount} onChange={(e) => setNewCount(Math.max(0, Number(e.target.value)))} className="h-12 w-full rounded-md border border-line-strong bg-surface px-3.5 font-mono text-base font-bold text-ink focus:border-brand-600 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-ink" htmlFor="stock-reason">Motivo da diferença</label>
                <input id="stock-reason" type="text" placeholder="Ex.: queimou na brasa, contagem errada na abertura" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} required className="h-12 w-full rounded-md border border-line-strong bg-surface px-3.5 text-base text-ink focus:border-brand-600 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button type="button" onClick={() => setAdjustModalItem(null)} className="btn-secondary h-12 text-[15px]">Cancelar</button>
                <button type="submit" className="btn-primary h-12 text-[15px]">Confirmar ajuste</button>
              </div>
            </form>
          </div>
        </Dialog>
      )}
    </div>
  );
};
