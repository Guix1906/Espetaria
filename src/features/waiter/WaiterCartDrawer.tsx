import React, { useState } from 'react';
import { ShoppingBag, X, Send, Trash2, AlertCircle } from 'lucide-react';
import { useCartStore, CartItem } from '../../stores/useCartStore';
import { useTableStore } from '../../stores/useTableStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { RestaurantTable } from '../../types/domain';
import { formatBRL, formatDoneness } from '../../lib/formatters';

interface WaiterCartDrawerProps {
  table: RestaurantTable;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const WaiterCartDrawer: React.FC<WaiterCartDrawerProps> = ({
  table,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { getCart, updateQuantity, removeItem, clearCart, getCartTotal } = useCartStore();
  const { addOrderAtomic, getTabByTableId } = useTableStore();
  const { currentShift } = useShiftStore();
  const { currentProfile } = useAuthStore();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const items = getCart(table.id);
  const total = getCartTotal(table.id);
  const activeTab = getTabByTableId(table.id);

  const handleSendOrder = async () => {
    if (!currentShift) {
      setErrorMessage('Nenhum turno aberto.');
      return;
    }
    if (!activeTab) {
      setErrorMessage('Comanda não encontrada para esta mesa.');
      return;
    }
    if (items.length === 0) {
      setErrorMessage('O carrinho está vazio.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const orderInputs = items.map((i) => ({
        productId: i.product.id,
        quantity: i.quantity,
        doneness: i.doneness,
        notes: i.notes || undefined,
      }));

      // BAIXA ATÔMICA TRANSAÇÃO
      addOrderAtomic(
        currentShift.id,
        activeTab.id,
        orderInputs,
        currentProfile.id
      );

      clearCart(table.id);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao transmitir pedido.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border-t sm:border border-slate-700 rounded-t-3xl sm:rounded-2xl w-full max-w-lg p-5 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
        
        {/* Topo do Drawer */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-600/20 text-amber-400 border border-amber-600/30 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base leading-none">
                Resumo do Pedido — Mesa {String(table.number).padStart(2, '0')}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {activeTab?.customer_name || 'Comanda aberta'}
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

        {/* Mensagem de Erro se houver */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Lista de Itens do Carrinho */}
        <div className="overflow-y-auto flex-1 space-y-2.5 pr-1 text-xs">
          {items.length === 0 ? (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <ShoppingBag className="w-8 h-8 mx-auto opacity-40" />
              <p>Nenhum item selecionado para esta mesa.</p>
            </div>
          ) : (
            items.map((item: CartItem) => (
              <div
                key={item.id}
                className="p-3 rounded-xl bg-slate-800/70 border border-slate-700/80 flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white text-sm truncate">
                    {item.product.name}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.doneness && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 font-mono font-semibold">
                        {formatDoneness(item.doneness)}
                      </span>
                    )}
                    <span className="text-amber-400/90 font-mono">
                      {formatBRL(item.product.price)} un
                    </span>
                  </div>
                  {item.notes && (
                    <div className="text-[11px] text-amber-300/80 italic mt-0.5">
                      Obs: {item.notes}
                    </div>
                  )}
                </div>

                {/* Controles de Quantidade */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQuantity(table.id, item.id, -1)}
                    className="w-8 h-8 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold flex items-center justify-center transition active:scale-95"
                  >
                    -
                  </button>
                  <span className="font-mono font-black text-sm text-white w-6 text-center">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(table.id, item.id, 1)}
                    className="w-8 h-8 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold flex items-center justify-center transition active:scale-95"
                  >
                    +
                  </button>
                  <button
                    onClick={() => removeItem(table.id, item.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition ml-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Rodapé: Total e Envio */}
        {items.length > 0 && (
          <div className="border-t border-slate-800 pt-3 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-400">Total do Lançamento:</span>
              <span className="text-xl font-black text-amber-400 font-mono">
                {formatBRL(total)}
              </span>
            </div>

            <button
              disabled={isSubmitting}
              onClick={handleSendOrder}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm uppercase tracking-wide shadow-xl shadow-emerald-950/60 active:scale-95 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Validando estoque e enviando...</span>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Confirmar e Enviar Pedido</span>
                </>
              )}
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
