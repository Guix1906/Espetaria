import { Bike, Check, CheckCircle2, Clock3, Copy, Flame, MapPin, MessageCircle, PackageCheck, QrCode, Store, Trash2, X } from 'lucide-react';
import { useCancelDeliveryOrder } from './useCancelDeliveryOrder';
import { useEffect, useState } from 'react';
import { generatePixPayload } from '../../lib/pix';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { useDeliveryStore } from '../../stores/useDeliveryStore';
import { PixQrCode } from '../pix/PixQrCode';
import { Dialog } from '../../components/ui/Dialog';
import { getDeliveryStatusConfig, isPickupOrder } from '../../lib/deliveryStatus';
import { formatBRL, formatDoneness } from '../../lib/formatters';
import { normalizePhoneNumber } from '../../lib/whatsapp';
import { useSettingsStore } from '../../stores/useSettingsStore';
import type { DeliveryOrder } from '../../types/domain';

interface DeliveryTrackingModalProps { order: DeliveryOrder; isOpen: boolean; onClose: () => void; }

/** Copia o código PIX; sem clipboard (navegador antigo / http) usa o modo antigo de seleção. */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

const PIX_HOW_TO = 'Abra o app do banco e cole em PIX Copia e Cola.';

/** QR Code escondido: no celular o cliente usa o Copia e Cola; o QR é para pagar de outro aparelho. */
function PixQrToggle({ payload }: { payload: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-h-[44px] w-full items-center justify-center gap-2 text-sm font-semibold text-brand-700">
        <QrCode className="h-4 w-4" aria-hidden="true" />{open ? 'Esconder QR Code' : 'Mostrar QR Code'}
      </button>
      {open && <PixQrCode payload={payload} size={200} />}
    </div>
  );
}

/** Pagamento PIX do pedido: Copia e Cola no valor exato (QR Code sob demanda). */
export function DeliveryPixPanel({ order }: { order: DeliveryOrder }) {
  const { settings } = useSettingsStore();
  const [copied, setCopied] = useState(false);
  // Sem chave cadastrada (ou ainda carregando): não mostra QR Code de chave errada
  if (!settings.pix_key?.trim()) {
    return <p className="notice border-amber-200 bg-amber-50 text-amber-900">Pagamento por PIX: peça a chave pelo botão <strong>Falar com a espetaria</strong>.</p>;
  }
  const payload = generatePixPayload({
    pixKey: settings.pix_key,
    merchantName: settings.pix_merchant_name,
    merchantCity: settings.pix_merchant_city,
    amount: order.total,
    txId: `DLV${order.order_number}`,
    description: `Pedido ${order.order_number}`,
  });

  const copy = async () => {
    if (!(await copyText(payload))) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="space-y-3 rounded-2xl border border-brand-200 bg-brand-50 p-4" aria-labelledby="delivery-pix-title">
      <div className="text-center">
        <h3 id="delivery-pix-title" className="flex items-center justify-center gap-2 font-semibold text-brand-900"><QrCode className="h-4 w-4" aria-hidden="true" />Pague com PIX</h3>
        <p className="mt-1 text-2xl font-bold text-brand-800 tabular-nums">{formatBRL(order.total)}</p>
        <p className="text-xs text-ink-secondary">Favorecido: {settings.pix_merchant_name}</p>
      </div>
      <button type="button" onClick={() => void copy()} className={`${copied ? 'btn-success' : 'btn-primary'} w-full`}>
        {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        {copied ? 'Código copiado' : 'Copiar código PIX'}
      </button>
      <p className="text-center text-[14px] text-ink-secondary">{PIX_HOW_TO}</p>
      <PixQrToggle payload={payload} />
    </section>
  );
}

const PIX_CHECK_MS = 5_000;

/**
 * PIX automático (Mercado Pago): QR Code exclusivo do pedido. Consulta o pagamento
 * a cada 5 s; quando cai, o banco manda o pedido para a brasa e imprime sozinho.
 */
export function AutoPixPanel({ order }: { order: DeliveryOrder }) {
  const [qr, setQr] = useState<string | null>(order.pix_qr_code ?? null);
  const [expiresAt, setExpiresAt] = useState<string | null>(order.pix_expires_at ?? null);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (qr || !isSupabaseConfigured) return;
    let cancelled = false;
    void supabase.functions.invoke('pix-mercadopago?action=create', { body: { order_id: order.id } }).then(({ data, error: fnError }) => {
      if (cancelled) return;
      const res = (data ?? {}) as { qr_code?: string; expires_at?: string; error?: string; paid?: boolean };
      if (fnError || res.error || !res.qr_code) {
        if (res.paid) setPaid(true);
        else setError('Não foi possível gerar o PIX agora. Toque em "Falar com a espetaria" ou tente recarregar a página.');
        return;
      }
      setQr(res.qr_code);
      setExpiresAt(res.expires_at ?? null);
    });
    return () => { cancelled = true; };
  }, [order.id, qr]);

  useEffect(() => {
    if (!qr || paid || !isSupabaseConfigured) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      void supabase.functions.invoke('pix-mercadopago?action=check', { body: { order_id: order.id } }).then(({ data }) => {
        if ((data as { paid?: boolean } | null)?.paid) {
          setPaid(true);
          void useDeliveryStore.getState().refreshTrackingStatus();
        }
      });
    }, PIX_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [order.id, qr, paid]);

  if (paid) {
    return <p className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900" role="status"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />PIX confirmado! Seu pedido já foi para a brasa.</p>;
  }
  if (error) return <p className="notice border-rose-200 bg-rose-50 text-rose-800" role="alert">{error}</p>;
  if (!qr) return <p className="p-4 text-center text-sm text-ink-muted" role="status">Gerando o PIX do seu pedido...</p>;

  const secondsLeft = expiresAt ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000)) : null;
  const copy = async () => {
    if (!(await copyText(qr))) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="space-y-3 rounded-2xl border border-brand-200 bg-brand-50 p-4" aria-labelledby="delivery-autopix-title">
      <div className="text-center">
        <h3 id="delivery-autopix-title" className="flex items-center justify-center gap-2 font-semibold text-brand-900"><QrCode className="h-4 w-4" aria-hidden="true" />Pague com PIX para confirmar</h3>
        <p className="mt-1 text-2xl font-bold text-brand-800 tabular-nums">{formatBRL(order.total)}</p>
        {secondsLeft !== null && <p className="text-xs text-ink-secondary tabular-nums">{secondsLeft > 0 ? `Pague em até ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}` : 'Prazo do PIX encerrado'}</p>}
      </div>
      <button type="button" onClick={() => void copy()} className={`${copied ? 'btn-success' : 'btn-primary'} w-full`}>
        {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        {copied ? 'Código copiado' : 'Copiar código PIX'}
      </button>
      <p className="text-center text-[14px] text-ink-secondary">{PIX_HOW_TO}</p>
      <PixQrToggle payload={qr} />
      <p className="flex items-center gap-2 text-xs text-ink-secondary"><Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />Não precisa mandar comprovante: assim que o pagamento cair, esta tela confirma sozinha e o pedido vai para a brasa.</p>
    </section>
  );
}

/** Abre a conversa com a loja já citando o pedido. */
export function openRestaurantWhatsApp(order: Pick<DeliveryOrder, 'order_number' | 'customer_name'>) {
  const message = encodeURIComponent(`Olá! Gostaria de saber sobre o meu pedido #${order.order_number} (${order.customer_name}).`);
  const phone = normalizePhoneNumber(useSettingsStore.getState().settings.phone);
  window.open(`https://wa.me/${phone}?text=${message}`, '_blank', 'noopener,noreferrer');
}

const DELIVERY_STEPS = [
  { key: 'CONFIRMED', label: 'Confirmado', icon: CheckCircle2 },
  { key: 'PREPARING', label: 'Na brasa', icon: Flame },
  { key: 'READY', label: 'Pronto', icon: PackageCheck },
  { key: 'OUT_FOR_DELIVERY', label: 'A caminho', icon: Bike },
  { key: 'DELIVERED', label: 'Entregue', icon: CheckCircle2 },
];

const PICKUP_STEPS = [
  { key: 'CONFIRMED', label: 'Confirmado', icon: CheckCircle2 },
  { key: 'PREPARING', label: 'Na brasa', icon: Flame },
  { key: 'READY', label: 'Pode buscar', icon: Store },
  { key: 'DELIVERED', label: 'Retirado', icon: CheckCircle2 },
];

/** Situação, etapas, pagamento, endereço e itens do pedido (janela do cardápio e página pública). */
export function DeliveryTrackingDetails({ order }: { order: DeliveryOrder }) {
  const isPickup = isPickupOrder(order);
  const restaurantAddress = useSettingsStore((s) => s.settings.address);
  const steps = isPickup ? PICKUP_STEPS : DELIVERY_STEPS;
  const status = getDeliveryStatusConfig(order.status, order.order_type);
  const currentStep = steps.findIndex((step) => step.key === order.status);
  const finished = order.status === 'DELIVERED' || order.status === 'CANCELLED';
  return (
    <>
          <div className={`rounded-2xl border p-4 ${status.classes}`} role="status"><h3 className="font-semibold">{status.label}</h3><p className="mt-1 text-sm">{status.description}</p>{order.driver_name && order.status === 'OUT_FOR_DELIVERY' && <p className="mt-2 flex items-center gap-2 text-sm font-medium"><Bike className="h-4 w-4" aria-hidden="true" />Entregador: {order.driver_name}</p>}{order.status === 'CANCELLED' && order.cancel_reason && <p className="mt-2 text-sm">Motivo: {order.cancel_reason}</p>}</div>
          {order.status !== 'CANCELLED' && <ol aria-label={isPickup ? 'Etapas da retirada' : 'Etapas da entrega'} className={`grid gap-3 ${isPickup ? 'grid-cols-4' : 'grid-cols-3 sm:grid-cols-5'}`}>{steps.map((step, index) => { const Icon = step.icon; return <li key={step.key} aria-current={currentStep === index ? 'step' : undefined} className="flex flex-col items-center gap-2 text-center"><span className={`flex h-11 w-11 items-center justify-center rounded-xl ${index <= currentStep ? 'bg-brand-700 text-white' : 'bg-surface-muted text-ink-muted'}`}><Icon className="h-5 w-5" aria-hidden="true" /></span><span className={`text-xs font-semibold ${index <= currentStep ? 'text-brand-800' : 'text-ink-muted'}`}>{index + 1}. {step.label}</span></li>; })}</ol>}
          {order.paid_at
            ? <p className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Pagamento confirmado. Obrigado!</p>
            : order.status === 'AWAITING_PAYMENT' ? <AutoPixPanel order={order} />
            : order.payment_method === 'PIX' && !finished && <DeliveryPixPanel order={order} />}
          {!finished && <p className="flex items-center gap-2 text-xs text-ink-muted"><Clock3 className="h-4 w-4" aria-hidden="true" />{isPickup ? 'Avisamos pelo WhatsApp quando estiver pronto para buscar' : 'Estimativa de entrega: 35–50 min'} · Pedido às {new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>}
          {isPickup
            ? <section className="rounded-xl border border-line bg-surface-soft p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><Store className="h-4 w-4 text-brand-700" aria-hidden="true" />Retirada no local</h3>{restaurantAddress && <p className="mt-2 text-sm text-ink-secondary">{restaurantAddress}</p>}</section>
            : <section className="rounded-xl border border-line bg-surface-soft p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-brand-700" aria-hidden="true" />Endereço de entrega</h3><p className="mt-2 text-sm text-ink-secondary">{order.address_street}, {order.address_number}<br />{order.address_neighborhood}</p>{order.address_complement && <p className="mt-1 text-xs text-ink-muted">{order.address_complement}</p>}{order.address_reference && <p className="mt-1 text-xs text-ink-muted">Referência: {order.address_reference}</p>}</section>}
          <section><h3 className="mb-3 text-sm font-semibold">Itens do pedido</h3><ul className="divide-y divide-line">{order.items.map((item) => <li key={item.id} className="flex items-start justify-between gap-3 py-3 text-sm"><div><span className="font-semibold">{item.quantity}x {item.product_name}</span>{item.doneness && <span className="mt-1 block text-xs text-ink-muted">{formatDoneness(item.doneness)}</span>}{item.notes && <span className="mt-1 block text-xs text-ink-muted">{item.notes}</span>}</div><span className="shrink-0 text-ink-secondary tabular-nums">{formatBRL(item.unit_price * item.quantity)}</span></li>)}</ul><div className="mt-2 space-y-2 rounded-xl bg-surface-soft p-4 text-sm"><div className="flex justify-between gap-3 text-ink-secondary"><span>Subtotal</span><span className="tabular-nums">{formatBRL(order.subtotal)}</span></div>{!isPickup && <div className="flex justify-between gap-3 text-ink-secondary"><span>Taxa de entrega</span><span className="tabular-nums">{formatBRL(order.delivery_fee)}</span></div>}<div className="flex justify-between gap-3 border-t border-line pt-3 font-semibold"><span>Total do pedido</span><span className="text-lg text-brand-800 tabular-nums">{formatBRL(order.total)}</span></div></div></section>
    </>
  );
}

export function DeliveryTrackingModal({ order, isOpen, onClose }: DeliveryTrackingModalProps) {
  // Só aparece para gerência/caixa logados (cliente no cardápio não vê)
  const { canCancel, isCancellable, cancel } = useCancelDeliveryOrder();
  if (!isOpen) return null;
  return (
    <Dialog label={`Acompanhar pedido ${order.order_number}`} onClose={onClose} placement="sheet">
      <div className="dialog-panel flex w-full max-w-lg flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-line p-5"><div><p className="eyebrow">{isPickupOrder(order) ? 'Sua retirada' : 'Seu delivery'}</p><h2 className="text-xl font-bold text-ink">Pedido #{order.order_number}</h2><p className="mt-1 text-sm text-ink-muted">{order.customer_name}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar acompanhamento"><X className="h-5 w-5" /></button></div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <DeliveryTrackingDetails order={order} />
        </div>
        <div className="space-y-2 border-t border-line p-5">
          <button type="button" onClick={() => openRestaurantWhatsApp(order)} className="btn-success w-full"><MessageCircle className="h-4 w-4" aria-hidden="true" />Falar com a espetaria</button>
          {canCancel && isCancellable(order) && <button type="button" onClick={() => void cancel(order)} className="btn-secondary w-full text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4" aria-hidden="true" />Cancelar pedido (equipe)</button>}
        </div>
      </div>
    </Dialog>
  );
}
