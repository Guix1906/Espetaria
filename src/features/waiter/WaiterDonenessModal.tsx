import { Check,Flame,Minus,Plus,X } from 'lucide-react';
import { useState } from 'react';
import { Dialog } from '../../components/ui/Dialog';
import { formatBRL } from '../../lib/formatters';
import type { Product } from '../../types/domain';
import type { MeatDoneness } from '../../types/enums';

interface WaiterDonenessModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (doneness: MeatDoneness, notes: string, quantity: number) => void;
}

const DONENESS_OPTIONS: { value: MeatDoneness; label: string; description: string; swatch: string }[] = [
  { value: 'MAL_PASSADA', label: 'Mal passada', description: 'Selada por fora, centro vermelho.', swatch: 'bg-rose-600' },
  { value: 'AO_PONTO_PARA_MAL', label: 'Ao ponto para mal', description: 'Centro bem rosado e suculento.', swatch: 'bg-rose-400' },
  { value: 'AO_PONTO', label: 'Ao ponto', description: 'Centro rosado. O padrão da casa.', swatch: 'bg-orange-400' },
  { value: 'AO_PONTO_PARA_BEM', label: 'Ao ponto para bem', description: 'Levemente rosada no centro.', swatch: 'bg-amber-700' },
  { value: 'BEM_PASSADA', label: 'Bem passada', description: 'Totalmente cozida e bem tostada.', swatch: 'bg-stone-700' },
];
const COMMON_NOTES = ['Sem sal grosso', 'Pouco sal', 'Mais torradinho', 'Cortar em aperitivo', 'Farofa à parte'];

function DonenessForm({ product, onClose, onConfirm }: { product: Product; onClose: () => void; onConfirm: WaiterDonenessModalProps['onConfirm'] }) {
  const [selectedDoneness, setSelectedDoneness] = useState<MeatDoneness>('AO_PONTO');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const noteTags = notes.split(',').map((note) => note.trim()).filter(Boolean);

  const toggleNote = (tag: string) => {
    setNotes((noteTags.includes(tag) ? noteTags.filter((note) => note !== tag) : [...noteTags, tag]).join(', '));
  };

  return (
    <Dialog label={`Personalizar ${product.name}`} onClose={onClose} placement="sheet">
      <div className="dialog-panel flex w-full max-w-lg flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-line p-5 sm:p-6">
          <div className="flex items-start gap-3"><div className="icon-tile bg-accent-50 text-accent-700"><Flame className="h-5 w-5" aria-hidden="true" /></div><div><h2 className="font-bold text-ink">{product.name}</h2><p className="mt-1 text-sm text-ink-muted">{formatBRL(product.price)} por unidade</p></div></div>
          <button type="button" className="icon-button" aria-label="Fechar personalização" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-soft p-3"><span className="text-sm font-semibold">Quantidade</span><div className="flex items-center gap-3"><button type="button" className="icon-button" aria-label="Diminuir quantidade" disabled={quantity <= 1} onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus className="h-4 w-4" /></button><output aria-live="polite" className="w-8 text-center text-xl font-bold tabular-nums">{quantity}</output><button type="button" className="icon-button border-brand-200 bg-brand-50 text-brand-800" aria-label="Aumentar quantidade" onClick={() => setQuantity(quantity + 1)}><Plus className="h-4 w-4" /></button></div></div>
          <fieldset className="space-y-2.5"><legend className="mb-3 text-sm font-semibold text-ink">Como você prefere o ponto?</legend>
            {DONENESS_OPTIONS.map((option) => <label key={option.value} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors ${selectedDoneness === option.value ? 'border-brand-600 bg-brand-50' : 'border-line bg-surface hover:bg-surface-soft'}`}><input type="radio" name="meat-doneness" value={option.value} checked={selectedDoneness === option.value} onChange={() => setSelectedDoneness(option.value)} className="h-4 w-4 shrink-0" /><span className={`h-7 w-2 shrink-0 rounded-full ${option.swatch}`} aria-hidden="true" /><span className="flex-1"><span className="block text-sm font-semibold text-ink">{option.label}</span><span className="mt-0.5 block text-xs text-ink-muted">{option.description}</span></span>{selectedDoneness === option.value && <Check className="h-4 w-4 text-brand-700" aria-hidden="true" />}</label>)}
          </fieldset>
          <div><label htmlFor="doneness-notes" className="mb-2 block text-sm font-semibold">Alguma observação?</label><div className="mb-3 flex flex-wrap gap-2">{COMMON_NOTES.map((tag) => <button key={tag} type="button" aria-pressed={noteTags.includes(tag)} onClick={() => toggleNote(tag)} className={`rounded-xl border px-3 py-2 text-xs font-medium ${noteTags.includes(tag) ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-line bg-surface text-ink-secondary hover:bg-surface-muted'}`}>{noteTags.includes(tag) ? <Check className="mr-1 inline h-3 w-3" aria-hidden="true" /> : '+ '}{tag}</button>)}</div><textarea id="doneness-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex.: Cortar em aperitivo, sem cebola..." className="w-full rounded-xl border border-line-strong p-3 text-sm" /></div>
        </div>
        <div className="border-t border-line p-5 sm:px-6"><button type="button" onClick={() => { onConfirm(selectedDoneness, notes.trim(), quantity); onClose(); }} className="btn-primary w-full flex-wrap justify-between gap-2 py-3.5"><span>Adicionar {quantity} {quantity === 1 ? 'item' : 'itens'}</span><span className="font-bold tabular-nums">{formatBRL(product.price * quantity)}</span></button></div>
      </div>
    </Dialog>
  );
}

export function WaiterDonenessModal({ product, isOpen, onClose, onConfirm }: WaiterDonenessModalProps) {
  if (!isOpen || !product) return null;
  return <DonenessForm key={product.id} product={product} onClose={onClose} onConfirm={onConfirm} />;
}
