import { Check } from 'lucide-react';

interface OptionGroupProps {
  title: string;
  /** Texto ao lado do título: "obrigatório" ou "opcional". */
  hint?: string;
  options: string[];
  value: string | null;
  onChange: (value: string | null) => void;
}

/** Escolha única em botões de largura igual (48px): a posição não muda e o polegar acerta na pressa. */
export function OptionGroup({ title, hint, options, value, onChange }: OptionGroupProps) {
  return (
    <div role="radiogroup" aria-label={title}>
      <p className="mb-2 text-base font-semibold text-ink">{title}{hint && <span className="font-normal text-ink-muted"> · {hint}</span>}</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const on = value === option;
          return (
            <button key={option} type="button" role="radio" aria-checked={on} onClick={() => onChange(on ? null : option)}
              className={`flex min-h-[48px] items-center justify-center gap-1.5 rounded-md border px-2 text-center text-[15px] font-semibold leading-tight ${on ? 'border-brand-500 bg-brand-500 text-white' : 'border-line-strong bg-surface text-ink active:bg-surface-muted'}`}>
              {on && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}{option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
