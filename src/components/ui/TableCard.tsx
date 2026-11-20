import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Clock, MoreHorizontal, Plus, Printer, Receipt, ShoppingBag, Users } from 'lucide-react';
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
  onOrder: () => void;
  onBill?: () => void;
  onPrint?: () => void;
  onTransfer?: () => void;
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
  onBill,
  onPrint,
  onTransfer,
  disabled = false,
}: TableCardProps) {
  const isFree = table.status === 'LIVRE';
  const status = getTableStatusConfig(table.status);
  const kind = tableStatusKind(table.status);
  const isWaitingBill = table.status === 'AGUARDANDO_CONTA';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

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

  // Mesa em atendimento: tudo o que importa à vista, sem ícones soltos
  return (
    <article
      className={`relative flex flex-col rounded-md border bg-surface shadow-card transition ${isWaitingBill ? 'border-brand-500 ring-1 ring-brand-500' : 'border-line hover:border-line-strong'}`}
      aria-label={`Mesa ${table.number}, ${status.label}`}
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

        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((prev) => !prev); }}
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition hover:bg-surface-muted hover:text-ink"
            aria-label="Mais opções da mesa"
            aria-expanded={menuOpen}
            title="Mais opções"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-40 mt-1 w-48 rounded-md border border-line bg-surface py-1 text-sm shadow-floating">
              {onPrint && (
                <button type="button" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onPrint(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-surface-muted">
                  <Printer className="h-4 w-4 text-ink-muted" />Imprimir pré-conta
                </button>
              )}
              {onTransfer && (
                <button type="button" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onTransfer(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-surface-muted">
                  <ArrowLeftRight className="h-4 w-4 text-ink-muted" />Transferir mesa
                </button>
              )}
              <button type="button" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onOrder(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-surface-muted">
                <ShoppingBag className="h-4 w-4 text-ink-muted" />Ver itens da comanda
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-end justify-between gap-3 px-4 pb-3 pt-2">
        <ul className="space-y-0.5 text-[13px] text-ink-muted">
          <li className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" aria-hidden="true" />{tab?.people_count || 1} {(tab?.people_count || 1) === 1 ? 'pessoa' : 'pessoas'} · {itemCount} {itemCount === 1 ? 'item' : 'itens'}</li>
          {opened && <li className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{opened === '0 min' ? 'Aberta agora' : `Aberta há ${opened}`}</li>}
        </ul>
        <span className="font-mono text-xl font-bold tabular-nums text-ink">{formatBRL(tab?.total || 0)}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-line px-3 py-2.5">
        <button type="button" onClick={(e) => { e.stopPropagation(); onOrder(); }} className="btn-secondary min-h-[40px] px-2" title="Lançar itens nesta mesa">
          <Plus className="h-4 w-4" aria-hidden="true" />Lançar
        </button>
        {onBill && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onBill(); }} className={`min-h-[40px] px-2 ${isWaitingBill ? 'btn-primary' : 'btn-secondary'}`} title="Cobrar e fechar a mesa">
            <Receipt className="h-4 w-4" aria-hidden="true" />Cobrar
          </button>
        )}
      </div>
    </article>
  );
}
