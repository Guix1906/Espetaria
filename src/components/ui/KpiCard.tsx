import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export type KpiTone = 'neutral' | 'brand' | 'success' | 'danger' | 'warning';

const ICON_TONES: Record<KpiTone, string> = {
  neutral: 'bg-surface-muted text-ink-secondary',
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-emerald-50 text-emerald-700',
  danger: 'bg-rose-50 text-rose-700',
  warning: 'bg-amber-50 text-amber-800',
};

const VALUE_TONES: Record<KpiTone, string> = {
  neutral: 'text-ink',
  brand: 'text-ink',
  success: 'text-emerald-800',
  danger: 'text-rose-700',
  warning: 'text-amber-900',
};

/** Número de destaque com ícone colorido (Caixa, Financeiro). */
export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  highlight = false,
  size = 'md',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: KpiTone;
  /** Borda colorida para chamar atenção (ex.: conta pedida). */
  highlight?: boolean;
  size?: 'md' | 'lg';
}) {
  const ring = highlight
    ? tone === 'warning'
      ? 'border-amber-400'
      : tone === 'danger'
        ? 'border-rose-300'
        : 'border-brand-600'
    : '';
  return (
    <div className={`surface-card flex items-start gap-3 p-4 sm:p-5 ${highlight ? `border-2 ${ring}` : ''}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${ICON_TONES[tone]}`} aria-hidden="true">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink-muted">{label}</p>
        <p className={`mt-0.5 font-mono font-bold leading-tight ${size === 'lg' ? 'text-3xl' : 'text-2xl'} ${VALUE_TONES[tone]}`}>{value}</p>
        {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
      </div>
    </div>
  );
}
