import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description: ReactNode;
  /** Mantidos por compatibilidade; o cabeçalho é só título + descrição. */
  eyebrow?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="page-heading">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        <div className="page-description">{description}</div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
