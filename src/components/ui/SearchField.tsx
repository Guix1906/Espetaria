import { Search,X } from 'lucide-react';
import { useId } from 'react';
import { cn } from '../../lib/utils';

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}

export function SearchField({ value, onChange, placeholder, label, className }: SearchFieldProps) {
  const id = useId();
  return (
    <div className={cn('relative min-w-0', className)}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-line-strong bg-surface py-3 pl-10 pr-12 text-sm text-ink placeholder:text-ink-muted focus:border-brand-600 focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && (
        <button type="button" aria-label="Limpar busca" onClick={() => onChange('')} className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-ink-muted hover:text-brand-800">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
