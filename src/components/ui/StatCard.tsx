import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: 'brand' | 'success' | 'warning' | 'info';
}

const tones = {
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-800',
  info: 'bg-sky-50 text-sky-700',
};

export function StatCard({ label, value, hint, icon: Icon, tone = 'brand' }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink-secondary">{label}</span>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <div>
        <div className="stat-value">{value}</div>
        {hint && <div className="mt-2 text-xs leading-relaxed text-ink-muted">{hint}</div>}
      </div>
    </div>
  );
}
