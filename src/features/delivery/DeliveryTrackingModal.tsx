import { Bike, CheckCircle2, Clock3, Flame, MapPin, MessageCircle, X } from 'lucide-react';
import { Dialog } from '../../components/ui/Dialog';
import { getDeliveryStatusConfig } from '../../lib/deliveryStatus';
import { formatBRL, formatDoneness } from '../../lib/formatters';
import type { DeliveryOrder } from '../../types/domain';

interface DeliveryTrackingModalProps { order: DeliveryOrder; isOpen: boolean; onClose: () => void; }

export function DeliveryTrackingModal({ order, isOpen, onClose }: DeliveryTrackingModalProps) {
  if (!isOpen) return null;
  const status = getDeliveryStatusConfig(order.status);
  const steps = [{ key: 'CONFIRMED', label: 'Confirmado', icon: CheckCircle2 }, { key: 'PREPARING', label: 'Em preparo', icon: Flame }, { key: 'OUT_FOR_DELIVERY', label: 'A caminho', icon: Bike }, { key: 'DELIVERED', label: 'Entregue', icon: CheckCircle2 }];
  const currentStep = steps.findIndex((step) => step.key === order.status);
  const finished = order.status === 'DELIVERED' || order.status === 'CANCELLED';
  const openWhatsApp = () => {
    const message = encodeURIComponent(`Olá! Gostaria de saber sobre o meu pedido de delivery #${order.order_number} (${order.customer_name}).`);
    window.open(`https://wa.me/5511987654321?text=${message}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <Dialog label={`Acompanhar pedido ${order.order_number}`} onClose={onClose} placement="sheet">
      <div className="dialog-panel flex w-full max-w-lg flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-line p-5"><div><p className="eyebrow">Seu delivery</p><h2 className="text-xl font-bold text-ink">Pedido #{order.order_number}</h2><p className="mt-1 text-sm text-ink-muted">{order.customer_name}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar acompanhamento"><X className="h-5 w-5" /></button></div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className={`rounded-2xl border p-4 ${status.classes}`} role="status"><h3 className="font-semibold">{status.label}</h3><p className="mt-1 text-sm">{status.description}</p>{order.driver_name && order.status === 'OUT_FOR_DELIVERY' && <p className="mt-2 flex items-center gap-2 text-sm font-medium"><Bike className="h-4 w-4" aria-hidden="true" />Entregador: {order.driver_name}</p>}</div>
          {order.status !== 'CANCELLED' && <ol aria-label="Etapas da entrega" className="grid grid-cols-2 gap-3 sm:grid-cols-4">{steps.map((step, index) => { const Icon = step.icon; return <li key={step.key} aria-current={currentStep === index ? 'step' : undefined} className="flex flex-col items-center gap-2 text-center"><span className={`flex h-11 w-11 items-center justify-center rounded-xl ${index <= currentStep ? 'bg-brand-700 text-white' : 'bg-surface-muted text-ink-muted'}`}><Icon className="h-5 w-5" aria-hidden="true" /></span><span className={`text-xs font-semibold ${index <= currentStep ? 'text-brand-800' : 'text-ink-muted'}`}>{index + 1}. {step.label}</span></li>; })}</ol>}
          {!finished && <p className="flex items-center gap-2 text-xs text-ink-muted"><Clock3 className="h-4 w-4" aria-hidden="true" />Estimativa de entrega: 35–50 min · Pedido às {new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>}
          <section className="rounded-xl border border-line bg-surface-soft p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-brand-700" aria-hidden="true" />Endereço de entrega</h3><p className="mt-2 text-sm text-ink-secondary">{order.address_street}, {order.address_number}<br />{order.address_neighborhood}</p>{order.address_complement && <p className="mt-1 text-xs text-ink-muted">{order.address_complement}</p>}{order.address_reference && <p className="mt-1 text-xs text-ink-muted">Referência: {order.address_reference}</p>}</section>
          <section><h3 className="mb-3 text-sm font-semibold">Itens do pedido</h3><ul className="divide-y divide-line">{order.items.map((item) => <li key={item.id} className="flex items-start justify-between gap-3 py-3 text-sm"><div><span className="font-semibold">{item.quantity}x {item.product_name}</span>{item.doneness && <span className="mt-1 block text-xs text-ink-muted">{formatDoneness(item.doneness)}</span>}{item.notes && <span className="mt-1 block text-xs text-ink-muted">{item.notes}</span>}</div><span className="shrink-0 text-ink-secondary tabular-nums">{formatBRL(item.unit_price * item.quantity)}</span></li>)}</ul><div className="mt-2 space-y-2 rounded-xl bg-surface-soft p-4 text-sm"><div className="flex justify-between gap-3 text-ink-secondary"><span>Subtotal</span><span className="tabular-nums">{formatBRL(order.subtotal)}</span></div><div className="flex justify-between gap-3 text-ink-secondary"><span>Taxa de entrega</span><span className="tabular-nums">{formatBRL(order.delivery_fee)}</span></div><div className="flex justify-between gap-3 border-t border-line pt-3 font-semibold"><span>Total do pedido</span><span className="text-lg text-brand-800 tabular-nums">{formatBRL(order.total)}</span></div></div></section>
        </div>
        <div className="border-t border-line p-5"><button type="button" onClick={openWhatsApp} className="btn-success w-full"><MessageCircle className="h-4 w-4" aria-hidden="true" />Falar com a espetaria</button></div>
      </div>
    </Dialog>
  );
}
