import { AlertCircle, Send, ShoppingBag, X } from 'lucide-react';
import { useState } from 'react';
import { CartItemRow } from '../../components/ui/CartItemRow';
import { Dialog } from '../../components/ui/Dialog';
import { formatBRL } from '../../lib/formatters';
import { useAuthStore } from '../../stores/useAuthStore';
import { useCartStore } from '../../stores/useCartStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useTableStore } from '../../stores/useTableStore';
import type { RestaurantTable } from '../../types/domain';

interface WaiterCartDrawerProps { table: RestaurantTable; isOpen: boolean; onClose: () => void; onSuccess: () => void; }

export function WaiterCartDrawer({ table, isOpen, onClose, onSuccess }: WaiterCartDrawerProps) {
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

  const handleSendOrder = () => {
    if (!currentShift || currentShift.status !== 'ABERTO') { setErrorMessage('Abra um turno antes de enviar o pedido.'); return; }
    if (!activeTab) { setErrorMessage('Comanda não encontrada para esta mesa.'); return; }
    if (!items.length) { setErrorMessage('Adicione um produto antes de enviar o pedido.'); return; }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      addOrderAtomic(currentShift.id, activeTab.id, items.map((item) => ({ productId: item.product.id, quantity: item.quantity, doneness: item.doneness, notes: item.notes || undefined })), currentProfile.id);
      clearCart(table.id);
      onSuccess();
      onClose();
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível enviar o pedido. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog label={`Revisar pedido da mesa ${table.number}`} onClose={onClose} placement="sheet">
      <div className="dialog-panel flex w-full max-w-lg flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div className="flex items-start gap-3"><span className="icon-tile"><ShoppingBag className="h-5 w-5" aria-hidden="true" /></span><div><h2 className="text-lg font-bold text-ink">Revisar pedido · Mesa {String(table.number).padStart(2, '0')}</h2><p className="mt-1 text-xs text-ink-muted">{activeTab?.customer_name || 'Comanda aberta'}</p></div></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar revisão do pedido"><X className="h-5 w-5" /></button>
        </div>
        {errorMessage && <div className="notice mx-5 mt-4 border-rose-200 bg-rose-50 text-rose-800" role="alert"><AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />{errorMessage}</div>}
        <div className="flex-1 overflow-y-auto p-5">
          {items.length ? <ul className="space-y-3">{items.map((item) => <CartItemRow key={item.id} name={item.product.name} unitPrice={item.product.price} quantity={item.quantity} doneness={item.doneness} notes={item.notes} onQuantityChange={(delta) => updateQuantity(table.id, item.id, delta)} onRemove={() => removeItem(table.id, item.id)} />)}</ul> : <div className="rounded-xl bg-surface-soft p-6 text-center"><ShoppingBag className="mx-auto mb-3 h-8 w-8 text-ink-muted" aria-hidden="true" /><p className="text-sm text-ink-muted">Nenhum item neste rascunho.</p><button type="button" onClick={onClose} className="btn-secondary mt-4">Escolher produtos</button></div>}
        </div>
        {items.length > 0 && <div className="space-y-4 border-t border-line p-5"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-ink-secondary">Subtotal deste pedido</span><span className="text-2xl font-bold text-brand-800 tabular-nums">{formatBRL(total)}</span></div><button type="button" disabled={isSubmitting} onClick={handleSendOrder} className="btn-primary w-full py-3.5"><Send className="h-4 w-4" aria-hidden="true" />{isSubmitting ? 'Validando e enviando...' : 'Enviar à produção'}</button><p className="text-center text-xs text-ink-muted">Os itens serão enviados aos seus respectivos setores.</p></div>}
      </div>
    </Dialog>
  );
}
