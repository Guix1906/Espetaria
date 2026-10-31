import { Button } from '../../components/ui/Button';
import { Check, Flame, Minus, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { formatBRL, formatDoneness } from '../../lib/formatters';
import type { Product } from '../../types/domain';
import type { MeatDoneness } from '../../types/enums';
import { WaiterSheet } from './WaiterSheet';

export interface MultiDonenessItem {
  doneness: MeatDoneness;
  quantity: number;
}

export interface WaiterDonenessModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    doneness: MeatDoneness | null,
    notes: string,
    quantity: number,
    multiDoneness?: MultiDonenessItem[]
  ) => void;
  /** Quanto ainda dá para pedir (estoque do turno menos o rascunho). */
  maxQuantity?: number;
  /** Valores já escolhidos, ao alterar um item do rascunho. */
  initial?: { doneness: MeatDoneness | null; notes: string | null; quantity: number };
}

/** Só 3 pontos (os intermediários saíram do atendimento; o banco ainda aceita os antigos). */
export const DONENESS_OPTIONS: { value: MeatDoneness; label: string; description: string; swatch: string }[] = [
  { value: 'MAL_PASSADA', label: 'Mal passada', description: 'Selada por fora, centro vermelho.', swatch: '#A3282E' },
  { value: 'AO_PONTO', label: 'Ao ponto', description: 'Centro rosado. Padrão da casa.', swatch: '#D0673F' },
  { value: 'BEM_PASSADA', label: 'Bem passada', description: 'Totalmente cozida e bem tostada.', swatch: '#5A4A42' },
];
const COMMON_NOTES = ['Sem sal grosso', 'Pouco sal', 'Mais torradinho', 'Cortar em aperitivo', 'Farofa à parte'];
const ACOMPANHAMENTO_NOTES = ['Com arroz', 'Com baião', 'Com purê', 'Arroz e purê', 'Baião e purê', 'Sem cebola', 'Farofa à parte'];

function DonenessForm({ product, onClose, onConfirm, maxQuantity, initial }: { product: Product; onClose: () => void; onConfirm: WaiterDonenessModalProps['onConfirm']; maxQuantity?: number; initial?: WaiterDonenessModalProps['initial'] }) {
  const isEditing = !!initial;
  const [selectedDoneness, setSelectedDoneness] = useState<MeatDoneness | null>(initial?.doneness ?? null);
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [donenessCounts, setDonenessCounts] = useState<Record<string, number>>(() => ({
    MAL_PASSADA: 0,
    AO_PONTO: 0,
    BEM_PASSADA: 0,
  }));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [showNotes, setShowNotes] = useState(!product.allows_doneness || !!initial?.notes);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isCombo = /acompanhamento/i.test(product.name);
  const suggestedNotes = isCombo ? ACOMPANHAMENTO_NOTES : COMMON_NOTES;
  const noteTags = notes.split(',').map((note) => note.trim()).filter(Boolean);

  const totalDonenessQuantity = Object.values(donenessCounts).reduce((sum, n) => sum + (n || 0), 0);
  const effectiveQuantity = product.allows_doneness && !isEditing ? totalDonenessQuantity : quantity;
  const canAddMore = maxQuantity === undefined || effectiveQuantity < maxQuantity;

  // Item antigo com ponto intermediário continua visível ao alterar
  const options = !selectedDoneness || DONENESS_OPTIONS.some((o) => o.value === selectedDoneness) ? DONENESS_OPTIONS
    : [...DONENESS_OPTIONS, { value: selectedDoneness, label: formatDoneness(selectedDoneness), description: 'Ponto escolhido antes.', swatch: '#C98A1B' }];

  const needsDoneness = product.allows_doneness && (isEditing ? !selectedDoneness : totalDonenessQuantity === 0);

  const updateDonenessCount = (d: MeatDoneness, delta: number) => {
    setErrorMessage(null);
    setDonenessCounts((prev) => {
      const current = prev[d] || 0;
      const next = Math.max(0, current + delta);
      if (delta > 0 && maxQuantity !== undefined && totalDonenessQuantity >= maxQuantity) {
        return prev;
      }
      return { ...prev, [d]: next };
    });
  };

  const handleRowClick = (d: MeatDoneness) => {
    if (totalDonenessQuantity === 0) {
      updateDonenessCount(d, 1);
    }
  };

  const handleConfirm = () => {
    if (needsDoneness) {
      setErrorMessage('Escolha o ponto da carne para continuar.');
      return;
    }
    setErrorMessage(null);
    try {
      if (product.allows_doneness && !isEditing) {
        const multi: MultiDonenessItem[] = Object.entries(donenessCounts)
          .filter(([_, q]) => q > 0)
          .map(([d, q]) => ({ doneness: d as MeatDoneness, quantity: q }));
        const primary = multi[0]?.doneness ?? null;
        onConfirm(primary, product.allows_notes ? notes.trim() : '', totalDonenessQuantity, multi);
      } else {
        onConfirm(product.allows_doneness ? selectedDoneness : null, product.allows_notes ? notes.trim() : '', quantity);
      }
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
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 pb-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-500"><Flame className="h-5 w-5" aria-hidden="true" /></span>
          <div className="min-w-0"><h2 className="text-lg font-bold leading-tight text-ink">{product.name}</h2><p className="mt-0.5 font-mono text-base text-ink-muted">{formatBRL(product.price)} por unidade</p></div>
        </div>
        <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line text-ink" aria-label="Fechar personalização" onClick={onClose}><X className="h-5 w-5" /></button>
      </div>
      <div className="flex-1 space-y-3.5 overflow-y-auto px-4 py-3">
        {errorMessage && <div className="notice border-rose-200 bg-rose-50 text-rose-800" role="alert">{errorMessage}</div>}
        {(!product.allows_doneness || isEditing) && (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3.5 py-2">
            <span className="text-base font-semibold text-ink">Quantidade</span>
            <div className="flex items-center gap-2">
              <button type="button" className="flex h-11 w-11 items-center justify-center rounded-md border border-line disabled:opacity-40" aria-label="Diminuir quantidade" disabled={quantity <= 1} onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus className="h-4 w-4" /></button>
              <output aria-live="polite" className="w-8 text-center font-mono text-xl font-bold">{quantity}</output>
              <button type="button" className="flex h-11 w-11 items-center justify-center rounded-md border border-brand-200 bg-brand-50 text-brand-500 disabled:opacity-40" aria-label="Aumentar quantidade" disabled={maxQuantity !== undefined && quantity >= maxQuantity} onClick={() => setQuantity(maxQuantity !== undefined ? Math.min(maxQuantity, quantity + 1) : quantity + 1)}><Plus className="h-4 w-4" /></button>
            </div>
          </div>
        )}
        {product.allows_doneness && <fieldset className="space-y-2">
          <legend className="mb-2 text-base font-semibold text-ink">Como você prefere o ponto? {!isEditing && <span className="font-normal text-base text-ink-muted">· escolha a quantidade por ponto</span>}</legend>
          {options.map((option) => {
            const on = selectedDoneness === option.value;
            const count = donenessCounts[option.value] || 0;
            if (!isEditing) {
              return (
                <div
                  key={option.value}
                  onClick={() => handleRowClick(option.value)}
                  className={`flex min-h-[72px] items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 transition cursor-pointer ${count > 0 ? 'border-brand-500 bg-brand-50 shadow-sm' : 'border-line bg-white'}`}>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="h-[32px] w-2.5 shrink-0 rounded-sm" style={{ background: option.swatch }} aria-hidden="true" />
                    <div className="min-w-0">
                      <span className="block text-[17px] font-semibold text-ink leading-tight">{option.label}</span>
                      <span className="mt-0.5 block text-base text-ink-muted leading-tight">{option.description}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {count > 0 ? (
                      <div className="flex items-center rounded-lg border border-line-strong bg-white shadow-sm h-11">
                        <button
                          type="button"
                          onClick={() => updateDonenessCount(option.value, -1)}
                          className="flex h-full w-10 items-center justify-center text-ink-muted hover:text-ink active:bg-surface-muted"
                          aria-label={`Diminuir ${option.label}`}>
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="min-w-[28px] text-center font-mono text-base font-bold text-ink">
                          {count}
                        </span>
                        <button
                          type="button"
                          disabled={!canAddMore}
                          onClick={() => updateDonenessCount(option.value, 1)}
                          className="flex h-full w-10 items-center justify-center text-brand-500 hover:text-brand-700 disabled:opacity-40 active:bg-surface-muted"
                          aria-label={`Aumentar ${option.label}`}>
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={!canAddMore}
                        onClick={() => updateDonenessCount(option.value, 1)}
                        className="flex h-11 items-center gap-1.5 rounded-lg border border-line bg-surface-soft px-3 text-[14px] font-semibold text-ink hover:bg-surface-muted disabled:opacity-40 active:brightness-95">
                        <Plus className="h-4 w-4 text-brand-500" />
                        <span>Adicionar</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            }
            return (
              <label key={option.value} className={`flex min-h-[76px] cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 ${on ? 'border-brand-500 bg-brand-50' : 'border-line bg-white'}`}>
                <input type="radio" name="meat-doneness" value={option.value} checked={on} onChange={() => { setSelectedDoneness(option.value); setErrorMessage(null); }} className="h-[22px] w-[22px] shrink-0 accent-brand-500" />
                <span className="h-[30px] w-2 shrink-0 rounded-sm" style={{ background: option.swatch }} aria-hidden="true" />
                <span className="flex-1"><span className="block text-[17px] font-semibold text-ink">{option.label}</span><span className="mt-0.5 block text-base text-ink-muted">{option.description}</span></span>
                {on && <Check className="h-5 w-5 text-brand-500" aria-hidden="true" />}
              </label>
            );
          })}
        </fieldset>}
        {product.allows_notes && (showNotes ? <div>
          <label htmlFor="doneness-notes" className="mb-2 block text-base font-semibold text-ink">Alguma observação?</label>
          {(product.allows_doneness || isCombo) && <div className="mb-2 flex flex-wrap gap-1.5">{suggestedNotes.map((tag) => <button key={tag} type="button" aria-pressed={noteTags.includes(tag)} onClick={() => toggleNote(tag)} className={`min-h-[38px] rounded-md border px-2.5 text-base font-medium ${noteTags.includes(tag) ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-secondary'}`}>{tag}</button>)}</div>}
          <textarea id="doneness-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={isCombo ? "Ex.: Arroz, baião, purê, sem cebola..." : "Ex.: Sem cebola, gelo à parte..."} className="w-full rounded-lg border border-line-strong bg-white p-3 text-base" />
        </div> : <button type="button" onClick={() => setShowNotes(true)} className="min-h-[44px] text-base font-semibold text-brand-500">+ Adicionar observação</button>)}
      </div>
      <div className="shrink-0 border-t border-line px-4 pt-3" style={{ paddingBottom: 'max(0.875rem, env(safe-area-inset-bottom))' }}>
        <Button size="lg" block onClick={handleConfirm} disabled={needsDoneness} className="justify-between font-semibold">
          <span>{needsDoneness ? 'Escolha o ponto da carne' : isEditing ? 'Salvar alteração' : `Adicionar ${effectiveQuantity} ${effectiveQuantity === 1 ? 'item' : 'itens'}`}</span>
          <span className="font-mono font-bold">{formatBRL(product.price * effectiveQuantity)}</span>
        </Button>
      </div>
    </WaiterSheet>
  );
}

export function WaiterDonenessModal({ product, isOpen, onClose, onConfirm, maxQuantity, initial }: WaiterDonenessModalProps) {
  if (!isOpen || !product) return null;
  return <DonenessForm key={product.id} product={product} onClose={onClose} onConfirm={onConfirm} maxQuantity={maxQuantity} initial={initial} />;
}
