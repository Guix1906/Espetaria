import { AlertOctagon, ArrowDownRight, ArrowUpRight, Clock3, RotateCcw, ShieldCheck, SlidersHorizontal, User } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { FilterChip } from '../../components/ui/FilterChip';
import { PageHeader } from '../../components/ui/PageHeader';
import { defaultPeriod, PeriodPicker, type Period } from '../../components/ui/PeriodPicker';
import { SearchField } from '../../components/ui/SearchField';
import { StatusTag } from '../../components/ui/StatusTag';
import { AUDIT_KIND_ALERT, AUDIT_KIND_LABEL, loadAuditEvents, type AuditEvent, type AuditKind } from '../../lib/auditData';
import { formatDateTime } from '../../lib/formatters';
import { useStockStore } from '../../stores/useStockStore';
import type { StockMovementType } from '../../types/enums';

const movementConfig = {
  PRODUCAO: { label: 'Produção', icon: ArrowUpRight, classes: 'bg-emerald-50 text-emerald-800' },
  VENDA: { label: 'Venda', icon: ArrowDownRight, classes: 'bg-surface-muted text-ink' },
  CANCELAMENTO_RETORNO: { label: 'Retorno ao estoque', icon: RotateCcw, classes: 'bg-surface-muted text-ink' },
  PERDA: { label: 'Perda', icon: AlertOctagon, classes: 'bg-rose-50 text-rose-800' },
  DESCARTE: { label: 'Descarte', icon: AlertOctagon, classes: 'bg-rose-50 text-rose-800' },
  AJUSTE: { label: 'Ajuste de contagem', icon: SlidersHorizontal, classes: 'bg-amber-50 text-amber-800' },
};
const stockFilters = [{ id: 'ALL', label: 'Todas' }, { id: 'PRODUCAO', label: 'Produção' }, { id: 'VENDA', label: 'Vendas' }, { id: 'CANCELAMENTO_RETORNO', label: 'Retornos' }, { id: 'PERDA', label: 'Perdas' }, { id: 'DESCARTE', label: 'Descartes' }, { id: 'AJUSTE', label: 'Ajustes' }] as const;
const KINDS = Object.keys(AUDIT_KIND_LABEL) as AuditKind[];
const selectCls = 'h-11 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink';

function TeamActions() {
  const [period, setPeriod] = useState<Period>(() => defaultPeriod('7d'));
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<'ALL' | AuditKind>('ALL');
  const [person, setPerson] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    loadAuditEvents(period.from, period.to)
      .then((list) => { if (alive) setEvents(list); })
      .catch((err: unknown) => { if (alive) setError(err instanceof Error ? err.message : 'Não foi possível carregar a auditoria.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [period.from, period.to]);

  const people = useMemo(() => [...new Map(events.map((e) => [e.userId ?? 'sistema', e.userName])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')), [events]);
  const query = searchTerm.trim().toLocaleLowerCase('pt-BR');
  const filtered = events.filter((e) => (kind === 'ALL' || e.kind === kind)
    && (person === 'ALL' || (e.userId ?? 'sistema') === person)
    && `${e.title} ${e.reason ?? ''} ${e.detail ?? ''} ${e.userName}`.toLocaleLowerCase('pt-BR').includes(query));

  return (
    <div className="space-y-4">
      <PeriodPicker value={period} onChange={setPeriod} />
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <label className="flex flex-col gap-1 text-sm text-ink-secondary">Tipo
          <select value={kind} onChange={(e) => setKind(e.target.value as 'ALL' | AuditKind)} className={selectCls}>
            <option value="ALL">Todos os tipos</option>
            {KINDS.map((k) => <option key={k} value={k}>{AUDIT_KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-secondary">Funcionário
          <select value={person} onChange={(e) => setPerson(e.target.value)} className={selectCls}>
            <option value="ALL">Todos</option>
            {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <SearchField value={searchTerm} onChange={setSearchTerm} label="Buscar por motivo, produto ou nome" placeholder="Buscar motivo ou produto" className="w-full md:ml-auto md:w-64 md:self-end" />
      </div>
      {error && <p role="alert" className="notice border-rose-200 bg-rose-50 text-rose-800">{error}</p>}
      {loading ? <p className="py-10 text-center text-sm text-ink-muted">Carregando...</p> : filtered.length === 0 ? (
        <EmptyState title="Nada registrado" description="Anulações, estornos, cancelamentos e ajustes aparecem aqui. Tente outro período ou filtro." />
      ) : (
        <div className="surface-card overflow-hidden">
          <ul className="divide-y divide-line">
            {filtered.map((e) => (
              <li key={e.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {AUDIT_KIND_ALERT[e.kind] ? <StatusTag kind="alert" className="font-semibold">{e.title}</StatusTag> : <StatusTag kind="occupied" className="font-semibold">{e.title}</StatusTag>}
                    {e.detail && <span className="text-[15px] font-semibold text-ink">{e.detail}</span>}
                  </div>
                  <p className="mt-1.5 text-[15px] text-ink-secondary">{e.reason ? <>Motivo: {e.reason}</> : <span className="text-ink-muted">Sem motivo informado</span>}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted sm:flex-col sm:items-end">
                  <span className="flex items-center gap-1.5 font-semibold text-ink"><User className="h-4 w-4" aria-hidden="true" />{e.userName}</span>
                  <span className="flex items-center gap-1.5 font-mono"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" /><time dateTime={e.at}>{formatDateTime(e.at)}</time></span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StockMovements() {
  const { stockMovements } = useStockStore();
  const [typeFilter, setTypeFilter] = useState<'ALL' | StockMovementType>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const query = searchTerm.trim().toLocaleLowerCase('pt-BR');
  const filteredMovements = stockMovements.filter((movement) => (typeFilter === 'ALL' || movement.movement_type === typeFilter) && `${movement.product_name || ''} ${movement.reason || ''}`.toLocaleLowerCase('pt-BR').includes(query));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="filter-bar" aria-label="Tipo de movimentação">{stockFilters.map((filter) => <FilterChip key={filter.id} active={typeFilter === filter.id} onClick={() => setTypeFilter(filter.id)}>{filter.label}</FilterChip>)}</div>
        <SearchField value={searchTerm} onChange={setSearchTerm} label="Buscar movimentação por produto ou motivo" placeholder="Buscar produto ou motivo" className="w-full shrink-0 xl:w-64" />
      </div>
      {filteredMovements.length === 0 ? <EmptyState title="Nenhuma movimentação encontrada" description="As movimentações do estoque do turno aparecem aqui." /> : <div className="surface-card overflow-hidden">
        <ul className="divide-y divide-line">
          {filteredMovements.map((movement) => {
            const config = movementConfig[movement.movement_type];
            const Icon = config.icon;
            const isPositive = movement.quantity > 0;
            return <li key={movement.id} className="flex flex-col justify-between gap-4 p-4 sm:p-5 md:flex-row md:items-center">
              <div className="flex min-w-0 items-start gap-3"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md ${config.classes}`}><Icon className="h-5 w-5" aria-hidden="true" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-[15px] font-semibold text-ink">{movement.product_name || 'Produto'}</h2><span className={`status-badge ${config.classes}`}>{config.label}</span></div><p className="mt-1.5 text-sm text-ink-secondary">{movement.reason || 'Operação de rotina'}</p><p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">{movement.user_name && <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" aria-hidden="true" />{movement.user_name}</span>}<span className="flex items-center gap-1.5 font-mono"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" /><time dateTime={movement.created_at}>{formatDateTime(movement.created_at)}</time></span></p></div></div>
              <div className="flex shrink-0 items-center justify-between gap-4 border-t border-line pt-3 md:border-0 md:pt-0"><div className="text-sm text-ink-muted"><span className="block">Saldo</span><span className="mt-1 block font-mono text-ink-secondary">{movement.previous_balance}<span className="mx-2" aria-label="para">→</span><strong className="text-ink">{movement.new_balance}</strong></span></div><span className={`min-w-[68px] rounded-md px-3 py-2 text-center font-mono text-base font-semibold ${isPositive ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{isPositive ? '+' : ''}{movement.quantity}</span></div>
            </li>;
          })}
        </ul>
      </div>}
    </div>
  );
}

export function AuditLogView() {
  const [tab, setTab] = useState<'team' | 'stock'>('team');
  return (
    <div className="page-layout">
      <PageHeader eyebrow="Controle e transparência" title="Auditoria" description="Quem anulou, estornou, cancelou ou ajustou, quando e por quê." icon={ShieldCheck} />
      <div className="filter-bar" aria-label="O que ver">
        <FilterChip active={tab === 'team'} onClick={() => setTab('team')}>Ações da equipe</FilterChip>
        <FilterChip active={tab === 'stock'} onClick={() => setTab('stock')}>Estoque do turno</FilterChip>
      </div>
      {tab === 'team' ? <TeamActions /> : <StockMovements />}
    </div>
  );
}
