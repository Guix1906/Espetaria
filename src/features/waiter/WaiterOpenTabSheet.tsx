import { ArrowRight } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { RestaurantTable } from '../../types/domain';
import { WaiterSheet } from './WaiterSheet';

interface Props {
  table: RestaurantTable;
  error: string | null;
  onClose: () => void;
  onSubmit: (data: { people: number; name: string; notes: string }) => void;
}

/** Abrir comanda: pessoas (1–8, padrão 2), nome e observação opcionais. */
export function WaiterOpenTabSheet({ table, error, onClose, onSubmit }: Props) {
  const [people, setPeople] = useState(2);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const submit = (event: FormEvent) => { event.preventDefault(); onSubmit({ people, name, notes }); };
  return (
    <WaiterSheet label={`Abrir comanda da mesa ${table.number}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5 overflow-y-auto px-4 pb-4 pt-1" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div>
          <p className="text-[13px] text-[#7A6C62]">Nova comanda</p>
          <h2 className="font-mono text-[30px] font-bold leading-tight text-[#2A201B]">Mesa {String(table.number).padStart(2, '0')}</h2>
        </div>
        {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{error}</p>}
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-[#2A201B]">Quantas pessoas?</legend>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <button key={n} type="button" aria-pressed={people === n} onClick={() => setPeople(n)}
                className={`h-[52px] rounded-[10px] border font-mono text-lg font-bold ${people === n ? 'border-[#2A201B] bg-[#2A201B] text-white' : 'border-[#D9CEC2] bg-white text-[#2A201B]'}`}>{n}</button>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="open-tab-name" className="mb-1.5 block text-sm font-semibold text-[#2A201B]">Nome (opcional)</label>
          <input id="open-tab-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Família Silva"
            className="h-[50px] w-full rounded-lg border border-[#D9CEC2] bg-white px-3.5 text-base placeholder:text-[#9A8B80]" />
        </div>
        {showNotes ? (
          <div>
            <label htmlFor="open-tab-notes" className="mb-1.5 block text-sm font-semibold text-[#2A201B]">Observação</label>
            <input id="open-tab-notes" type="text" autoFocus value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: Comemorando aniversário"
              className="h-[50px] w-full rounded-lg border border-[#D9CEC2] bg-white px-3.5 text-base placeholder:text-[#9A8B80]" />
          </div>
        ) : (
          <button type="button" onClick={() => setShowNotes(true)} className="min-h-[44px] text-sm font-semibold text-[#B5502F]">+ Adicionar observação</button>
        )}
        <button type="submit" className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#B5502F] text-base font-semibold text-white active:bg-[#8E3B21]">
          Abrir e lançar itens <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </button>
        <button type="button" onClick={onClose} className="h-11 w-full text-sm font-medium text-[#5E5048]">Cancelar</button>
      </form>
    </WaiterSheet>
  );
}
