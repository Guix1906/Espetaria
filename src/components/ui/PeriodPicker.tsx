import { FilterChip } from './FilterChip';
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
  { id: '7d', label: '7 dias', make: () => ({ from: todayISO(-6), to: todayISO() }) },
  { id: '30d', label: '30 dias', make: () => ({ from: todayISO(-29), to: todayISO() }) },
  { id: 'month', label: 'Este mês', make: () => monthBounds(0) },
  { id: 'last', label: 'Mês passado', make: () => monthBounds(-1) },
  { id: '12m', label: '12 meses', make: () => { const d = new Date(); return { from: new Date(d.getFullYear(), d.getMonth() - 11, 1).toLocaleDateString('sv-SE'), to: monthBounds(0).to }; } },
  { id: 'year', label: 'Este ano', make: () => { const y = new Date().getFullYear(); return { from: `${y}-01-01`, to: `${y}-12-31` }; } },
  { id: 'next', label: 'Próximos 30 dias', make: () => ({ from: todayISO(), to: todayISO(29) }) },
];

export function defaultPeriod(id = 'month'): Period {
  const preset = PERIOD_PRESETS.find((p) => p.id === id) ?? PERIOD_PRESETS[3]!;
  return { ...preset.make(), preset: preset.id };
}

/** Atalhos de período + datas livres. */
export function PeriodPicker({ value, onChange, presets }: { value: Period; onChange: (p: Period) => void; presets?: string[] }) {
  const list = PERIOD_PRESETS.filter((p) => !presets || presets.includes(p.id));
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
      <div className="filter-bar" aria-label="Período">
        {list.map((p) => <FilterChip key={p.id} active={value.preset === p.id} onClick={() => onChange({ ...p.make(), preset: p.id })}>{p.label}</FilterChip>)}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <label className="sr-only" htmlFor="period-from">De</label>
        <input id="period-from" type="date" className="h-11 min-w-0 flex-1 rounded-xl border px-2.5 lg:w-40 lg:flex-none" value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ from: e.target.value, to: value.to, preset: 'custom' })} />
        <span className="text-ink-muted">até</span>
        <label className="sr-only" htmlFor="period-to">Até</label>
        <input id="period-to" type="date" className="h-11 min-w-0 flex-1 rounded-xl border px-2.5 lg:w-40 lg:flex-none" value={value.to} min={value.from} onChange={(e) => e.target.value && onChange({ from: value.from, to: e.target.value, preset: 'custom' })} />
      </div>
    </div>
  );
}
