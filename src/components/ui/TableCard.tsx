import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, ChevronDown, Printer, Receipt, ShoppingBag, Users } from 'lucide-react';
import { formatBRL, getTableStatusConfig } from '../../lib/formatters';
import type { RestaurantTable, Tab } from '../../types/domain';
import { STATUS_TOP_BORDER, tableStatusKind } from '../../lib/statusStyles';

interface TableCardProps {
  table: RestaurantTable;
  tab?: Tab;
  itemCount?: number;
  onOpen: () => void;
  onOrder: () => void;
  onBill?: () => void;
  onPrint?: () => void;
  onTransfer?: () => void;
  disabled?: boolean;
}

export function TableCard({
  table,
  tab,
  itemCount = 0,
  onOpen,
  onOrder,
  onBill,
  onPrint,
  onTransfer,
  disabled = false,
}: TableCardProps) {
  const isFree = table.status === 'LIVRE';
  const status = getTableStatusConfig(table.status);
  const isWaitingBill = table.status === 'AGUARDANDO_CONTA';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const padNumber = String(table.number).padStart(2, '0');

  // Caso Mesa Livre
  if (isFree) {
    return (
      <article
        className={`table-card rounded-xl border border-line bg-surface shadow-xs hover:shadow-md transition overflow-hidden flex flex-col justify-between ${STATUS_TOP_BORDER[tableStatusKind(table.status)]}`}
        aria-label={`Mesa ${table.number}, ${status.label}. Abrir comanda`}
      >
        <span className="sr-only status-badge">{status.label}</span>
        <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="font-bold text-[16px] text-ink font-sans tracking-tight tabular-nums">
              Mesa {padNumber}
            </span>
          </div>

          <button
            type="button"
            disabled={disabled}
            onClick={onOpen}
            className="h-7 px-2.5 rounded-md border border-line bg-surface hover:bg-surface-muted text-xs font-semibold text-brand-800 flex items-center justify-center transition active:scale-95 disabled:opacity-50"
            title="Abrir comanda para esta mesa"
          >
            <span>Abrir</span>
          </button>
        </div>

        <div className="px-3.5 py-1.5 bg-surface-muted text-ink-muted border-t border-line/60 flex items-center justify-between text-xs">
          <span>Livre</span>
          <span>Disponível</span>
        </div>
      </article>
    );
  }

  // Caso Mesa Ativa (Ocupada ou Fechando conta)
  return (
    <article
      className="table-card rounded-xl border border-line bg-surface shadow-xs hover:shadow-md transition overflow-visible flex flex-col justify-between relative"
      aria-label={`Mesa ${table.number}, ${status.label}`}
    >
      <span className="sr-only status-badge">{status.label}</span>

      {/* LINHA SUPERIOR: Nome da mesa + Ações */}
      <div className="px-3.5 py-2 flex items-center justify-between gap-2 bg-surface rounded-t-xl">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-bold text-[16px] text-ink font-sans tracking-tight tabular-nums">
            Mesa {padNumber}
          </span>
          {tab?.customer_name && tab.customer_name !== `Mesa ${table.number}` && (
            <span
              className="text-xs text-ink-muted truncate max-w-[110px]"
              title={tab.customer_name || undefined}
            >
              · {tab.customer_name}
            </span>
          )}
        </div>

        {/* BOTÕES DE AÇÃO: + Pedido, Cobrar e Menu v */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOrder();
            }}
            className="h-7 px-2.5 rounded-md border border-line bg-surface hover:bg-surface-muted text-xs font-semibold text-ink flex items-center justify-center transition active:scale-95 shadow-2xs"
            title="Lançar novos pedidos nesta mesa"
          >
            <span>Pedido</span>
          </button>

          {onBill && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onBill();
              }}
              className={`h-7 px-2.5 rounded-md text-xs font-bold flex items-center gap-1 transition active:scale-95 shadow-2xs ${
                isWaitingBill
                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                  : 'bg-ink hover:bg-ink-secondary text-white'
              }`}
              title="Cobrar / fechar mesa"
            >
              <Receipt className="w-3 h-3" />
              <span>Cobrar</span>
            </button>
          )}

          {/* Botão Dropdown [ v ] */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((prev) => !prev);
              }}
              className="h-7 w-7 rounded-md border border-line bg-surface hover:bg-surface-muted text-ink-muted hover:text-ink flex items-center justify-center transition active:scale-95"
              aria-label="Mais opções da mesa"
              title="Opções da mesa"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 rounded-xl border border-line bg-surface py-1 shadow-floating z-40 text-xs animate-in fade-in zoom-in-95">
                {onBill && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onBill();
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-surface-muted flex items-center gap-2 text-ink font-semibold"
                  >
                    <Receipt className="w-4 h-4 text-brand-600" />
                    <span>Cobrar conta</span>
                  </button>
                )}
                {onPrint && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onPrint();
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-surface-muted flex items-center gap-2 text-ink"
                  >
                    <Printer className="w-4 h-4 text-ink-muted" />
                    <span>Imprimir pré-conta</span>
                  </button>
                )}
                {onTransfer && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onTransfer();
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-surface-muted flex items-center gap-2 text-ink"
                  >
                    <ArrowLeftRight className="w-4 h-4 text-ink-muted" />
                    <span>Transferir mesa</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onOrder();
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-surface-muted flex items-center gap-2 text-ink border-t border-line/60"
                >
                  <ShoppingBag className="w-4 h-4 text-ink-muted" />
                  <span>Ver itens da comanda</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* FAIXA INFERIOR: Barra colorida com ícones de itens, pessoas e total em R$ */}
      <div
        onClick={onBill}
        className={`px-3.5 py-1.5 rounded-b-xl flex items-center justify-between text-xs font-semibold select-none transition cursor-pointer ${
          isWaitingBill
            ? 'bg-amber-400 hover:bg-amber-500 text-amber-950'
            : 'bg-brand-500 hover:bg-[#eb6546] text-white'
        }`}
        title="Clique para cobrar e fechar a mesa"
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 font-bold">
            <Receipt className="w-3.5 h-3.5 opacity-90" />
            <span className="tabular-nums">{itemCount}</span>
          </span>
          <span className="flex items-center gap-1 font-bold">
            <Users className="w-3.5 h-3.5 opacity-90" />
            <span className="tabular-nums">{tab?.people_count || 1}</span>
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="font-mono text-[13px] font-black tabular-nums tracking-tight">
            {formatBRL(tab?.total || 0)}
          </span>
        </div>
      </div>
    </article>
  );
}
