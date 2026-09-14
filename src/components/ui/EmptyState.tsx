import { SearchX,type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon: Icon = SearchX, action }: EmptyStateProps) {
  return (
    <div className="empty-state" role="status">
      <div className="mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-muted text-ink-muted">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="max-w-md text-sm leading-relaxed text-ink-muted">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
