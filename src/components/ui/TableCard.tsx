import { ChevronRight, Clock, Plus, Users } from 'lucide-react';
import { formatBRL, getTableStatusConfig } from '../../lib/formatters';
import type { RestaurantTable, Tab } from '../../types/domain';
import { STATUS_STYLES, tableStatusKind } from '../../lib/statusStyles';

interface TableCardProps {
  table: RestaurantTable;
  tab?: Tab;
  itemCount?: number;
  /** Itens prontos esperando o garçom levar. */
  readyCount?: number;
  now?: number;
  onOpen: () => void;
  /** Mesa ocupada: tocar no cartão (abre a gaveta da comanda no Salão). */
  onOrder: () => void;
  disabled?: boolean;
}

/** "12 min", "1h05" — há quanto tempo a mesa está aberta. */
export function openFor(openedAt: string | undefined, now: number): string | null {
  if (!openedAt) return null;
  const minutes = Math.max(0, Math.floor((now - new Date(openedAt).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}

export function TableCard({
  table,
  tab,
  itemCount = 0,
  readyCount = 0,
  now = Date.now(),
  onOpen,
  onOrder,
  disabled = false,
}: TableCardProps) {
  const isFree = table.status === 'LIVRE';
  const status = getTableStatusConfig(table.status);
  const kind = tableStatusKind(table.status);
  const isWaitingBill = table.status === 'AGUARDANDO_CONTA';

  const padNumber = String(table.number).padStart(2, '0');

  // Mesa livre: um quadradinho discreto; tocar abre a comanda
  if (isFree) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onOpen}
        className="group flex min-h-[64px] w-full flex-col items-center justify-center rounded-md border border-line bg-surface px-2 py-2 text-center transition hover:border-brand-400 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={`Mesa ${table.number}, ${status.label}. Abrir comanda`}
        title="Abrir comanda nesta mesa"
      >
        <span className="sr-only">Mesa {padNumber}</span>
        <span aria-hidden="true" className="font-mono text-lg font-semibold tabular-nums text-ink-secondary group-hover:text-brand-800">{padNumber}</span>
        <span className={`status-badge mt-0.5 ${STATUS_STYLES[kind]} group-hover:text-brand-700`}>
          <span className="group-hover:hidden">{status.label}</span>
          <span className="hidden items-center gap-1 group-hover:inline-flex"><Plus className="h-3 w-3" aria-hidden="true" />Abrir</span>
        </span>
      </button>
    );
  }

  const opened = openFor(tab?.opened_at, now);

  // Mesa em atendimento: o cartão inteiro é um toque só e abre a gaveta da comanda
  return (
    <button
      type="button"
      onClick={onOrder}
      className={`group relative flex w-full flex-col rounded-md border bg-surface text-left shadow-card transition-colors hover:bg-surface-soft${isWaitingBill ? 'border-brand-500 ring-1 ring-brand-500' : 'border-line hover:border-line-strong'}`}
      aria-label={`Mesa ${table.number}, ${status.label}. Ver comanda`}
      title="Ver comanda da mesa"
    >
      <div className="flex items-start justify-between gap-2 px-4 pt-3.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xl font-bold tabular-nums text-ink">Mesa {padNumber}</span>
            <span className={`status-badge ${STATUS_STYLES[kind]}`}>{status.label}</span>
            {readyCount > 0 && <span className={`status-badge ${STATUS_STYLES.ready}`}>{readyCount} pronto{readyCount > 1 ? 's' : ''}</span>}
          </div>
          {tab?.customer_name && tab.customer_name !== `Mesa ${table.number}` && (
            <p className="mt-0.5 truncate text-sm text-ink-secondary" title={tab.customer_name}>{tab.customer_name}</p>
          )}
        </div>
        <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-ink-muted transition-colors group-hover:text-brand-600" aria-hidden="true" />
      </div>

      <div className="flex w-full items-end justify-between gap-3 px-4 pb-3.5 pt-2">
        <ul className="space-y-0.5 text-[13px] text-ink-muted">
          <li className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" aria-hidden="true" />{tab?.people_count || 1} {(tab?.people_count || 1) === 1 ? 'pessoa' : 'pessoas'} · {itemCount} {itemCount === 1 ? 'item' : 'itens'}</li>
          {opened && <li className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{opened === '0 min' ? 'Aberta agora' : `Aberta há ${opened}`}</li>}
        </ul>
        <span className="font-mono text-xl font-bold tabular-nums text-ink">{formatBRL(tab?.total || 0)}</span>
      </div>
    </button>
  );
}
