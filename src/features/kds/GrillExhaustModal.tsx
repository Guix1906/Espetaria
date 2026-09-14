import React, { useState } from 'react';
import { X, Flame, AlertOctagon, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useStockStore } from '../../stores/useStockStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useAuthStore } from '../../stores/useAuthStore';

interface GrillExhaustModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const COMMON_REASONS = [
  'Acabou carne temperada',
  'Queima excessiva na brasa',
  'Defeito no espeto/montagem',
  'Bloqueio preventivo pelo churrasqueiro',
  'Fim da cota do turno',
];

export const GrillExhaustModal: React.FC<GrillExhaustModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { products, dailyPrepStock, toggleExhaustProduct } = useStockStore();
  const { currentShift } = useShiftStore();
  const { currentProfile } = useAuthStore();

  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [reason, setReason] = useState<string>(COMMON_REASONS[0] || 'Acabou carne temperada');

  if (!isOpen) return null;

  // Filtra apenas produtos de churrasqueira (espetos)
  const grillProducts = products.filter((p) => p.sector === 'GRILL');

  const handleToggle = (productId: string, currentExhausted: boolean) => {
    if (!currentShift) return;

    if (currentExhausted) {
      // Reativar espeto
      toggleExhaustProduct(currentShift.id, productId, false, currentProfile.id);
      setSelectedProductId(null);
    } else {
      // Abrir confirmação de motivo ou esgotar direto com o motivo selecionado
      setSelectedProductId(productId);
    }
  };

  const confirmExhaustion = () => {
    if (!currentShift || !selectedProductId) return;

    toggleExhaustProduct(
      currentShift.id,
      selectedProductId,
      true,
      currentProfile.id,
      reason
    );
    setSelectedProductId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md">
      <div className="card-carbon border border-carbon-700 rounded-3xl w-full max-w-2xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
        
        {/* Topo do Modal */}
        <div className="flex items-center justify-between border-b border-carbon-800 pb-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-ruby-950/80 border border-ruby-600/50 text-ruby-400 flex items-center justify-center shadow-lg shadow-ruby-950/50">
              <Flame className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-white text-lg leading-tight font-serif">
                Controle Rápido de Esgotamento
              </h3>
              <p className="text-xs text-obsidian-400 mt-0.5">
                Esgote ou reative espetos em &lt; 100ms para todos os garçons e delivery
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl text-obsidian-400 hover:text-white hover:bg-carbon-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal interno de confirmação com motivo */}
        {selectedProductId && (
          <div className="p-4 rounded-2xl bg-ruby-950/50 border border-ruby-600/70 space-y-3 animate-in fade-in zoom-in-95 shadow-xl shadow-ruby-950/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-ruby-300 font-bold text-sm">
                <AlertOctagon className="w-5 h-5 text-ruby-400" />
                <span>Esgotar {products.find((p) => p.id === selectedProductId)?.name}?</span>
              </div>
              <button
                onClick={() => setSelectedProductId(null)}
                className="text-xs text-obsidian-400 hover:text-white"
              >
                Cancelar
              </button>
            </div>

            <div>
              <label className="text-xs text-obsidian-300 font-semibold mb-1 block">
                Motivo do Esgotamento Imediato:
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-obsidian-900 border border-ruby-700/60 text-white text-xs focus:ring-2 focus:ring-ruby-500 focus:outline-none"
              >
                {COMMON_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                onClick={confirmExhaustion}
                className="flex-1 py-3 rounded-xl bg-ruby-600 hover:bg-ruby-500 text-white font-bold text-xs uppercase tracking-wider transition active:scale-95 shadow-lg shadow-ruby-950/50 flex items-center justify-center gap-2"
              >
                <AlertOctagon className="w-4 h-4" />
                <span>Confirmar Bloqueio Imediato</span>
              </button>
              <button
                onClick={() => setSelectedProductId(null)}
                className="btn-carbon px-4 py-3 rounded-xl text-xs"
              >
                Voltar
              </button>
            </div>
          </div>
        )}

        {/* Grade de Espetos */}
        <div className="overflow-y-auto flex-1 pr-1 space-y-2.5 custom-scrollbar">
          {grillProducts.map((prod) => {
            const stock = dailyPrepStock.find((s) => s.product_id === prod.id);
            const isExhausted = stock ? stock.is_exhausted || stock.current_quantity <= 0 : false;
            const remaining = stock ? stock.current_quantity : 0;

            return (
              <div
                key={prod.id}
                className={`p-3.5 sm:p-4 rounded-2xl border transition flex items-center justify-between gap-3 ${
                  isExhausted
                    ? 'bg-ruby-950/25 border-ruby-800/60 text-obsidian-400'
                    : 'bg-carbon-800/70 border-carbon-700/80 text-white hover:border-carbon-600'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white truncate">
                      {prod.name}
                    </span>
                    {isExhausted ? (
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-ruby-900/80 text-ruby-300 border border-ruby-600 font-bold uppercase tracking-wider animate-pulse">
                        ESGOTADO
                      </span>
                    ) : (
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-700/70 font-semibold">
                        DISPONÍVEL
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-obsidian-400">
                    <span>
                      Estoque disponível:{' '}
                      <strong className={remaining <= 5 ? 'text-gold-400 font-mono font-bold' : 'text-emerald-400 font-mono font-bold'}>
                        {remaining} espetos
                      </strong>
                    </span>
                    {stock?.exhaust_reason && isExhausted && (
                      <span className="text-ruby-400/90 italic truncate max-w-[200px]">
                        Motivo: {stock.exhaust_reason}
                      </span>
                    )}
                  </div>
                </div>

                {/* Botão de Ação 1-Tap */}
                <button
                  onClick={() => handleToggle(prod.id, isExhausted)}
                  className={`px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition active:scale-95 flex items-center gap-2 shrink-0 ${
                    isExhausted
                      ? 'btn-emerald text-white shadow-md'
                      : 'bg-ruby-600 hover:bg-ruby-500 text-white shadow-md shadow-ruby-950/50'
                  }`}
                >
                  {isExhausted ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Reativar</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4" />
                      <span>Esgotar</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Rodapé Informativo */}
        <div className="pt-3 border-t border-carbon-800 flex items-center justify-between text-xs text-obsidian-400">
          <span>* Ao esgotar, o item congela imediatamente nos celulares dos garçons e delivery.</span>
          <button
            onClick={onClose}
            className="btn-carbon px-4 py-2 rounded-xl text-xs"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
