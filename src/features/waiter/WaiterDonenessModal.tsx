import { Check, Flame, Minus, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { formatBRL, formatDoneness } from '../../lib/formatters';
import type { Product } from '../../types/domain';
import type { MeatDoneness } from '../../types/enums';
import { WaiterSheet } from './WaiterSheet';

interface WaiterDonenessModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (doneness: MeatDoneness | null, notes: string, quantity: number) => void;
  /** Quanto ainda dá para pedir (estoque do turno menos o rascunho). */
  maxQuantity?: number;
  /** Valores já escolhidos, ao alterar um item do rascunho. */
  initial?: { doneness: MeatDoneness | null; notes: string | null; quantity: number };
}

/** Só 3 pontos (os intermediários saíram do atendimento; o banco ainda aceita os antigos). */
export const DONENESS_OPTIONS: { value: MeatDoneness; label: string; description: string; swatch: string }[] = [
  { value: 'MAL_PASSADA', label: 'Mal passada', description: 'Selada por fora, centro vermelho.', swatch: '#A3282E' },
  { value: 'AO_PONTO', label: 'Ao ponto', description: 'Centro rosado. O padrão da casa.', swatch: '#D0673F' },
  { value: 'BEM_PASSADA', label: 'Bem passada', description: 'Totalmente cozida e bem tostada.', swatch: '#5A4A42' },
];
const COMMON_NOTES = ['Sem sal grosso', 'Pouco sal', 'Mais torradinho', 'Cortar em aperitivo', 'Farofa à parte'];

function DonenessForm({ product, onClose, onConfirm, maxQuantity, initial }: { product: Product; onClose: () => void; onConfirm: WaiterDonenessModalProps['onConfirm']; maxQuantity?: number; initial?: WaiterDonenessModalProps['initial'] }) {
  const [selectedDoneness, setSelectedDoneness] = useState<MeatDoneness>(initial?.doneness ?? 'AO_PONTO');
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [showNotes, setShowNotes] = useState(!product.allows_doneness || !!initial?.notes);
  const isEditing = !!initial;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const noteTags = notes.split(',').map((note) => note.trim()).filter(Boolean);
  // Item antigo com ponto intermediário continua visível ao alterar
  const options = DONENESS_OPTIONS.some((o) => o.value === selectedDoneness) ? DONENESS_OPTIONS
    : [...DONENESS_OPTIONS, { value: selectedDoneness, label: formatDoneness(selectedDoneness), description: 'Ponto escolhido antes.', swatch: '#C98A1B' }];

  const handleConfirm = () => {
    setErrorMessage(null);
    try {
      onConfirm(product.allows_doneness ? selectedDoneness : null, product.allows_notes ? notes.trim() : '', quantity);
      onClose();
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível adicionar este produto. Tente novamente.');
    }
  };

  const toggleNote = (tag: string) => {
    setNotes((noteTags.includes(tag) ? noteTags.filter((note) => note !== tag) : [...noteTags, tag]).join(', '));
  };

  return (
    <WaiterSheet label={`Personalizar ${product.name}`} onClose={onClose}>
      <div className="flex items-start justify-between gap-3 border-b border-[#E3D9CE] px-4 pb-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#F4E6DE] text-[#B5502F]"><Flame className="h-5 w-5" aria-hidden="true" /></span>
          <div className="min-w-0"><h2 className="text-lg font-bold leading-tight text-[#2A201B]">{product.name}</h2><p className="mt-0.5 font-mono text-[13px] text-[#7A6C62]">{formatBRL(product.price)} por unidade</p></div>
        </div>
        <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#E3D9CE] text-[#2A201B]" aria-label="Fechar personalização" onClick={onClose}><X className="h-5 w-5" /></button>
      </div>
      <div className="flex-1 space-y-3.5 overflow-y-auto px-4 py-3">
        {errorMessage && <div className="notice border-rose-200 bg-rose-50 text-rose-800" role="alert">{errorMessage}</div>}
        <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3.5 py-2">
          <span className="text-sm font-semibold text-[#2A201B]">Quantidade</span>
          <div className="flex items-center gap-2">
            <button type="button" className="flex h-11 w-11 items-center justify-center rounded-md border border-[#E3D9CE] disabled:opacity-40" aria-label="Diminuir quantidade" disabled={quantity <= 1} onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus className="h-4 w-4" /></button>
            <output aria-live="polite" className="w-8 text-center font-mono text-xl font-bold">{quantity}</output>
            <button type="button" className="flex h-11 w-11 items-center justify-center rounded-md border border-[#E7B49E] bg-[#F9ECE5] text-[#B5502F] disabled:opacity-40" aria-label="Aumentar quantidade" disabled={maxQuantity !== undefined && quantity >= maxQuantity} onClick={() => setQuantity(maxQuantity !== undefined ? Math.min(maxQuantity, quantity + 1) : quantity + 1)}><Plus className="h-4 w-4" /></button>
          </div>
        </div>
        {product.allows_doneness && <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold text-[#2A201B]">Como você prefere o ponto?</legend>
          {options.map((option) => {
            const on = selectedDoneness === option.value;
            return (
              <label key={option.value} className={`flex min-h-[76px] cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 ${on ? 'border-[#B5502F] bg-[#F9ECE5]' : 'border-[#E3D9CE] bg-white'}`}>
                <input type="radio" name="meat-doneness" value={option.value} checked={on} onChange={() => setSelectedDoneness(option.value)} className="h-[22px] w-[22px] shrink-0 accent-[#B5502F]" />
                <span className="h-[30px] w-2 shrink-0 rounded-sm" style={{ background: option.swatch }} aria-hidden="true" />
                <span className="flex-1"><span className="block text-[15px] font-semibold text-[#2A201B]">{option.label}</span><span className="mt-0.5 block text-[13px] text-[#7A6C62]">{option.description}</span></span>
                {on && <Check className="h-5 w-5 text-[#B5502F]" aria-hidden="true" />}
              </label>
            );
          })}
        </fieldset>}
        {product.allows_notes && (showNotes ? <div>
          <label htmlFor="doneness-notes" className="mb-2 block text-sm font-semibold text-[#2A201B]">Alguma observação?</label>
          {product.allows_doneness && <div className="mb-2 flex flex-wrap gap-1.5">{COMMON_NOTES.map((tag) => <button key={tag} type="button" aria-pressed={noteTags.includes(tag)} onClick={() => toggleNote(tag)} className={`min-h-[38px] rounded-md border px-2.5 text-xs font-medium ${noteTags.includes(tag) ? 'border-[#2A201B] bg-[#2A201B] text-white' : 'border-[#E3D9CE] bg-white text-[#5E5048]'}`}>{tag}</button>)}</div>}
          <textarea id="doneness-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex.: Sem cebola, gelo à parte..." className="w-full rounded-lg border border-[#D9CEC2] bg-white p-3 text-base" />
        </div> : <button type="button" onClick={() => setShowNotes(true)} className="min-h-[44px] text-sm font-semibold text-[#B5502F]">+ Adicionar observação</button>)}
      </div>
      <div className="shrink-0 border-t border-[#E3D9CE] px-4 pt-3" style={{ paddingBottom: 'max(0.875rem, env(safe-area-inset-bottom))' }}>
        <button type="button" onClick={handleConfirm} className="flex h-14 w-full items-center justify-between gap-2 rounded-lg bg-[#B5502F] px-4 text-base font-semibold text-white active:bg-[#8E3B21]">
          <span>{isEditing ? 'Salvar alteração' : `Adicionar ${quantity} ${quantity === 1 ? 'item' : 'itens'}`}</span>
          <span className="font-mono font-bold">{formatBRL(product.price * quantity)}</span>
        </button>
      </div>
    </WaiterSheet>
  );
}

export function WaiterDonenessModal({ product, isOpen, onClose, onConfirm, maxQuantity, initial }: WaiterDonenessModalProps) {
  if (!isOpen || !product) return null;
  return <DonenessForm key={product.id} product={product} onClose={onClose} onConfirm={onConfirm} maxQuantity={maxQuantity} initial={initial} />;
}
