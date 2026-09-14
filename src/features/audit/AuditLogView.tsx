import { AlertOctagon,ArrowDownRight,ArrowUpRight,Clock3,RotateCcw,ShieldCheck,SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { FilterChip } from '../../components/ui/FilterChip';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchField } from '../../components/ui/SearchField';
import { formatDateTime } from '../../lib/formatters';
import { useStockStore } from '../../stores/useStockStore';
import type { StockMovementType } from '../../types/enums';

const movementConfig = {
  PRODUCAO: { label: 'Produção', icon: ArrowUpRight, classes: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  VENDA: { label: 'Venda', icon: ArrowDownRight, classes: 'border-amber-200 bg-amber-50 text-amber-800' },
  CANCELAMENTO_RETORNO: { label: 'Retorno ao estoque', icon: RotateCcw, classes: 'border-sky-200 bg-sky-50 text-sky-800' },
  PERDA: { label: 'Perda', icon: AlertOctagon, classes: 'border-rose-200 bg-rose-50 text-rose-800' },
  DESCARTE: { label: 'Descarte', icon: AlertOctagon, classes: 'border-rose-200 bg-rose-50 text-rose-800' },
  AJUSTE: { label: 'Ajuste de contagem', icon: SlidersHorizontal, classes: 'border-violet-200 bg-violet-50 text-violet-800' },
};
const filters = [{ id: 'ALL', label: 'Todas' }, { id: 'PRODUCAO', label: 'Produção' }, { id: 'VENDA', label: 'Vendas' }, { id: 'CANCELAMENTO_RETORNO', label: 'Retornos' }, { id: 'PERDA', label: 'Perdas' }, { id: 'DESCARTE', label: 'Descartes' }, { id: 'AJUSTE', label: 'Ajustes' }] as const;

export function AuditLogView() {
  const { stockMovements } = useStockStore();
  const [typeFilter, setTypeFilter] = useState<'ALL' | StockMovementType>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const query = searchTerm.trim().toLocaleLowerCase('pt-BR');
  const filteredMovements = stockMovements.filter((movement) => (typeFilter === 'ALL' || movement.movement_type === typeFilter) && `${movement.product_name || ''} ${movement.reason || ''}`.toLocaleLowerCase('pt-BR').includes(query));

  return (
    <div className="page-layout">
      <PageHeader eyebrow="Controle e transparência" title="Auditoria" description="Acompanhe as entradas, vendas, perdas e ajustes de estoque, com seus respectivos motivos." icon={ShieldCheck} actions={<span className="status-badge border-line bg-surface text-ink-secondary">{filteredMovements.length} {filteredMovements.length === 1 ? 'registro' : 'registros'}</span>} />
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="filter-bar" aria-label="Tipo de movimentação">{filters.map((filter) => <FilterChip key={filter.id} active={typeFilter === filter.id} onClick={() => setTypeFilter(filter.id)}>{filter.label}</FilterChip>)}</div>
        <SearchField value={searchTerm} onChange={setSearchTerm} label="Buscar movimentação por produto ou motivo" placeholder="Buscar produto ou motivo" className="w-full shrink-0 xl:w-64" />
      </div>
      {filteredMovements.length === 0 ? <EmptyState title="Nenhuma movimentação encontrada" description="As movimentações do estoque aparecerão aqui. Se você usou filtros, tente outra combinação." action={searchTerm || typeFilter !== 'ALL' ? <button type="button" className="btn-secondary" onClick={() => { setTypeFilter('ALL'); setSearchTerm(''); }}>Limpar filtros</button> : undefined} /> : <div className="surface-card overflow-hidden">
        <div className="hidden grid-cols-[1fr_240px] gap-4 border-b border-line bg-surface-soft px-5 py-3 text-xs font-semibold text-ink-muted md:grid"><span>Produto e movimentação</span><span className="text-right">Saldo e quantidade</span></div>
        <ul className="divide-y divide-line">
          {filteredMovements.map((movement) => {
            const config = movementConfig[movement.movement_type];
            const Icon = config.icon;
            const isPositive = movement.quantity > 0;
            return <li key={movement.id} className="flex flex-col justify-between gap-4 p-4 transition-colors hover:bg-surface-soft sm:p-5 md:flex-row md:items-center">
              <div className="flex min-w-0 items-start gap-3"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${config.classes}`}><Icon className="h-5 w-5" aria-hidden="true" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold text-ink">{movement.product_name || 'Produto'}</h2><span className={`status-badge ${config.classes}`}>{config.label}</span></div><p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">{movement.reason || 'Operação de rotina'}</p><p className="mt-2 flex items-center gap-1.5 text-xs text-ink-muted"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" /><time dateTime={movement.created_at}>{formatDateTime(movement.created_at)}</time></p></div></div>
              <div className="flex shrink-0 items-center justify-between gap-4 border-t border-line pt-3 md:border-0 md:pt-0"><div className="text-xs text-ink-muted"><span className="block">Saldo do produto</span><span className="mt-1 block text-sm text-ink-secondary tabular-nums">{movement.previous_balance}<span className="mx-2" aria-label="para">→</span><strong className="text-ink">{movement.new_balance}</strong></span></div><span className={`min-w-[68px] rounded-xl border px-3 py-2 text-center text-base font-semibold tabular-nums ${isPositive ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{isPositive ? '+' : ''}{movement.quantity}</span></div>
            </li>;
          })}
        </ul>
      </div>}
    </div>
  );
}
