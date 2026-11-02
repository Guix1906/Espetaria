import { Minus, Plus } from 'lucide-react';

interface StepperProps {
  qty: number;
  onMinus: () => void;
  onPlus: () => void;
  /** Altura em px (44 é o mínimo para toque). */
  size?: number;
  /** Nome do item, para leitores de tela. */
  label?: string;
  plusDisabled?: boolean;
}

/** Controle padrão de quantidade: − n + */
export function Stepper({ qty, onMinus, onPlus, size = 44, label, plusDisabled = false }: StepperProps) {
  return (
    <div className="flex shrink-0 items-center rounded-md border border-line-strong bg-surface" style={{ height: size }}>
      <button type="button" onClick={onMinus} aria-label={label ? `Diminuir ${label}` : 'Diminuir'} className="flex h-full w-10 items-center justify-center text-ink-muted active:bg-surface-muted"><Minus className="h-4 w-4" /></button>
      <span className="min-w-[24px] text-center font-mono text-[15px] font-semibold">{qty}</span>
      <button type="button" disabled={plusDisabled} onClick={onPlus} aria-label={label ? `Aumentar ${label}` : 'Aumentar'} className="flex h-full w-10 items-center justify-center text-brand-500 active:bg-surface-muted disabled:opacity-40"><Plus className="h-4 w-4" /></button>
    </div>
  );
}
