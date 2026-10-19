import { CalendarDays } from 'lucide-react';
import { todayISO } from '../../lib/financeData';

export interface Period { from: string; to: string; preset: string }

function monthBounds(offset: number) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { from: first.toLocaleDateString('sv-SE'), to: last.toLocaleDateString('sv-SE') };
}

export const PERIOD_PRESETS: { id: string; label: string; make: () => { from: string; to: string } }[] = [
  { id: 'today', label: 'Hoje', make: () => ({ from: todayISO(), to: todayISO() }) },
  { id: '7d', label: 'Últimos 7 dias', make: () => ({ from: todayISO(-6), to: todayISO() }) },
  { id: '30d', label: 'Últimos 30 dias', make: () => ({ from: todayISO(-29), to: todayISO() }) },
  { id: 'month', label: 'Este mês', make: () => monthBounds(0) },
  { id: 'last', label: 'Mês passado', make: () => monthBounds(-1) },
  { id: '12m', label: 'Últimos 12 meses', make: () => { const d = new Date(); return { from: new Date(d.getFullYear(), d.getMonth() - 11, 1).toLocaleDateString('sv-SE'), to: monthBounds(0).to }; } },
  { id: 'year', label: 'Este ano', make: () => { const y = new Date().getFullYear(); return { from: `${y}-01-01`, to: `${y}-12-31` }; } },
  { id: 'next', label: 'Próximos 30 dias', make: () => ({ from: todayISO(), to: todayISO(29) }) },
];

export function defaultPeriod(id = 'month'): Period {
  const preset = PERIOD_PRESETS.find((p) => p.id === id) ?? PERIOD_PRESETS[3]!;
  return { ...preset.make(), preset: preset.id };
}

const dateInput = '!border-0 !shadow-none !ring-0 h-10 min-w-0 flex-1 bg-transparent px-2 font-mono text-[13px] tabular-nums outline-none focus-visible:bg-surface-muted sm:w-[8.5rem] sm:flex-none';

/** Período em uma barra só: lista de atalhos + intervalo de datas. */
export function PeriodPicker({ value, onChange, presets }: { value: Period; onChange: (p: Period) => void; presets?: string[] }) {
  const list = PERIOD_PRESETS.filter((p) => !presets || presets.includes(p.id));
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center" aria-label="Período">
      <div className="flex h-10 items-center rounded-md border border-line-strong bg-surface pl-2.5">
        <CalendarDays className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
        <label className="sr-only" htmlFor="period-preset">Período</label>
        <select
          id="period-preset"
          className="!border-0 !shadow-none !ring-0 h-full min-w-0 flex-1 cursor-pointer bg-transparent pl-2 pr-3 text-sm font-medium outline-none sm:flex-none"
          value={value.preset}
          onChange={(e) => { const p = list.find((x) => x.id === e.target.value); if (p) onChange({ ...p.make(), preset: p.id }); }}
        >
          {list.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          {value.preset === 'custom' && <option value="custom">Personalizado</option>}
        </select>
      </div>
      <div className="flex items-center rounded-md border border-line-strong bg-surface text-sm">
        <label className="sr-only" htmlFor="period-from">De</label>
        <input id="period-from" type="date" className={dateInput} value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ from: e.target.value, to: value.to, preset: 'custom' })} />
        <span className="px-1 text-ink-muted" aria-hidden="true">–</span>
        <label className="sr-only" htmlFor="period-to">Até</label>
        <input id="period-to" type="date" className={dateInput} value={value.to} min={value.from} onChange={(e) => e.target.value && onChange({ from: value.from, to: e.target.value, preset: 'custom' })} />
      </div>
    </div>
  );
}

/** Abas de seção com sublinhado (sem cartões). */
export function SectionTabs<T extends string>({ items, value, onChange, label }: { items: { id: T; label: string }[]; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line px-1">
      {items.map((s) => (
        <button
          key={s.id}
          type="button"
          role="tab"
          aria-selected={value === s.id}
          onClick={() => onChange(s.id)}
          className={`-mb-px min-h-[44px] shrink-0 whitespace-nowrap border-b-2 px-3 text-sm transition-colors ${value === s.id ? 'border-ink font-semibold text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
