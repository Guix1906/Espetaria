import { Button } from '../../components/ui/Button';
import { AlertCircle, Minus, Pencil, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { formatBRL } from '../../lib/formatters';
import { remainingFor } from '../../lib/comboStock';
import { useAuthStore } from '../../stores/useAuthStore';
import { useCartStore } from '../../stores/useCartStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useStockStore } from '../../stores/useStockStore';
import { DONENESS_OPTIONS, WaiterDonenessModal } from './WaiterDonenessModal';
import { useTableStore } from '../../stores/useTableStore';
import type { RestaurantTable } from '../../types/domain';
import { WaiterSheet } from './WaiterSheet';

interface WaiterCartDrawerProps { table: RestaurantTable; isOpen: boolean; onClose: () => void; onSuccess: () => void; }

export function WaiterCartDrawer({ table, isOpen, onClose, onSuccess }: WaiterCartDrawerProps) {
  const { getCart, clearCart, getCartTotal, updateQuantity, removeItem, updateItem } = useCartStore();
  const { addOrderAtomic, getTabByTableId } = useTableStore();
  const { currentShift } = useShiftStore();
  const { currentProfile } = useAuthStore();
  const { dailyPrepStock, products } = useStockStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  if (!isOpen) return null;
  const items = getCart(table.id);
  const total = getCartTotal(table.id);
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const activeTab = getTabByTableId(table.id);
  const editing = items.find((item) => item.id === editingId) ?? null;

  // Limite de estoque ao aumentar: mostra o motivo em vez de falhar calado
  const run = (action: () => void) => {
    try { action(); setErrorMessage(null); } catch (error: unknown) { setErrorMessage(error instanceof Error ? error.message : 'Não foi possível alterar o item.'); }
  };
  // Na alteração, o próprio item volta a contar como disponível
  const editMax = (() => {
    if (!editing) return undefined;
    const left = remainingFor(editing.product, products, dailyPrepStock, items.filter((i) => i.id !== editing.id));
    return left === null ? undefined : Math.max(1, left);
  })();

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
    <WaiterSheet label={`Revisar pedido da mesa ${table.number}`} onClose={onClose}>
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 pb-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-500"><ShoppingBag className="h-5 w-5" aria-hidden="true" /></span>
          <div className="min-w-0"><h2 className="text-xl font-semibold leading-tight text-ink">Revisar pedido · Mesa {String(table.number).padStart(2, '0')}</h2><p className="mt-0.5 text-[13px] text-ink-muted">{count} {count === 1 ? 'item' : 'itens'}</p></div>
        </div>
        <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line text-ink" onClick={onClose} aria-label="Fechar revisão do pedido"><X className="h-5 w-5" /></button>
      </div>
      {errorMessage && <div className="notice mx-4 mt-3 border-rose-200 bg-rose-50 text-rose-800" role="alert"><AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />{errorMessage}</div>}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {items.length ? <ul className="space-y-2.5">{items.map((item) => (
          <li key={item.id} className="rounded-lg border border-line bg-white p-3.5">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-semibold text-ink">{item.product.name}</h3>
              <button type="button" className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center text-ink-muted" onClick={() => removeItem(table.id, item.id)} aria-label={`Remover ${item.product.name}`}><Trash2 className="h-4 w-4" /></button>
            </div>
            {item.product.allows_doneness && (
              <div className="mt-1 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={`Ponto de ${item.product.name}`}>
                {DONENESS_OPTIONS.map((option) => (
                  <button key={option.value} type="button" role="radio" aria-checked={item.doneness === option.value} onClick={() => run(() => updateItem(table.id, item.id, { quantity: item.quantity, doneness: option.value, notes: item.notes }))}
                    className={`h-10 rounded-md border text-[13px] font-medium ${item.doneness === option.value ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white text-ink'}`}>{option.label}</button>
                ))}
              </div>
            )}
            {item.notes && <p className="mt-2 text-[13px] text-ink-secondary">Obs.: {item.notes}</p>}
            {item.product.allows_notes && (
              <button type="button" onClick={() => { setErrorMessage(null); setEditingId(item.id); }} className="mt-1.5 flex min-h-[40px] items-center gap-1.5 text-sm font-medium text-brand-700 underline underline-offset-2">
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />{item.notes ? 'Alterar observação' : 'Adicionar observação'}
              </button>
            )}
            <div className="mt-2 flex items-center justify-between gap-3">
              <div><p className="font-mono text-[17px] font-bold text-brand-700">{formatBRL(item.product.price * item.quantity)}</p><p className="font-mono text-xs text-ink-muted">{formatBRL(item.product.price)} cada</p></div>
              <div className="flex items-center gap-2">
                <button type="button" className="flex h-11 w-11 items-center justify-center rounded-md border border-line-strong" onClick={() => run(() => updateQuantity(table.id, item.id, -1))} aria-label={`Diminuir ${item.product.name}`}><Minus className="h-4 w-4" /></button>
                <output className="w-7 text-center font-mono text-lg font-bold" aria-live="polite">{item.quantity}</output>
                <button type="button" className="flex h-11 w-11 items-center justify-center rounded-md border border-brand-200 bg-brand-50 text-brand-500" onClick={() => run(() => updateQuantity(table.id, item.id, 1))} aria-label={`Aumentar ${item.product.name}`}><Plus className="h-4 w-4" /></button>
              </div>
            </div>
          </li>
        ))}</ul> : <div className="rounded-xl bg-canvas p-6 text-center"><ShoppingBag className="mx-auto mb-3 h-8 w-8 text-ink-muted" aria-hidden="true" /><p className="text-sm text-ink-muted">Nenhum item neste rascunho.</p><button type="button" onClick={onClose} className="btn-secondary mt-4">Escolher produtos</button></div>}
      </div>
      {items.length > 0 && (
        <div className="space-y-3 border-t border-line px-4 pt-3" style={{ paddingBottom: 'max(0.875rem, env(safe-area-inset-bottom))' }}>
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[15px] text-ink-secondary">Subtotal deste pedido</span><span className="font-mono text-[26px] font-bold text-brand-700">{formatBRL(total)}</span></div>
          <Button size="lg" block disabled={isSubmitting} onClick={handleSendOrder} className="font-semibold">{isSubmitting ? 'Validando e enviando...' : 'Enviar à produção'}</Button>
          <p className="text-center text-xs text-ink-muted">Os itens serão enviados aos seus respectivos setores.</p>
        </div>
      )}
      <WaiterDonenessModal
        product={editing?.product ?? null}
        isOpen={!!editing}
        onClose={() => setEditingId(null)}
        maxQuantity={editMax}
        initial={editing ? { doneness: editing.doneness, notes: editing.notes, quantity: editing.quantity } : undefined}
        onConfirm={(doneness, notes, quantity) => { if (editing) updateItem(table.id, editing.id, { doneness, notes, quantity }); }}
      />
    </WaiterSheet>
  );
}
