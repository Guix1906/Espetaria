import { Button } from '../../components/ui/Button';
import { OptionGroup } from '../../components/ui/OptionGroup';
import { Stepper } from '../../components/ui/Stepper';
import { Check, Minus, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { formatBRL, formatDoneness } from '../../lib/formatters';
import type { Product } from '../../types/domain';
import type { MeatDoneness } from '../../types/enums';
import { WaiterSheet } from './WaiterSheet';
import { triggerHaptic } from '../../lib/haptics';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { productFlavors } from '../../lib/productAvailability';

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
// O arroz sai daqui: é escolhido só entre os sabores do dia (Configurações)
const ACOMPANHAMENTO_NOTES = ['Sem cebola', 'Farofa à parte'];
const NO_RICE = 'Sem arroz';
const NO_COUNTS: Record<string, number> = { MAL_PASSADA: 0, AO_PONTO: 0, BEM_PASSADA: 0 };

/** Detecta se o produto é um suco/bebida que precisa de escolha de sabor. */
function isJuiceProduct(product: Product): boolean {
  return /suco|refresco|bebida/i.test(product.name);
}

function DonenessForm({ product, onClose, onConfirm, maxQuantity, initial }: { product: Product; onClose: () => void; onConfirm: WaiterDonenessModalProps['onConfirm']; maxQuantity?: number; initial?: WaiterDonenessModalProps['initial'] }) {
  const isEditing = !!initial;
  const { settings } = useSettingsStore();

  const isCombo = /acompanhamento/i.test(product.name);
  const isRiceOnly = /arroz/i.test(product.name) && !isCombo;
  const isRiceOrCombo = isCombo || isRiceOnly;
  const isJuice = isJuiceProduct(product) || (product.sector === 'KITCHEN' && product.type === 'BEBIDA');
  const riceOptions = settings.daily_rice_flavors ?? [];
  // Sabores vêm só das Configurações do dia: sem cadastro, o grupo não aparece
  const flavors = productFlavors(product.description);
  const choices = flavors.length ? flavors : isRiceOrCombo && riceOptions.length ? (isCombo ? [...riceOptions, NO_RICE] : riceOptions) : isJuice ? settings.daily_juice_flavors ?? [] : [];
  const choiceRequired = flavors.length > 0 || (isCombo && riceOptions.length > 0);

  // Arroz/sabor fica separado da observação livre; os dois só se juntam ao salvar
  const initialTags = (initial?.notes ?? '').split(',').map((note) => note.trim()).filter(Boolean);
  const [choice, setChoice] = useState<string | null>(() => initialTags.find((tag) => choices.includes(tag)) ?? null);
  const [notes, setNotes] = useState(() => initialTags.filter((tag) => !choices.includes(tag)).join(', '));
  const [selectedDoneness, setSelectedDoneness] = useState<MeatDoneness | null>(initial?.doneness ?? null);
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  // Nenhum ponto vem marcado: o garçom sempre pergunta ao cliente
  const [donenessCounts, setDonenessCounts] = useState<Record<string, number>>(() => (
    initial?.doneness ? { ...NO_COUNTS, [initial.doneness]: initial.quantity } : NO_COUNTS
  ));
  const [showNotes, setShowNotes] = useState(!!notes);
  const [addedCount, setAddedCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const suggestedNotes = isJuice ? [] : isCombo ? ACOMPANHAMENTO_NOTES : product.allows_doneness ? COMMON_NOTES : [];
  const noteTags = notes.split(',').map((note) => note.trim()).filter(Boolean);

  const totalDonenessQuantity = Object.values(donenessCounts).reduce((sum, n) => sum + (n || 0), 0);
  const effectiveQuantity = product.allows_doneness && !isEditing ? totalDonenessQuantity : quantity;
  const canAddMore = maxQuantity === undefined || effectiveQuantity < maxQuantity;

  // Item antigo com ponto intermediário continua visível ao alterar
  const options = !selectedDoneness || DONENESS_OPTIONS.some((o) => o.value === selectedDoneness) ? DONENESS_OPTIONS
    : [...DONENESS_OPTIONS, { value: selectedDoneness, label: formatDoneness(selectedDoneness), description: 'Ponto escolhido antes.', swatch: '#C98A1B' }];

  const needsDoneness = product.allows_doneness && (isEditing ? !selectedDoneness : totalDonenessQuantity === 0);
  const needsChoice = choiceRequired && !choice && !isEditing;
  const missingLabel = needsDoneness ? 'Escolha o ponto da carne' : needsChoice ? (flavors.length ? 'Escolha o sabor' : 'Escolha o arroz') : null;
  const canRepeat = !isEditing && (product.allows_doneness || choiceRequired);

  const updateDonenessCount = (d: MeatDoneness, delta: number) => {
    triggerHaptic(25);
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

  // Com até 1 espeto, tocar na linha troca o ponto; o "+" é que soma outro espeto
  const handleRowClick = (d: MeatDoneness) => {
    triggerHaptic(25);
    setErrorMessage(null);
    if (totalDonenessQuantity <= 1) setDonenessCounts({ ...NO_COUNTS, [d]: 1 });
  };

  const toggleNote = (tag: string) => {
    setNotes((noteTags.includes(tag) ? noteTags.filter((note) => note !== tag) : [...noteTags, tag]).join(', '));
  };

  const handleConfirm = (repeat = false) => {
    triggerHaptic(40);
    if (missingLabel) {
      setErrorMessage(`${missingLabel} para continuar.`);
      return;
    }
    setErrorMessage(null);
    const typedNotes = product.allows_notes ? notes.trim() : '';
    const finalNotes = [choice, typedNotes].filter(Boolean).join(', ');
    try {
      if (product.allows_doneness && !isEditing) {
        const multi: MultiDonenessItem[] = Object.entries(donenessCounts)
          .filter(([_, q]) => q > 0)
          .map(([d, q]) => ({ doneness: d as MeatDoneness, quantity: q }));
        const primary = multi[0]?.doneness ?? null;
        onConfirm(primary, finalNotes, totalDonenessQuantity, multi);
      } else {
        onConfirm(product.allows_doneness ? selectedDoneness : null, finalNotes, quantity);
      }
      if (!repeat) { onClose(); return; }
      // Próximo espeto da mesma mesa, com outras escolhas
      setAddedCount((count) => count + effectiveQuantity);
      setDonenessCounts(NO_COUNTS);
      setQuantity(1);
      setChoice(null);
      setNotes('');
      setShowNotes(false);
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível adicionar este produto. Tente novamente.');
    }
  };

  return (
    <WaiterSheet label={`Personalizar ${product.name}`} onClose={onClose}>
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 pb-3">
        <div className="min-w-0"><h2 className="text-lg font-bold leading-tight text-ink">{product.name}</h2><p className="mt-0.5 font-mono text-base text-ink-muted">{formatBRL(product.price)} por unidade</p></div>
        <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line text-ink" aria-label="Fechar personalização" onClick={onClose}><X className="h-5 w-5" /></button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {addedCount > 0 && <p role="status" className="notice items-center border-emerald-200 bg-emerald-50 py-2 text-emerald-800"><Check className="h-4 w-4 shrink-0" aria-hidden="true" />{addedCount} {addedCount === 1 ? 'adicionado' : 'adicionados'} ao pedido. Escolha o próximo.</p>}
        {errorMessage && <div className="notice border-rose-200 bg-rose-50 text-rose-800" role="alert">{errorMessage}</div>}
        {(!product.allows_doneness || isEditing) && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-base font-semibold text-ink">Quantidade</span>
            <div className="flex items-center gap-2">
              <button type="button" className="flex h-11 w-11 items-center justify-center rounded-md border border-line disabled:opacity-40" aria-label="Diminuir quantidade" disabled={quantity <= 1} onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus className="h-4 w-4" /></button>
              <output aria-live="polite" className="w-8 text-center font-mono text-xl font-bold">{quantity}</output>
              <button type="button" className="flex h-11 w-11 items-center justify-center rounded-md border border-brand-200 bg-brand-50 text-brand-500 disabled:opacity-40" aria-label="Aumentar quantidade" disabled={maxQuantity !== undefined && quantity >= maxQuantity} onClick={() => setQuantity(maxQuantity !== undefined ? Math.min(maxQuantity, quantity + 1) : quantity + 1)}><Plus className="h-4 w-4" /></button>
            </div>
          </div>
        )}
        {product.allows_doneness && <fieldset className="space-y-2">
          <legend className="mb-2 text-base font-semibold text-ink">Ponto da carne <span className="font-normal text-ink-muted">· obrigatório</span></legend>
          {options.map((option) => {
            const on = selectedDoneness === option.value;
            const count = donenessCounts[option.value] || 0;
            if (!isEditing) {
              return (
                <div key={option.value} className={`flex items-center gap-2 rounded-md border pr-1.5 ${count > 0 ? 'border-brand-500 bg-brand-50' : 'border-line-strong bg-surface'}`}>
                  <button type="button" aria-pressed={count > 0} onClick={() => handleRowClick(option.value)} className="flex min-h-[52px] min-w-0 flex-1 items-center gap-2.5 px-3 text-left text-[17px] font-semibold text-ink">
                    <span className="h-6 w-2 shrink-0 rounded-sm" style={{ background: option.swatch }} aria-hidden="true" />{option.label}
                  </button>
                  {count > 0 ? (
                    <Stepper qty={count} label={option.label} plusDisabled={!canAddMore} onMinus={() => updateDonenessCount(option.value, -1)} onPlus={() => updateDonenessCount(option.value, 1)} />
                  ) : (
                    <button type="button" disabled={!canAddMore} onClick={() => updateDonenessCount(option.value, 1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-line-strong text-brand-500 disabled:opacity-40 active:bg-surface-muted" aria-label={`Adicionar ${option.label}`}><Plus className="h-4 w-4" /></button>
                  )}
                </div>
              );
            }
            return (
              <label key={option.value} className={`flex min-h-[52px] cursor-pointer items-center gap-3 rounded-md border px-3.5 py-2 ${on ? 'border-brand-500 bg-brand-50' : 'border-line-strong bg-surface'}`}>
                <input type="radio" name="meat-doneness" value={option.value} checked={on} onChange={() => { setSelectedDoneness(option.value); setErrorMessage(null); }} className="h-[22px] w-[22px] shrink-0 accent-brand-500" />
                <span className="h-6 w-2 shrink-0 rounded-sm" style={{ background: option.swatch }} aria-hidden="true" />
                <span className="flex-1 text-[17px] font-semibold text-ink">{option.label}</span>
                {on && <Check className="h-5 w-5 text-brand-500" aria-hidden="true" />}
              </label>
            );
          })}
        </fieldset>}
        {choices.length > 0 && <OptionGroup title={flavors.length ? 'Sabor' : isRiceOrCombo ? 'Arroz do dia' : 'Sabor do dia'} hint={choiceRequired ? 'obrigatório' : 'opcional'} options={choices} value={choice} onChange={(value) => { setChoice(value); setErrorMessage(null); }} />}
        {product.allows_notes && <div>
          {suggestedNotes.length > 0 && <>
            <p className="mb-2 text-base font-semibold text-ink">Pedidos comuns <span className="font-normal text-ink-muted">· opcional</span></p>
            <div className="mb-2 flex flex-wrap gap-2">{suggestedNotes.map((tag) => {
              const on = noteTags.includes(tag);
              return <button key={tag} type="button" aria-pressed={on} onClick={() => toggleNote(tag)} className={`flex min-h-[44px] items-center gap-1.5 rounded-md border px-3 text-[15px] font-medium ${on ? 'border-brand-500 bg-brand-500 text-white' : 'border-line-strong bg-surface text-ink'}`}>{on && <Check className="h-4 w-4" aria-hidden="true" />}{tag}</button>;
            })}</div>
          </>}
          {showNotes || (!suggestedNotes.length && !choices.length && !product.allows_doneness) ? <>
            <label htmlFor="doneness-notes" className="mb-2 block text-base font-semibold text-ink">Observação</label>
            <textarea id="doneness-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={isJuice ? 'Ex.: Com gelo, sem açúcar...' : isCombo ? 'Ex.: Pouco sal, sem vinagrete...' : 'Ex.: Sem cebola, gelo à parte...'} className="w-full rounded-lg border border-line-strong bg-surface p-3 text-base" />
          </> : <button type="button" onClick={() => setShowNotes(true)} className="min-h-[44px] text-base font-semibold text-brand-700">+ Escrever observação</button>}
        </div>}
      </div>
      <div className="shrink-0 space-y-2 border-t border-line px-4 pt-3" style={{ paddingBottom: 'max(0.875rem, env(safe-area-inset-bottom))' }}>
        <Button size="lg" block onClick={() => handleConfirm()} disabled={!!missingLabel} className="justify-between font-semibold">
          <span>{missingLabel ?? (isEditing ? 'Salvar alteração' : `Adicionar ${effectiveQuantity} ${effectiveQuantity === 1 ? 'item' : 'itens'}`)}</span>
          {!missingLabel && <span className="font-mono font-bold">{formatBRL(product.price * effectiveQuantity)}</span>}
        </Button>
        {canRepeat && !missingLabel && <button type="button" onClick={() => handleConfirm(true)} className="min-h-[44px] w-full text-[15px] font-semibold text-brand-700">Adicionar e pedir outro diferente</button>}
      </div>
    </WaiterSheet>
  );
}

export function WaiterDonenessModal({ product, isOpen, onClose, onConfirm, maxQuantity, initial }: WaiterDonenessModalProps) {
  if (!isOpen || !product) return null;
  return <DonenessForm key={product.id} product={product} onClose={onClose} onConfirm={onConfirm} maxQuantity={maxQuantity} initial={initial} />;
}
