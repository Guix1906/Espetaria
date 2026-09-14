import React, { useState } from 'react';
import { X, Check, Flame, MessageSquare } from 'lucide-react';
import { Product } from '../../types/domain';
import { MeatDoneness } from '../../types/enums';
import { formatBRL } from '../../lib/formatters';

interface WaiterDonenessModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (doneness: MeatDoneness, notes: string, quantity: number) => void;
}

const DONENESS_OPTIONS: { value: MeatDoneness; label: string; desc: string }[] = [
  { value: 'MAL_PASSADA', label: 'Mal Passada', desc: 'Selada por fora, centro vermelho vivo' },
  { value: 'AO_PONTO_PARA_MAL', label: 'Ao Ponto p/ Mal', desc: 'Centro bem rosado e muito suculenta' },
  { value: 'AO_PONTO', label: 'Ao Ponto', desc: 'Ponto padrão da casa, centro rosado' },
  { value: 'AO_PONTO_PARA_BEM', label: 'Ao Ponto p/ Bem', desc: 'Apenas levemente rosada no centro' },
  { value: 'BEM_PASSADA', label: 'Bem Passada', desc: 'Totalmente cozida, tostada e sem sangue' },
];

const COMMON_NOTES = ['Sem sal grosso', 'Pouco sal', 'Mais torradinho', 'Cortar em aperitivo', 'Farofa à parte'];

export const WaiterDonenessModal: React.FC<WaiterDonenessModalProps> = ({
  product,
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [selectedDoneness, setSelectedDoneness] = useState<MeatDoneness>('AO_PONTO');
  const [quantity, setQuantity] = useState<number>(1);
  const [notes, setNotes] = useState<string>('');

  if (!isOpen || !product) return null;

  const handleToggleNote = (noteTag: string) => {
    if (notes.includes(noteTag)) {
      setNotes(notes.replace(noteTag, '').replace(/,\s*,/g, ',').trim());
    } else {
      setNotes(notes ? `${notes}, ${noteTag}` : noteTag);
    }
  };

  const handleConfirm = () => {
    onConfirm(selectedDoneness, notes.trim(), quantity);
    onClose();
    setQuantity(1);
    setNotes('');
    setSelectedDoneness('AO_PONTO');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-[#14151f] border-t sm:border border-white/15 rounded-t-3xl sm:rounded-3xl w-full max-w-lg p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95">
        
        {/* Cabeçalho */}
        <div className="flex items-start justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-orange-500/20">
              <Flame className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-white leading-tight">
                {product.name}
              </h3>
              <p className="text-xs text-amber-400 font-mono font-bold mt-0.5">
                {formatBRL(product.price)} por espeto
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quantidade */}
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#090a0f] border border-white/10">
          <span className="text-xs font-black text-stone-300 uppercase tracking-wider">Quantidade</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xl flex items-center justify-center transition active:scale-95 border border-white/10"
            >
              -
            </button>
            <span className="font-mono font-black text-2xl text-white w-8 text-center">
              {quantity}
            </span>
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="w-10 h-10 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-xl flex items-center justify-center transition active:scale-95 shadow-md shadow-orange-500/20"
            >
              +
            </button>
          </div>
        </div>

        {/* Seleção do Ponto da Carne */}
        <div className="space-y-2">
          <label className="block text-xs font-black text-stone-300 uppercase tracking-wider">
            Ponto da Carne (Selecione um)
          </label>
          <div className="space-y-1.5">
            {DONENESS_OPTIONS.map((opt) => {
              const isSelected = selectedDoneness === opt.value;
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setSelectedDoneness(opt.value)}
                  className={`w-full p-3.5 rounded-2xl border text-left transition flex items-center justify-between active:scale-[0.98] ${
                    isSelected
                      ? 'bg-gradient-to-r from-orange-500/20 to-amber-500/10 border-orange-500 text-white shadow-md shadow-orange-500/15'
                      : 'bg-[#090a0f] border-white/10 text-stone-300 hover:bg-white/5'
                  }`}
                >
                  <div>
                    <div className="font-bold text-sm flex items-center gap-2">
                      <span>{opt.label}</span>
                      {opt.value === 'AO_PONTO' && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                          Padrão da Casa
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-stone-400 mt-0.5">{opt.desc}</div>
                  </div>
                  {isSelected && (
                    <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                      <Check className="w-4 h-4" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Observações Rápidas */}
        <div className="space-y-2">
          <label className="block text-xs font-black text-stone-300 uppercase tracking-wider flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
            <span>Observações de Preparo</span>
          </label>
          
          <div className="flex flex-wrap gap-1.5">
            {COMMON_NOTES.map((tag) => (
              <button
                type="button"
                key={tag}
                onClick={() => handleToggleNote(tag)}
                className={`text-xs px-3 py-1.5 rounded-xl border transition ${
                  notes.includes(tag)
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                    : 'bg-[#090a0f] border-white/10 text-stone-400 hover:text-white'
                }`}
              >
                + {tag}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Ex: Cortar em aperitivo, sem cebola..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-[#090a0f] border border-white/10 rounded-2xl px-3.5 py-2.5 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-orange-500 transition"
          />
        </div>

        {/* Botão de Adicionar */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleConfirm}
            className="w-full py-4 rounded-2xl btn-ember text-sm uppercase tracking-wider active:scale-95 transition flex items-center justify-center gap-2 shadow-xl shadow-orange-500/25"
          >
            <span>Adicionar {quantity}x ao Pedido</span>
            <span className="font-mono font-black">({formatBRL(product.price * quantity)})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
