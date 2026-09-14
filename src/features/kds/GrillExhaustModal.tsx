import { Dialog } from '../../components/ui/Dialog';
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
    <Dialog label="Disponibilidade dos espetos" onClose={onClose}>
      <div className="dialog-panel bg-surface-muted border border-line rounded-2xl w-full max-w-2xl p-5 sm:p-6 shadow-card space-y-4 max-h-[92vh] flex flex-col fade-in zoom-in-95">
        
        {/* Topo do Modal */}
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shadow-sm">
              <Flame className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-ink text-lg leading-tight font-sans">
                Controle Rápido de Esgotamento
              </h3>
              <p className="text-xs text-ink-muted mt-0.5">
                Esgote ou reative espetos em &lt; 100ms para todos os garçons e delivery
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl text-ink-muted hover:text-ink hover:bg-surface-muted transition"
           type="button" aria-label="Fechar janela">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal interno de confirmação com motivo */}
        {selectedProductId && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 space-y-3 fade-in zoom-in-95 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-900 font-bold text-sm">
                <AlertOctagon className="w-5 h-5 text-rose-700" />
                <span>Esgotar {products.find((p) => p.id === selectedProductId)?.name}?</span>
              </div>
              <button
                onClick={() => setSelectedProductId(null)}
                className="text-xs text-ink-muted hover:text-ink"
               type="button">
                Cancelar
              </button>
            </div>

            <div>
              <label className="text-xs text-ink font-semibold mb-1 block" htmlFor="grillexhaustmodal-field-1">
                Motivo do Esgotamento Imediato:
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-muted border border-rose-300 text-ink text-xs focus:ring-2 focus:ring-brand-600 focus:outline-none"
               aria-label="Motivo do Esgotamento Imediato:" id="grillexhaustmodal-field-1">
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
                className="flex-1 py-3 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs transition shadow-sm flex items-center justify-center gap-2"
               type="button">
                <AlertOctagon className="w-4 h-4" />
                <span>Confirmar Bloqueio Imediato</span>
              </button>
              <button
                onClick={() => setSelectedProductId(null)}
                className="btn-secondary px-4 py-3 rounded-xl text-xs"
               type="button">
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
                    ? 'bg-rose-50 border-rose-200 text-ink-muted'
                    : 'bg-surface-muted border-line text-ink hover:border-line'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-ink truncate">
                      {prod.name}
                    </span>
                    {isExhausted ? (
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 font-bold">
                        ESGOTADO
                      </span>
                    ) : (
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold">
                        DISPONÍVEL
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-ink-muted">
                    <span>
                      Estoque disponível:{' '}
                      <strong className={remaining <= 5 ? 'text-amber-800 tabular-nums font-bold' : 'text-emerald-700 tabular-nums font-bold'}>
                        {remaining} espetos
                      </strong>
                    </span>
                    {stock?.exhaust_reason && isExhausted && (
                      <span className="text-rose-700 italic truncate max-w-[200px]">
                        Motivo: {stock.exhaust_reason}
                      </span>
                    )}
                  </div>
                </div>

                {/* Botão de Ação 1-Tap */}
                <button
                  onClick={() => handleToggle(prod.id, isExhausted)}
                  className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center gap-2 shrink-0 ${
                    isExhausted
                      ? 'btn-success text-white shadow-sm'
                      : 'bg-rose-700 hover:bg-rose-800 text-white shadow-sm'
                  }`}
                 type="button">
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
        <div className="pt-3 border-t border-line flex items-center justify-between text-xs text-ink-muted">
          <span>* Ao esgotar, o item congela imediatamente nos celulares dos garçons e delivery.</span>
          <button
            onClick={onClose}
            className="btn-secondary px-4 py-2 rounded-xl text-xs"
           type="button">
            Fechar
          </button>
        </div>

      </div>
    </Dialog>
  );
};
