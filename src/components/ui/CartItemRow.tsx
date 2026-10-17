import { Minus, Pencil, Plus, Trash2 } from 'lucide-react';
import { formatBRL, formatDoneness } from '../../lib/formatters';
import type { MeatDoneness } from '../../types/enums';

interface CartItemRowProps {
  name: string;
  unitPrice: number;
  quantity: number;
  doneness?: MeatDoneness | null;
  notes?: string | null;
  onQuantityChange?: ((delta: number) => void) | null;
  onRemove?: (() => void) | null;
  /** Abre a troca de ponto/observação (só itens que permitem). */
  onEdit?: (() => void) | null;
}

export function CartItemRow({ name, unitPrice, quantity, doneness, notes, onQuantityChange, onRemove, onEdit }: CartItemRowProps) {
  const readOnly = !onQuantityChange || !onRemove;
  return (
    <li className="rounded-xl border border-line bg-surface p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold leading-relaxed text-ink">{name}</h3>
          {doneness && <p className="mt-1 text-xs text-accent-700">{formatDoneness(doneness)}</p>}
          {notes && <p className="mt-1 text-xs leading-relaxed text-ink-muted">{notes}</p>}
          {onEdit && (
            <button type="button" onClick={onEdit} className="mt-1.5 inline-flex min-h-[32px] items-center gap-1 text-xs font-semibold text-brand-700 underline underline-offset-2" aria-label={`Alterar ponto ou observação de ${name}`}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />{doneness ? 'Alterar ponto / observação' : 'Alterar observação'}
            </button>
          )}
        </div>
        {!readOnly && (
          <button type="button" onClick={onRemove} className="icon-button border-transparent text-ink-muted hover:bg-rose-50 hover:text-rose-700" aria-label={`Remover ${name}`}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="block font-semibold text-brand-800 tabular-nums">{formatBRL(unitPrice * quantity)}</span>
          <span className="mt-0.5 block text-xs text-ink-muted tabular-nums">{formatBRL(unitPrice)} cada</span>
        </div>
        {readOnly ? (
          <span className="text-sm font-semibold tabular-nums text-ink-muted">Qtd: {quantity}</span>
        ) : (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onQuantityChange(-1)} className="icon-button" aria-label={`Diminuir quantidade de ${name}`}><Minus className="h-4 w-4" aria-hidden="true" /></button>
            <span className="w-6 text-center text-sm font-semibold tabular-nums">{quantity}</span>
            <button type="button" onClick={() => onQuantityChange(1)} className="icon-button bg-brand-50 text-brand-800" aria-label={`Aumentar quantidade de ${name}`}><Plus className="h-4 w-4" aria-hidden="true" /></button>
          </div>
        )}
      </div>
    </li>
  );
}
