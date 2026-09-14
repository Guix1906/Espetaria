import { Flame } from 'lucide-react';

export function BrandMark() {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-700 text-white">
        <Flame className="h-6 w-6" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-base font-bold tracking-tight text-brand-950">Sabor da Carne</p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted">Espetaria</p>
      </div>
    </div>
  );
}
