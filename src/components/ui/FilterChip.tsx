import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface FilterChipProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
}

export function FilterChip({ active, onClick, children, count }: FilterChipProps) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cn('filter-chip', active && 'is-active')}>
      {children}
      {count !== undefined && <span className="filter-count">{count}</span>}
    </button>
  );
}
