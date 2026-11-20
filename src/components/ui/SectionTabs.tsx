import type { ComponentType } from 'react';

export interface SectionTabItem<T extends string> {
  id: T;
  label: string;
  /** Texto curto para celular (opcional). */
  shortLabel?: string;
  icon?: ComponentType<{ className?: string }>;
  count?: number;
}

/**
 * Abas de seção (padrão único do sistema): trocam o assunto da tela.
 * Sublinhado, sem cartões. Para filtrar uma lista use FilterChip.
 */
export function SectionTabs<T extends string>({ items, value, onChange, label }: { items: SectionTabItem<T>[]; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="-mx-1 flex flex-wrap gap-1 border-b border-line px-1">
      {items.map((s) => {
        const active = value === s.id;
        const Icon = s.icon;
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(s.id)}
            className={`-mb-px inline-flex min-h-[44px] shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm transition-colors ${active ? 'border-brand-600 font-semibold text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
          >
            {Icon && <Icon className={`h-4 w-4 ${active ? 'text-brand-600' : ''}`} aria-hidden="true" />}
            {s.shortLabel ? <><span className="sm:hidden">{s.shortLabel}</span><span className="hidden sm:inline">{s.label}</span></> : s.label}
            {s.count !== undefined && s.count > 0 && <span className={`rounded-sm px-1.5 py-0.5 font-mono text-xs ${active ? 'bg-brand-600 text-white' : 'bg-surface-muted text-ink-secondary'}`}>{s.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
