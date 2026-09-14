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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border-t sm:border border-slate-700 rounded-t-3xl sm:rounded-2xl w-full max-w-lg p-5 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        
        {/* Cabeçalho */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-600/20 text-rose-400 border border-rose-600/30 flex items-center justify-center shrink-0">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">
                {product.name}
              </h3>
              <p className="text-xs text-amber-400 font-mono font-semibold">
                {formatBRL(product.price)} por espeto
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quantidade */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-slate-800">
          <span className="text-xs font-semibold text-slate-300 uppercase">Quantidade</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="w-9 h-9 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold text-lg flex items-center justify-center transition active:scale-95"
            >
              -
            </button>
            <span className="font-mono font-black text-xl text-white w-8 text-center">
              {quantity}
            </span>
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="w-9 h-9 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold text-lg flex items-center justify-center transition active:scale-95"
            >
              +
            </button>
          </div>
        </div>

        {/* Seleção do Ponto da Carne */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide">
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
                  className={`w-full p-3 rounded-xl border text-left transition flex items-center justify-between ${
                    isSelected
                      ? 'bg-rose-950/70 border-rose-600 text-white shadow-md'
                      : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div>
                    <div className="font-bold text-sm flex items-center gap-2">
                      <span>{opt.label}</span>
                      {opt.value === 'AO_PONTO' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-normal">
                          Padrão
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{opt.desc}</div>
                  </div>
                  {isSelected && (
                    <div className="w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center shrink-0">
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
          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
            <span>Observações do Pedido</span>
          </label>
          
          <div className="flex flex-wrap gap-1.5">
            {COMMON_NOTES.map((tag) => (
              <button
                type="button"
                key={tag}
                onClick={() => handleToggleNote(tag)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition ${
                  notes.includes(tag)
                    ? 'bg-amber-600 border-amber-500 text-white font-semibold'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                + {tag}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Digite outra observação se necessário..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
          />
        </div>

        {/* Botão de Adicionar */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleConfirm}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold text-sm uppercase tracking-wide shadow-lg shadow-rose-950/60 active:scale-95 transition flex items-center justify-center gap-2"
          >
            <span>Adicionar {quantity}x ao Pedido</span>
            <span className="font-mono">({formatBRL(product.price * quantity)})</span>
          </button>
        </div>

      </div>
    </div>
  );
};
