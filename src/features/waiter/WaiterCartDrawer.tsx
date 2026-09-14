import { Dialog } from '../../components/ui/Dialog';
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
    <Dialog label="Revisar pedido da mesa" onClose={onClose} placement="sheet">
      <div className="dialog-panel bg-surface-muted border-t sm:border border-line rounded-t-3xl sm:rounded-2xl w-full max-w-lg p-5 sm:p-6 shadow-card space-y-4 max-h-[92vh] flex flex-col fade-in zoom-in-95">
        
        {/* Topo do Drawer */}
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <div className="bg-brand-700 w-11 h-11 rounded-2xl text-white flex items-center justify-center shadow-card">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-ink text-base leading-tight font-sans">
                Resumo do Pedido — Mesa {String(table.number).padStart(2, '0')}
              </h3>
              <p className="text-xs text-ink-muted mt-0.5">
                {activeTab?.customer_name || 'Comanda Aberta'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-surface-muted transition"
            aria-label="Fechar"
           type="button">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensagem de Erro se houver */}
        {errorMessage && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-300 text-rose-800 text-xs flex items-center gap-2" role="alert">
            <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Lista de Itens do Carrinho */}
        <div className="overflow-y-auto flex-1 space-y-2.5 pr-1 text-xs">
          {items.length === 0 ? (
            <div className="py-12 text-center text-ink-muted space-y-2">
              <ShoppingBag className="w-10 h-10 mx-auto opacity-30" />
              <p className="font-medium">Nenhum item adicionado ao rascunho.</p>
            </div>
          ) : (
            items.map((item: CartItem) => (
              <div
                key={item.id}
                className="p-3.5 rounded-2xl bg-surface-muted border border-line flex items-center justify-between gap-3 shadow-sm"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-ink text-sm truncate">
                    {item.product.name}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {item.doneness && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 tabular-nums font-bold">
                        {formatDoneness(item.doneness)}
                      </span>
                    )}
                    <span className="text-brand-700 tabular-nums font-bold">
                      {formatBRL(item.product.price)} un
                    </span>
                  </div>
                  {item.notes && (
                    <div className="text-xs text-ink-muted italic mt-1">
                      Obs: {item.notes}
                    </div>
                  )}
                </div>

                {/* Controles de Quantidade */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQuantity(table.id, item.id, -1)}
                    className="btn-secondary w-8 h-8 rounded-xl font-bold flex items-center justify-center transition"
                   type="button" aria-label="Diminuir quantidade">
                    -
                  </button>
                  <span className="tabular-nums font-bold text-sm text-ink w-6 text-center">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(table.id, item.id, 1)}
                    className="btn-primary w-8 h-8 rounded-xl font-bold flex items-center justify-center transition shadow-sm"
                   type="button" aria-label="Aumentar quantidade">
                    +
                  </button>
                  <button
                    onClick={() => removeItem(table.id, item.id)}
                    className="p-2 rounded-xl text-ink-muted hover:text-rose-700 hover:bg-rose-50 transition ml-1"
                    aria-label="Remover item"
                   type="button">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Rodapé: Total e Envio */}
        {items.length > 0 && (
          <div className="border-t border-line pt-4 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-ink-muted font-medium">Subtotal deste Lançamento:</span>
              <span className="text-2xl font-bold text-brand-700 tabular-nums">
                {formatBRL(total)}
              </span>
            </div>

            <button
              disabled={isSubmitting}
              onClick={handleSendOrder}
              className="btn-primary w-full py-4 rounded-2xl text-sm font-bold shadow-card transition flex items-center justify-center gap-2 disabled:opacity-50"
             type="button">
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
    </Dialog>
  );
};
