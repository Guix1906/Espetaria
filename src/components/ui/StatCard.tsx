import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: 'brand' | 'success' | 'warning' | 'info';
}

export function StatCard({ label, value, hint, icon: Icon }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="flex items-center gap-2 text-ink-muted">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div>
        <div className="stat-value">{value}</div>
        {hint && <div className="mt-1.5 text-xs leading-relaxed text-ink-muted">{hint}</div>}
      </div>
    </div>
  );
}
