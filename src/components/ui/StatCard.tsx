import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  /** Cor do ícone: só sinaliza; o número continua em tinta. */
  tone?: Tone;
}

const TONE_ICON: Record<Tone, string> = {
  neutral: 'text-ink-muted',
  info: 'text-ink-muted',
  brand: 'text-brand-600',
  success: 'text-emerald-600',
  warning: 'text-amber-600',
  danger: 'text-rose-600',
};

export function StatCard({ label, value, hint, icon: Icon, tone = 'neutral' }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="flex items-center gap-2 text-ink-muted">
        <Icon className={`h-4 w-4 ${TONE_ICON[tone]}`} aria-hidden="true" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div>
        <div className="stat-value">{value}</div>
        {hint && <div className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{hint}</div>}
      </div>
    </div>
  );
}
