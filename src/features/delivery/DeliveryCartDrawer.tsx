import { AlertCircle, Banknote, Bike, CreditCard, MapPin, QrCode, Send, ShoppingBag, Store, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { CartItemRow } from '../../components/ui/CartItemRow';
import { Dialog } from '../../components/ui/Dialog';
import { deliveryPaymentLabel } from '../../lib/deliveryStatus';
import { formatBRL } from '../../lib/formatters';
import { useDeliveryStore } from '../../stores/useDeliveryStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import type { DeliveryOrderType, DeliveryPaymentMethod } from '../../types/domain';

interface DeliveryCartDrawerProps { isOpen: boolean; onClose: () => void; onOrderPlaced: () => void; }
const methods: { id: DeliveryPaymentMethod; icon: typeof QrCode }[] = [{ id: 'PIX', icon: QrCode }, { id: 'CARTAO_ENTREGA', icon: CreditCard }, { id: 'DINHEIRO', icon: Banknote }];
const orderTypes: { id: DeliveryOrderType; label: string; icon: typeof Bike }[] = [{ id: 'DELIVERY', label: 'Entrega', icon: Bike }, { id: 'PICKUP', label: 'Retirar no local', icon: Store }];
const inputClass = 'w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink';
const labelClass = 'mb-1.5 block text-sm font-medium text-ink-secondary';

export function DeliveryCartDrawer({ isOpen, onClose, onOrderPlaced }: DeliveryCartDrawerProps) {
  const { cart, removeFromCart, updateCartQuantity, submitDeliveryOrder, zones } = useDeliveryStore();
  const { currentShift } = useShiftStore();
  const { settings } = useSettingsStore();
  const [orderType, setOrderType] = useState<DeliveryOrderType>('DELIVERY');
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [neighborhood, setNeighborhood] = useState(zones[0]?.name || 'Centro');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [reference, setReference] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<DeliveryPaymentMethod>('PIX');
  const [cashChangeFor, setCashChangeFor] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  if (!isOpen) return null;

  const isPickup = orderType === 'PICKUP';
  const currentFee = isPickup ? 0 : zones.find((item) => item.name === neighborhood)?.fee ?? zones[0]?.fee ?? 5;
  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const total = subtotal + currentFee;
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleSubmitOrder = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    setErrorMessage(null);
    if (!cart.length) { setErrorMessage('Seu carrinho está vazio. Adicione um produto para continuar.'); return; }
    if (!customerName.trim() || !phone.trim()) { setErrorMessage('Preencha seu nome e WhatsApp.'); return; }
    if (!isPickup && (!street.trim() || !number.trim())) { setErrorMessage('Preencha rua e número para a entrega.'); return; }
    if (!currentShift || currentShift.status !== 'ABERTO') { setErrorMessage('A espetaria está fechada no momento. Aguarde a abertura para enviar seu pedido.'); return; }
    setIsSubmitting(true);
    try {
      const change = paymentMethod === 'DINHEIRO' && cashChangeFor ? parseFloat(cashChangeFor.replace(',', '.')) : undefined;
      await submitDeliveryOrder({
        shiftId: currentShift.id, orderType, customerName: customerName.trim(), phone: phone.trim(),
        addressStreet: isPickup ? '' : street.trim(), addressNumber: isPickup ? '' : number.trim(), addressNeighborhood: isPickup ? '' : neighborhood,
        addressComplement: isPickup ? undefined : complement.trim() || undefined, addressReference: isPickup ? undefined : reference.trim() || undefined,
        deliveryFee: currentFee, paymentMethod, cashChangeFor: change, notes: orderNotes.trim() || undefined,
      });
      onOrderPlaced();
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível enviar o pedido. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog label="Revisar pedido e forma de entrega" onClose={onClose} placement="sheet">
      <div className="dialog-panel flex w-full max-w-lg flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-line p-5"><div className="flex items-center gap-3"><span className="icon-tile"><ShoppingBag className="h-5 w-5" aria-hidden="true" /></span><div><h2 className="font-bold text-ink">Seu pedido</h2><p className="mt-1 text-xs text-ink-muted">{count} {count === 1 ? 'item selecionado' : 'itens selecionados'}</p></div></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar carrinho"><X className="h-5 w-5" /></button></div>
        {errorMessage && <div className="notice mx-5 mt-4 border-rose-200 bg-rose-50 text-rose-800" role="alert"><AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />{errorMessage}</div>}
        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {!cart.length ? <div className="rounded-xl bg-surface-soft p-6 text-center"><ShoppingBag className="mx-auto mb-3 h-8 w-8 text-ink-muted" aria-hidden="true" /><p className="text-sm text-ink-muted">Seu carrinho ainda está vazio.</p><button type="button" onClick={onClose} className="btn-secondary mt-4">Voltar ao cardápio</button></div> : <ul className="space-y-3">{cart.map((item) => <CartItemRow key={item.id} name={item.product.name} unitPrice={item.product.price} quantity={item.quantity} doneness={item.doneness} notes={item.notes} onQuantityChange={(delta) => updateCartQuantity(item.id, delta)} onRemove={() => removeFromCart(item.id)} />)}</ul>}
          <form id="delivery-form" onSubmit={handleSubmitOrder} className="space-y-5">
            <fieldset className="border-t border-line pt-5">
              <legend className="mb-3 pt-5 text-base font-semibold">Como quer receber?</legend>
              <div className="grid grid-cols-2 gap-2">{orderTypes.map(({ id, label, icon: Icon }) => <label key={id} className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-2 py-3 text-sm font-medium ${orderType === id ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-line bg-surface text-ink-secondary'}`}><input type="radio" name="delivery-order-type" value={id} checked={orderType === id} onChange={() => setOrderType(id)} className="sr-only" /><Icon className="h-5 w-5" aria-hidden="true" /><span>{label}</span></label>)}</div>
            </fieldset>
            <div><h3 className="mb-4 flex items-center gap-2 text-base font-semibold">{isPickup ? <Store className="h-4 w-4 text-brand-700" aria-hidden="true" /> : <MapPin className="h-4 w-4 text-brand-700" aria-hidden="true" />}{isPickup ? 'Seus dados para a retirada' : 'Onde vamos entregar?'}</h3><div className="space-y-4">
              <div><label htmlFor="delivery-name" className={labelClass}>Seu nome</label><input id="delivery-name" autoComplete="name" required value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Nome completo" className={inputClass} /></div>
              <div><label htmlFor="delivery-phone" className={labelClass}>WhatsApp com DDD</label><input id="delivery-phone" type="tel" autoComplete="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(11) 98765-4321" className={inputClass} /></div>
              {isPickup ? (
                <p className="rounded-xl bg-surface-soft p-3 text-sm text-ink-secondary">Avisamos pelo WhatsApp quando o pedido estiver pronto para buscar.{settings.address && <><br /><strong className="text-ink">Retire em:</strong> {settings.address}</>}</p>
              ) : (
                <>
                  <div><label htmlFor="delivery-neighborhood" className={labelClass}>Bairro de entrega</label><select id="delivery-neighborhood" value={neighborhood} onChange={(event) => setNeighborhood(event.target.value)} className={inputClass}>{zones.map((item) => <option key={item.name} value={item.name}>{item.name} · Taxa {formatBRL(item.fee)}</option>)}</select></div>
                  <div className="grid grid-cols-3 gap-3"><div className="col-span-2"><label htmlFor="delivery-street" className={labelClass}>Rua ou avenida</label><input id="delivery-street" autoComplete="address-line1" required value={street} onChange={(event) => setStreet(event.target.value)} className={inputClass} /></div><div><label htmlFor="delivery-number" className={labelClass}>Número</label><input id="delivery-number" required value={number} onChange={(event) => setNumber(event.target.value)} className={inputClass} /></div></div>
                  <div><label htmlFor="delivery-complement" className={labelClass}>Complemento <span className="font-normal text-ink-muted">(opcional)</span></label><input id="delivery-complement" autoComplete="address-line2" value={complement} onChange={(event) => setComplement(event.target.value)} placeholder="Apartamento, bloco..." className={inputClass} /></div>
                  <div><label htmlFor="delivery-reference" className={labelClass}>Referência <span className="font-normal text-ink-muted">(opcional)</span></label><input id="delivery-reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Um ponto de referência para a entrega" className={inputClass} /></div>
                </>
              )}
            </div></div>
            <fieldset className="border-t border-line pt-5"><legend className="mb-3 pt-5 text-base font-semibold">Como prefere pagar?</legend><div className="grid grid-cols-3 gap-2">{methods.map(({ id, icon: Icon }) => <label key={id} className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border px-2 py-3 text-center text-xs font-medium ${paymentMethod === id ? 'bg-brand-50 text-brand-800' : 'border-line bg-surface text-ink-secondary'}`}><Icon className="h-5 w-5" aria-hidden="true" /><span>{deliveryPaymentLabel(id, orderType)}</span><input type="radio" name="delivery-payment" value={id} checked={paymentMethod === id} onChange={() => setPaymentMethod(id)} className="h-4 w-4" /></label>)}</div>{paymentMethod === 'PIX' && <div className="mt-4 space-y-3 rounded-xl border border-brand-200 bg-brand-50 p-3 text-xs text-brand-900"><div><p className="font-semibold">Chave PIX da Espetaria:</p><div className="mt-1 flex items-center gap-2 rounded-lg border border-brand-300 bg-white px-3 py-2 font-mono text-sm text-ink select-all break-all">{settings.pix_key || 'Chave não configurada'}</div><p className="mt-1 text-ink-secondary">Favorecido: {settings.pix_merchant_name} ({settings.pix_merchant_city})</p></div><div className="rounded-lg border border-dashed border-brand-300 bg-brand-50/50 p-2 text-center text-ink-muted">QR Code disponível após confirmação do pedido</div></div>}{paymentMethod === 'DINHEIRO' && <div className="mt-4"><label htmlFor="delivery-change" className={labelClass}>Troco para quanto? <span className="font-normal text-ink-muted">(opcional)</span></label><input id="delivery-change" inputMode="decimal" value={cashChangeFor} onChange={(event) => setCashChangeFor(event.target.value)} placeholder="Ex.: 100,00" className={inputClass} /></div>}</fieldset>
            <div><label htmlFor="delivery-notes" className={labelClass}>Observação do pedido <span className="font-normal text-ink-muted">(opcional)</span></label><textarea id="delivery-notes" rows={2} value={orderNotes} onChange={(event) => setOrderNotes(event.target.value)} placeholder="Algo que precisamos saber?" className={inputClass} /></div>
          </form>
        </div>
        <div className="space-y-2 border-t border-line p-5 text-sm"><div className="flex justify-between gap-3 text-ink-secondary"><span>Subtotal</span><span className="tabular-nums">{formatBRL(subtotal)}</span></div><div className="flex justify-between gap-3 text-ink-secondary"><span>{isPickup ? 'Retirada no local' : `Entrega · ${neighborhood}`}</span><span className="shrink-0 tabular-nums">{isPickup ? 'Grátis' : formatBRL(currentFee)}</span></div><div className="flex items-center justify-between gap-3 pt-1 font-semibold"><span>Total do pedido</span><span className="text-xl text-brand-800 tabular-nums">{formatBRL(total)}</span></div><button form="delivery-form" type="submit" disabled={!cart.length || isSubmitting} className="btn-primary mt-3 w-full py-3.5"><Send className="h-4 w-4" aria-hidden="true" />{isSubmitting ? 'Enviando pedido...' : 'Confirmar pedido'}</button></div>
      </div>
    </Dialog>
  );
}
