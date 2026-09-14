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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-[#14151f] border-t sm:border border-white/15 rounded-t-3xl sm:rounded-3xl w-full max-w-lg p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95">
        
        {/* Topo do Drawer */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-white text-base leading-tight font-brand">
                Resumo do Pedido — Mesa {String(table.number).padStart(2, '0')}
              </h3>
              <p className="text-xs text-stone-400 mt-0.5">
                {activeTab?.customer_name || 'Comanda Aberta'}
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

        {/* Mensagem de Erro se houver */}
        {errorMessage && (
          <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Lista de Itens do Carrinho */}
        <div className="overflow-y-auto flex-1 space-y-2.5 pr-1 text-xs">
          {items.length === 0 ? (
            <div className="py-12 text-center text-stone-500 space-y-2">
              <ShoppingBag className="w-10 h-10 mx-auto opacity-30" />
              <p className="font-medium">Nenhum item adicionado ao rascunho.</p>
            </div>
          ) : (
            items.map((item: CartItem) => (
              <div
                key={item.id}
                className="p-3.5 rounded-2xl bg-[#090a0f] border border-white/10 flex items-center justify-between gap-3 shadow-md"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white text-sm truncate">
                    {item.product.name}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {item.doneness && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono font-bold">
                        {formatDoneness(item.doneness)}
                      </span>
                    )}
                    <span className="text-amber-400 font-mono font-bold">
                      {formatBRL(item.product.price)} un
                    </span>
                  </div>
                  {item.notes && (
                    <div className="text-[11px] text-stone-400 italic mt-1">
                      Obs: {item.notes}
                    </div>
                  )}
                </div>

                {/* Controles de Quantidade */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQuantity(table.id, item.id, -1)}
                    className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold flex items-center justify-center transition active:scale-95 border border-white/10"
                  >
                    -
                  </button>
                  <span className="font-mono font-black text-sm text-white w-6 text-center">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(table.id, item.id, 1)}
                    className="w-8 h-8 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold flex items-center justify-center transition active:scale-95 shadow-sm shadow-orange-500/20"
                  >
                    +
                  </button>
                  <button
                    onClick={() => removeItem(table.id, item.id)}
                    className="p-2 rounded-xl text-stone-500 hover:text-rose-400 hover:bg-rose-500/10 transition ml-1"
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
          <div className="border-t border-white/10 pt-4 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-stone-400 font-medium">Subtotal deste Lançamento:</span>
              <span className="text-2xl font-black text-amber-400 font-mono">
                {formatBRL(total)}
              </span>
            </div>

            <button
              disabled={isSubmitting}
              onClick={handleSendOrder}
              className="w-full py-4 rounded-2xl btn-ember text-sm uppercase tracking-wider font-black shadow-xl shadow-orange-500/30 active:scale-95 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Validando estoque e enviando...</span>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>🔥 Enviar à Brasa & Cozinha</span>
                </>
              )}
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
