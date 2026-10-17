import { Check } from 'lucide-react';
import { isPickupOrder } from '../../lib/deliveryStatus';
import { formatBRL, formatDoneness } from '../../lib/formatters';
import { useSettingsStore } from '../../stores/useSettingsStore';
import type { DeliveryOrder } from '../../types/domain';
import { AutoPixPanel, DeliveryPixPanel, openRestaurantWhatsApp } from './DeliveryTrackingModal';

const hhmm = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null);
const addMin = (iso: string, min: number) => new Date(new Date(iso).getTime() + min * 60_000).toISOString();

const PAY_LABEL: Record<string, string> = { PIX: 'PIX', CARTAO_ENTREGA: 'Cartão na entrega', DINHEIRO: 'Dinheiro' };

interface Step { title: string; desc: string; at: string | null | undefined }

function buildSteps(order: DeliveryOrder): { steps: Step[]; current: number } {
  const pickup = isPickupOrder(order);
  const o = order as DeliveryOrder & { preparing_at?: string | null };
  const steps: Step[] = [
    { title: 'Pedido recebido', desc: 'Recebemos o seu pedido.', at: order.created_at },
    { title: 'Confirmado pela loja', desc: order.payment_method === 'PIX' ? 'Pagamento conferido pela loja.' : 'A loja aceitou o seu pedido.', at: order.confirmed_at ?? o.preparing_at },
    { title: 'Na brasa', desc: 'Seu pedido está sendo preparado.', at: o.preparing_at },
    pickup
      ? { title: 'Pronto para buscar', desc: 'Pode vir retirar no balcão.', at: order.ready_at }
      : { title: 'Saiu para entrega', desc: order.driver_name ? `Entregador: ${order.driver_name}.` : 'O entregador está a caminho.', at: order.dispatched_at },
    { title: pickup ? 'Retirado' : 'Entregue', desc: 'Bom apetite!', at: order.delivered_at },
  ];
  const map: Record<string, number> = pickup
    ? { AWAITING_PAYMENT: 0, CONFIRMED: 1, PREPARING: 2, READY: 3, DELIVERED: 4 }
    : { AWAITING_PAYMENT: 0, CONFIRMED: 1, PREPARING: 2, READY: 2, OUT_FOR_DELIVERY: 3, DELIVERED: 4 };
  return { steps, current: map[order.status] ?? 0 };
}

export function statusTitle(order: DeliveryOrder) {
  const pickup = isPickupOrder(order);
  switch (order.status) {
    case 'AWAITING_PAYMENT': return 'Aguardando o PIX';
    case 'CONFIRMED': return 'Confirmado';
    case 'PREPARING': return 'Na brasa';
    case 'READY': return pickup ? 'Pronto para buscar' : 'Na brasa';
    case 'OUT_FOR_DELIVERY': return 'Saiu para entrega';
    case 'DELIVERED': return pickup ? 'Retirado' : 'Entregue';
    case 'CANCELLED': return 'Pedido cancelado';
    default: return 'Pedido recebido';
  }
}

/** Bloco PIX do pedido (QR + copiar), só enquanto não pago. */
export function OrderPixBlock({ order }: { order: DeliveryOrder }) {
  const finished = order.status === 'DELIVERED' || order.status === 'CANCELLED';
  if (order.paid_at || finished || order.payment_method !== 'PIX') return null;
  return (
    <div className="space-y-3">
      {order.status === 'AWAITING_PAYMENT' ? <AutoPixPanel order={order} /> : <DeliveryPixPanel order={order} />}
      <p className="rounded-[10px] border border-[#EDD293] bg-[#FBF4E6] p-3 text-[14px] leading-snug text-[#5C3E0C]">A loja confere o pagamento e avisa no seu WhatsApp. Não precisa enviar comprovante.</p>
    </div>
  );
}

/** Acompanhamento: status grande, faixa de horário, linha do tempo e resumo. */
export function OrderStatusView({ order, showPix = true }: { order: DeliveryOrder; showPix?: boolean }) {
  const restaurantAddress = useSettingsStore((s) => s.settings.address);
  const pickup = isPickupOrder(order);
  const { steps, current } = buildSteps(order);
  const cancelled = order.status === 'CANCELLED';
  const done = order.status === 'DELIVERED';
  return (
    <div className="space-y-6 text-[#2B211C]">
      <div>
        <p className="font-mono text-[13px] text-[#857668]">Pedido #{order.order_number}</p>
        <h2 className={`mt-1 text-[28px] font-semibold leading-tight ${cancelled ? 'text-[#9B2C2C]' : ''}`}>{statusTitle(order)}</h2>
        {!cancelled && !done && (
          <p className="mt-1 text-[15px] text-[#6B5D53]">
            {pickup ? `Pronto entre ${hhmm(addMin(order.created_at, 30))} e ${hhmm(addMin(order.created_at, 40))}` : `Chega entre ${hhmm(addMin(order.created_at, 40))} e ${hhmm(addMin(order.created_at, 55))}`}
          </p>
        )}
        {cancelled && order.cancel_reason && <p className="mt-1 text-[15px] text-[#6B5D53]">Motivo: {order.cancel_reason}</p>}
      </div>

      {showPix && <OrderPixBlock order={order} />}

      {!cancelled && (
        <ol aria-label="Andamento do pedido" className="space-y-0">
          {steps.map((step, i) => {
            const isDone = i < current || (done && i === current);
            const isCurrent = i === current && !done;
            const last = i === steps.length - 1;
            return (
              <li key={step.title} aria-current={isCurrent ? 'step' : undefined} className="relative flex gap-3.5 pb-5 last:pb-0">
                {!last && <span aria-hidden="true" className={`absolute left-[9px] top-6 h-[calc(100%-20px)] w-0.5 ${isDone ? 'bg-[#3F7A4E]' : 'bg-[#E4DACB]'}`} />}
                <span aria-hidden="true" className={`relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${isDone ? 'bg-[#3F7A4E] text-white' : isCurrent ? 'border-[6px] border-[#B5502E] bg-white' : 'border-2 border-[#CFC2B2] bg-white'}`}>
                  {isDone && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={`text-[16px] ${isCurrent ? 'font-semibold' : isDone ? 'font-medium' : 'text-[#857668]'}`}>{step.title}</span>
                    {isDone && hhmm(step.at) && <span className="font-mono text-[13px] text-[#857668]">{hhmm(step.at)}</span>}
                  </div>
                  {isCurrent && <p className="mt-0.5 text-[14px] text-[#6B5D53]">{step.desc}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <section className="rounded-[12px] border border-[#E4DACB] bg-white p-4">
        <ul className="space-y-2">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3 text-[15px]">
              <span>{item.quantity}× {item.product_name}{item.doneness && <span className="text-[#6B5D53]"> · {formatDoneness(item.doneness)}</span>}{item.notes && <span className="block text-[13px] text-[#6B5D53]">“{item.notes}”</span>}</span>
              <span className="shrink-0 tabular-nums">{formatBRL(item.unit_price * item.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1.5 border-t border-[#EFE8DD] pt-3 text-[14px] text-[#6B5D53]">
          <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{formatBRL(order.subtotal)}</span></div>
          {!pickup && <div className="flex justify-between"><span>Entrega</span><span className="tabular-nums">{formatBRL(order.delivery_fee)}</span></div>}
          <div className="flex justify-between pt-1 text-[17px] font-semibold text-[#2B211C]"><span>Total</span><span className="tabular-nums">{formatBRL(order.total)}</span></div>
          <div className="flex justify-between pt-1"><span>Pagamento</span><span>{PAY_LABEL[order.payment_method] ?? order.payment_method}{order.paid_at ? ' · pago' : ''}</span></div>
        </div>
        <p className="mt-3 border-t border-[#EFE8DD] pt-3 text-[14px] text-[#3D322B]">
          {pickup ? <>Retirada no local{restaurantAddress ? ` · ${restaurantAddress}` : ''}</> : <>{order.address_street}, {order.address_number} · {order.address_neighborhood}{order.address_complement ? ` · ${order.address_complement}` : ''}</>}
        </p>
      </section>

      <button type="button" onClick={() => openRestaurantWhatsApp(order)} className="flex h-[52px] w-full items-center justify-center rounded-[12px] border border-[#CFC2B2] bg-white text-[16px] font-semibold text-[#2B211C] hover:bg-[#F5EFE6]">Falar com a loja no WhatsApp</button>
    </div>
  );
}
