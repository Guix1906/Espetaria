import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description: ReactNode;
  eyebrow?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
}

export function PageHeader({ title, description, eyebrow, icon: Icon, actions }: PageHeaderProps) {
  return (
    <div className="page-heading">
      <div className="flex min-w-0 items-start gap-4">
        {Icon && <div className="icon-tile mt-1 hidden sm:flex"><Icon className="h-5 w-5" aria-hidden="true" /></div>}
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="page-title">{title}</h1>
          <div className="page-description">{description}</div>
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
