import { ArrowRight, Clock3, Plus, Receipt, ShoppingBag, Users } from 'lucide-react';
import { formatBRL, formatElapsedMinutes, getTableStatusConfig } from '../../lib/formatters';
import type { RestaurantTable, Tab } from '../../types/domain';
import type { TableStatus } from '../../types/enums';

interface TableCardProps {
  table: RestaurantTable;
  tab?: Tab;
  onOpen: () => void;
  onOrder: () => void;
  onBill?: () => void;
  disabled?: boolean;
}

const borderByStatus: Record<TableStatus, string> = {
  LIVRE: 'border-t-emerald-500',
  OCUPADA: 'border-t-amber-500',
  AGUARDANDO_CONTA: 'border-t-rose-500',
  RESERVADA: 'border-t-sky-500',
};

export function TableCard({ table, tab, onOpen, onOrder, onBill, disabled = false }: TableCardProps) {
  const isFree = table.status === 'LIVRE';
  const status = getTableStatusConfig(table.status);
  const content = (
    <div className="flex flex-1 flex-col p-3.5 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-xl font-bold tracking-tight text-ink tabular-nums">Mesa {String(table.number).padStart(2, '0')}</h2>
        <span className="flex items-center gap-1 text-xs text-ink-muted" aria-label={`${table.capacity} lugares`}><Users className="h-3.5 w-3.5" aria-hidden="true" />{table.capacity}</span>
      </div>
      <span className={`status-badge mt-3 ${status.badgeBg}`}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{status.label}</span>
      <div className="flex flex-1 flex-col justify-center py-4">
        {tab ? (
          <>
            {tab.customer_name && tab.customer_name !== `Mesa ${table.number}` && <p className="truncate text-sm font-semibold text-ink" title={tab.customer_name}>{tab.customer_name}</p>}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-xs text-ink-muted"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{formatElapsedMinutes(tab.opened_at)}</span>
              <span className="text-base font-bold text-ink tabular-nums">{formatBRL(tab.total)}</span>
            </div>
          </>
        ) : !isFree ? <p className="text-sm text-ink-muted">Reservada</p> : null}
      </div>
      {!onBill && <span className={`flex items-center justify-between gap-2 border-t border-line pt-3 text-sm font-semibold ${isFree ? 'text-brand-700' : 'text-ink'}`}><span className="whitespace-nowrap">{isFree ? (disabled ? 'Turno fechado' : <>Abrir<span className="hidden xs:inline"> comanda</span></>) : <>Ver itens<span className="hidden xs:inline"> e lançar</span></>}</span>{isFree ? <Plus className="h-4 w-4" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}</span>}
    </div>
  );

  if (!onBill) {
    return <button type="button" disabled={isFree && disabled} onClick={isFree ? onOpen : onOrder} className={`table-card ${borderByStatus[table.status]}`} aria-label={`Mesa ${table.number}, ${status.label}. ${isFree ? 'Abrir comanda' : 'Ver itens e lançar pedido'}`}>{content}</button>;
  }

  return (
    <article className={`table-card ${borderByStatus[table.status]}`} aria-label={`Mesa ${table.number}, ${status.label}`}>
      {content}
      <div className="mx-3.5 mb-3.5 flex flex-col gap-2 sm:flex-row border-t border-line pt-3 sm:mx-4 sm:mb-4">
        {isFree ? <button type="button" disabled={disabled} onClick={onOpen} className="btn-secondary w-full px-2 text-xs text-brand-800"><Plus className="h-4 w-4" aria-hidden="true" />Abrir comanda</button> : <><button type="button" onClick={onOrder} className="btn-primary flex-1 px-2 text-xs"><ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />Pedir</button><button type="button" onClick={onBill} className="btn-secondary flex-1 px-2 text-xs"><Receipt className="h-3.5 w-3.5" aria-hidden="true" />Conta</button></>}
      </div>
    </article>
  );
}
