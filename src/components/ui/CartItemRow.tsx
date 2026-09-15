import { Minus, Plus, Trash2 } from 'lucide-react';
import { formatBRL, formatDoneness } from '../../lib/formatters';
import type { MeatDoneness } from '../../types/enums';

interface CartItemRowProps {
  name: string;
  unitPrice: number;
  quantity: number;
  doneness?: MeatDoneness | null;
  notes?: string | null;
  onQuantityChange: (delta: number) => void;
  onRemove: () => void;
}

export function CartItemRow({ name, unitPrice, quantity, doneness, notes, onQuantityChange, onRemove }: CartItemRowProps) {
  return (
    <li className="rounded-xl border border-line bg-surface p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold leading-relaxed text-ink">{name}</h3>
          {doneness && <p className="mt-1 text-xs text-accent-700">{formatDoneness(doneness)}</p>}
          {notes && <p className="mt-1 text-xs leading-relaxed text-ink-muted">{notes}</p>}
        </div>
        <button type="button" onClick={onRemove} className="icon-button border-transparent text-ink-muted hover:bg-rose-50 hover:text-rose-700" aria-label={`Remover ${name}`}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="block font-semibold text-brand-800 tabular-nums">{formatBRL(unitPrice * quantity)}</span>
          <span className="mt-0.5 block text-xs text-ink-muted tabular-nums">{formatBRL(unitPrice)} cada</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onQuantityChange(-1)} className="icon-button" aria-label={`Diminuir quantidade de ${name}`}><Minus className="h-4 w-4" aria-hidden="true" /></button>
          <span className="w-6 text-center text-sm font-semibold tabular-nums">{quantity}</span>
          <button type="button" onClick={() => onQuantityChange(1)} className="icon-button border-brand-200 bg-brand-50 text-brand-800" aria-label={`Aumentar quantidade de ${name}`}><Plus className="h-4 w-4" aria-hidden="true" /></button>
        </div>
      </div>
    </li>
  );
}
