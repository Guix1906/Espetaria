import {
  BadgeCheck,
  Bike,
  CheckCheck,
  ChevronDown,
  Clock3,
  DollarSign,
  Flame,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  PackageCheck,
  Phone,
  Send,
  Trash2
} from 'lucide-react';
import { etaMaxMinutes } from '../../lib/eta';
import React, { useEffect, useState } from 'react';
import { DriverPayoutsView } from './DriverPayoutsView';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { EmptyState } from '../../components/ui/EmptyState';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { PageHeader } from '../../components/ui/PageHeader';
import { deliveryPaymentLabel, getDeliveryStatusConfig, hasGrillItems, isDineInOrder, isPickupOrder, clearOrderKindFocus, orderKind, peekOrderKindFocus, type OrderKind } from '../../lib/deliveryStatus';
import { formatBRL, formatDoneness } from '../../lib/formatters';
import { buildWhatsAppLink } from '../../lib/whatsapp';
import { renderWhatsAppTemplate, resolveWhatsAppTemplates, whatsAppVariables } from '../../lib/whatsappTemplates';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDeliveryStore } from '../../stores/useDeliveryStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { DeliveryOrder, WhatsAppEvent, WhatsAppMessage } from '../../types/domain';
import { publicAppUrl } from '../../lib/publicUrl';

type DeliveryFilter = 'ALL_ACTIVE' | 'AWAITING_PAYMENT' | 'READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED';

const EVENT_LABEL: Record<WhatsAppMessage['event'], string> = {
  CONFIRMED: 'Confirmação',
  PAID: 'PIX recebido',
  PREPARING: 'Na brasa',
  READY: 'Pronto',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelamento',
};

const MESSAGE_STATUS_LABEL: Record<WhatsAppMessage['status'], string> = {
  SENT: 'enviada',
  FAILED: 'falhou',
  SKIPPED: 'desligada',
  PENDING: 'na fila',
  SENDING: 'na fila',
};

/** Mensagem que o botão manual de WhatsApp abre, conforme a etapa do pedido. */
const MANUAL_EVENT: Partial<Record<DeliveryOrder['status'], WhatsAppEvent>> = {
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
};

// "Pronto" só é mensagem de retirada; no delivery o cliente é avisado quando sai
function manualEvent(order: DeliveryOrder): WhatsAppEvent {
  if (order.status === 'READY' && isPickupOrder(order)) return 'READY';
  return MANUAL_EVENT[order.status] ?? 'CONFIRMED';
}

const isInProduction = (status: DeliveryOrder['status']) => status === 'CONFIRMED' || status === 'PREPARING' || status === 'READY';

const timeOf = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null);
const minutesSince = (iso: string, now: number) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));

/** Quando o pedido entrou na etapa atual (para "Na brasa · 12 min"). */
function stageStart(order: DeliveryOrder): string {
  if (order.status === 'READY') return order.ready_at ?? order.created_at;
  if (order.status === 'OUT_FOR_DELIVERY') return order.dispatched_at ?? order.created_at;
  if (order.status === 'DELIVERED') return order.delivered_at ?? order.created_at;
  if (order.status === 'AWAITING_PAYMENT') return order.created_at;
  return order.preparing_at ?? order.confirmed_at ?? order.created_at;
}

/** Pagamento numa linha: "PIX · pago 20:06", "PIX · aguardando", "Dinheiro · troco p/ R$ 100 · receber na entrega". */
function paymentLine(order: DeliveryOrder): string {
  const pickup = isPickupOrder(order);
  const parts = [deliveryPaymentLabel(order.payment_method, order.order_type)];
  if (order.cash_change_for) parts.push(`troco p/ ${formatBRL(order.cash_change_for)}`);
  if (order.paid_at) parts.push(`pago ${timeOf(order.paid_at)}`);
  else if (order.payment_method === 'PIX') parts.push('aguardando');
  else parts.push(isDineInOrder(order) ? 'receber no local' : pickup ? 'receber na retirada' : 'receber na entrega');
  return parts.join(' · ');
}

/** Hora de cada etapa já registrada (na brasa, pronto, saiu, entregue/retirado). */
function StatusTimeline({ order }: { order: DeliveryOrder }) {
  const pickup = isPickupOrder(order);
  const steps = [
    { label: hasGrillItems(order) ? 'Na brasa' : 'Em preparo', at: order.status === 'AWAITING_PAYMENT' ? null : order.preparing_at ?? order.confirmed_at ?? order.created_at },
    { label: 'Pronto', at: order.ready_at },
    ...(pickup ? [] : [{ label: 'Saiu', at: order.dispatched_at }]),
    { label: pickup ? 'Retirado' : 'Entregue', at: order.delivered_at },
    { label: 'Cancelado', at: order.cancelled_at },
  ].filter((s) => s.at);
  return (
    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted tabular-nums" aria-label="Horário de cada etapa">
      {steps.map((s) => <span key={s.label}>{s.label} {timeOf(s.at)}</span>)}
    </p>
  );
}

/** Situação das mensagens automáticas enviadas ao cliente. */
function WhatsAppStatus({ messages, onRetry }: { messages: WhatsAppMessage[]; onRetry: (id: string) => void }) {
  if (messages.length === 0) return null;
  const ordered = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Mensagens automáticas de WhatsApp">
      {ordered.map((m) => (
        <li key={m.id} title={m.last_error ?? undefined} className={`inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[13px] font-semibold ${m.status === 'SENT' ? 'bg-emerald-50 text-emerald-800' : m.status === 'FAILED' ? 'bg-rose-50 text-rose-800' : 'border-line bg-surface-muted text-ink-muted'}`}>
          <MessageCircle className="h-3 w-3" aria-hidden="true" />
          {EVENT_LABEL[m.event] ?? m.event}: {MESSAGE_STATUS_LABEL[m.status]}
          {m.status === 'FAILED' && <button type="button" className="ml-1 underline" onClick={() => onRetry(m.id)}>reenviar</button>}
        </li>
      ))}
    </ul>
  );
}

import { useCancelDeliveryOrder } from './useCancelDeliveryOrder';
import { useShiftStore } from '../../stores/useShiftStore';
import { KDSElapsedTimer, LEVEL_STRIP, useNow } from '../kds/KDSElapsedTimer';

export const DeliveryManagementView: React.FC = () => {
  const { requestText, notify } = useFeedback();
  const { deliveryOrders, updateDeliveryStatus, markDeliveryPaid, whatsappMessages, retryWhatsAppMessage } = useDeliveryStore();
  const { currentProfile } = useAuthStore();
  const settings = useSettingsStore((s) => s.settings);

  const [activeTab, setActiveTab] = useState<'orders' | 'payouts'>('orders');
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});
  const toggleCard = (id: string) => setOpenCards((current) => ({ ...current, [id]: !current[id] }));
  const now = useNow();
  // Entregador abre direto nos pedidos prontos para sair
  const [filter, setFilter] = useState<DeliveryFilter>(() => (currentProfile.role === 'ENTREGADOR' ? 'READY' : 'ALL_ACTIVE'));
  // Mensagens que falharam por instabilidade da API ficam "na fila": tenta de novo a cada minuto
  const hasPendingWhatsApp = whatsappMessages.some((m) => m.status === 'PENDING');
  useEffect(() => {
    if (!isSupabaseConfigured || !hasPendingWhatsApp) return;
    const timer = window.setInterval(() => { void supabase.rpc('wake_whatsapp_dispatch'); }, 60_000);
    return () => window.clearInterval(timer);
  }, [hasPendingWhatsApp]);

  // Mesma regra do banco (cancel_delivery_order)
  const canCancel = ['MASTER', 'GERENTE', 'CAIXA'].includes(currentProfile.role);
  const canManage = ['MASTER', 'GERENTE'].includes(currentProfile.role);

  // Tipo do pedido: entregador vê só as entregas
  const [kindFilter, setKindFilter] = useState<OrderKind | 'ALL'>(() => peekOrderKindFocus() ?? (currentProfile.role === 'ENTREGADOR' ? 'DELIVERY' : 'ALL'));
  useEffect(() => { clearOrderKindFocus(); }, []);
  const typedOrders = deliveryOrders.filter((order) => (kindFilter === 'ALL' ? orderKind(order) !== 'DINE_IN' : orderKind(order) === kindFilter));
  const openShiftId = useShiftStore((s) => (s.currentShift?.status === 'ABERTO' ? s.currentShift.id : null));
  const isDeliveredHere = (o: DeliveryOrder) => o.status === 'DELIVERED' && (!openShiftId || o.shift_id === openShiftId);
  const filteredOrders = typedOrders.filter((order) => {
    if (filter === 'ALL_ACTIVE') return isInProduction(order.status);
    if (filter === 'AWAITING_PAYMENT') return order.status === 'AWAITING_PAYMENT';
    if (filter === 'READY') return order.status === 'READY';
    if (filter === 'OUT_FOR_DELIVERY') return order.status === 'OUT_FOR_DELIVERY';
    if (filter === 'DELIVERED') return isDeliveredHere(order);
    return true;
  });

  const handleAdvanceStatus = async (order: DeliveryOrder) => {
    try {
      if (order.status === 'CONFIRMED') {
        updateDeliveryStatus(order.id, 'PREPARING');
      } else if (order.status === 'PREPARING') {
        updateDeliveryStatus(order.id, 'READY');
      } else if (order.status === 'READY' && isPickupOrder(order)) {
        updateDeliveryStatus(order.id, 'DELIVERED');
      } else if (order.status === 'READY') {
        // Entregador: um toque só, com o próprio nome. Caixa/gerente informam quem levou.
        const driverName = currentProfile.role === 'ENTREGADOR'
          ? currentProfile.name
          : await requestText({ title: "Saiu para entrega", label: "Nome do entregador", confirmText: "Confirmar saída", multiline: false, message: 'Quem está levando o pedido? O cliente recebe o aviso no WhatsApp.', initialValue: order.driver_name ?? '' });
        if (driverName) {
          updateDeliveryStatus(order.id, 'OUT_FOR_DELIVERY', driverName);
          notify(`Pedido #${order.order_number} saiu para entrega. Cliente avisado.`, 'success');
        }
      } else if (order.status === 'OUT_FOR_DELIVERY') {
        updateDeliveryStatus(order.id, 'DELIVERED');
      }

    } catch (error: unknown) {
      notify(error instanceof Error ? error.message : 'Não foi possível concluir a operação. Tente novamente.', 'error');
    }
  };

  const { cancel: handleCancelOrder } = useCancelDeliveryOrder();

  // Mesmo texto das mensagens automáticas (Configurações → WhatsApp), aberto no WhatsApp da loja
  const sendWhatsAppUpdate = (order: DeliveryOrder) => {
    const template = resolveWhatsAppTemplates(settings.whatsapp_templates)[manualEvent(order)];
    const msg = renderWhatsAppTemplate(template.text, whatsAppVariables(order, settings.name, publicAppUrl()));
    window.open(buildWhatsAppLink(order.phone, msg), '_blank', 'noopener,noreferrer');
  };

  // Pedido parado no PIX: reabre a página do pedido (com o QR do PIX) no WhatsApp do cliente
  const resendPixLink = (order: DeliveryOrder) => {
    const vars = whatsAppVariables(order, settings.name, publicAppUrl());
    const msg = `Olá, ${order.customer_name.trim().split(' ')[0]}! Seu pedido #${order.order_number} está aguardando o PIX. Pague por aqui: ${vars.link}`;
    window.open(buildWhatsAppLink(order.phone, msg), '_blank', 'noopener,noreferrer');
  };

  /** Ação principal do cartão (48px), conforme a etapa. */
  const mainAction = (order: DeliveryOrder): { label: string; short: string; icon: typeof Bike; tone: string; run: () => void } | null => {
    const pickup = isPickupOrder(order);
    const advance = () => void handleAdvanceStatus(order);
    switch (order.status) {
      case 'AWAITING_PAYMENT': return { label: 'Reenviar link do PIX', short: 'Link PIX', icon: Send, tone: 'btn-secondary', run: () => resendPixLink(order) };
      case 'CONFIRMED': return { label: 'Iniciar preparo', short: 'Preparar', icon: Flame, tone: 'btn-primary', run: advance };
      case 'PREPARING': return { label: 'Pedido pronto', short: 'Pronto', icon: PackageCheck, tone: 'btn-success', run: advance };
      case 'READY': return pickup ? { label: isDineInOrder(order) ? 'Concluir pedido' : 'Cliente retirou', short: isDineInOrder(order) ? 'Concluir' : 'Retirou', icon: CheckCheck, tone: 'btn-success', run: advance } : { label: 'Saiu para entrega', short: 'Saiu', icon: Bike, tone: 'btn-primary', run: advance };
      case 'OUT_FOR_DELIVERY': return { label: 'Confirmar entrega', short: 'Entregue', icon: CheckCheck, tone: 'btn-success', run: advance };
      default: return null;
    }
  };

  const countActive = typedOrders.filter((o) => isInProduction(o.status)).length;
  const countAwaiting = typedOrders.filter((o) => o.status === 'AWAITING_PAYMENT').length;
  const countReady = typedOrders.filter((o) => o.status === 'READY').length;
  const countDispatched = typedOrders.filter((o) => o.status === 'OUT_FOR_DELIVERY').length;
  const countDelivered = typedOrders.filter(isDeliveredHere).length;

  return (
    <div className="page-layout">

      <PageHeader eyebrow="Pedidos e entregas" title="Delivery" description="Acompanhe cada pedido, organize as saídas e mantenha o cliente informado." icon={Bike} />

      {/* Abas de navegação */}
      <div className="flex flex-wrap gap-2 border-b border-line pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`filter-chip ${activeTab === 'orders' ? 'is-active' : ''}`}
          aria-pressed={activeTab === 'orders'}
        >
          <Bike className="h-4 w-4" />
          <span>Pedidos</span>
        </button>
        {canManage && (
          <button
            type="button"
            onClick={() => setActiveTab('payouts')}
            className={`filter-chip ${activeTab === 'payouts' ? 'is-active' : ''}`}
            aria-pressed={activeTab === 'payouts'}
          >
            <DollarSign className="h-4 w-4" />
            <span className="sm:hidden">Motoboys</span>
            <span className="hidden sm:inline">Pagamento dos motoboys</span>
          </button>
        )}
      </div>

      {activeTab === 'payouts' ? (
        <DriverPayoutsView />
      ) : (
      <>
      {/* Tipo do pedido: cada um na sua aba */}
      <div className="flex max-w-full gap-0.5 overflow-x-auto rounded-md bg-surface-muted p-1" role="group" aria-label="Tipo de pedido">
        {([['ALL', 'Todos'], ['DELIVERY', 'Entrega'], ['PICKUP', 'Retirada'], ['DINE_IN', 'Consumir no local']] as const).map(([key, label]) => {
          const active = deliveryOrders.filter((o) => isInProduction(o.status) || o.status === 'OUT_FOR_DELIVERY' || o.status === 'AWAITING_PAYMENT');
          const count = key === 'ALL' ? active.filter((o) => orderKind(o) !== 'DINE_IN').length : active.filter((o) => orderKind(o) === key).length;
          return <button key={key} type="button" aria-pressed={kindFilter === key} onClick={() => setKindFilter(key)} className={`min-h-[44px] shrink-0 whitespace-nowrap rounded-sm px-3 text-sm font-medium ${kindFilter === key ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted'}`}>{label} <span className="font-mono">{count}</span></button>;
        })}
      </div>
      {/* Filtros: a contagem fica no próprio filtro */}
      <div className="flex flex-wrap items-center gap-2 pb-1">
        {([
          ['ALL_ACTIVE', 'Em produção', countActive, Flame],
          ...(countAwaiting > 0 ? [['AWAITING_PAYMENT', 'Aguardando PIX', countAwaiting, Clock3] as const] : []),
          ['READY', 'Prontos', countReady, PackageCheck],
          ['OUT_FOR_DELIVERY', 'Em entrega', countDispatched, Bike],
          ['DELIVERED', 'Entregues', countDelivered, CheckCheck],
        ] as const).map(([key, label, count, Icon]) => (
          <button key={key} onClick={() => setFilter(key)} className={`filter-chip ${filter === key ? 'is-active' : ''}`} type="button" aria-pressed={filter === key}>
            <Icon className="w-4 h-4" aria-hidden="true" />
            <span>{label} <span className="font-mono">{count}</span></span>
          </button>
        ))}
      </div>

      {filteredOrders.length === 0 ? (
        <EmptyState title="Nenhum pedido nesta etapa" description="Os pedidos do cardápio digital aparecerão aqui para acompanhamento." icon={Bike} />
      ) : (
        <ul className="grid grid-cols-1 items-start gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Pedidos">
          {filteredOrders.map((order) => {
            const isPickup = isPickupOrder(order);
            const status = getDeliveryStatusConfig(order.status, order.order_type);
            const isActive = order.status !== 'DELIVERED' && order.status !== 'CANCELLED';
            const eta = etaMaxMinutes(settings, isPickup);
            const elapsed = minutesSince(order.created_at, now);
            // Passou da previsão de Configurações (entrega ou retirada)
            const lateBy = isActive && order.status !== 'AWAITING_PAYMENT' ? Math.max(0, elapsed - eta) : 0;
            const level = !isActive ? null : lateBy > 0 ? 'urgent' : elapsed >= eta * 0.75 ? 'warning' : 'ok';
            const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
            const action = mainAction(order);
            const isOpen = Boolean(openCards[order.id]);

            return (
              <li key={order.id} className="flex flex-col rounded-xl border border-line bg-surface shadow-xs">
                {/* Mesmo formato do cartão da Produção: fechado todos têm a mesma altura */}
                <div className="flex h-10 items-center gap-2 px-3">
                  <button type="button" onClick={() => toggleCard(order.id)} aria-expanded={isOpen} aria-label={`${isOpen ? 'Fechar' : 'Ver'} pedido #${order.order_number} de ${order.customer_name}`} className="flex h-full min-w-0 flex-1 items-center gap-2 text-left">
                    <h4 className="max-w-[70%] shrink-0 truncate text-base font-bold leading-tight tracking-tight text-ink tabular-nums">#{order.order_number} {order.customer_name}</h4>
                    <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">{isPickup ? (isDineInOrder(order) ? 'Local' : 'Retirada') : order.address_neighborhood || 'Entrega'}</span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-ink-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                  {action && (
                    <button type="button" onClick={action.run} aria-label={action.label} title={action.label} className={`${action.tone} h-8 min-h-0 shrink-0 px-2 text-xs font-bold`}>
                      <action.icon className="h-4 w-4" aria-hidden="true" />{action.short}
                    </button>
                  )}
                </div>

                {isOpen && (
                  <div className="space-y-3 border-t border-line px-3 py-3">
                    <p className="flex items-center justify-between gap-2 text-[15px]">
                      <span className="min-w-0 font-semibold text-ink-secondary">{isPickup ? (isDineInOrder(order) ? 'Consumir no local' : 'Retirada no balcão') : `Entrega · ${order.address_neighborhood || 'sem bairro'}`}</span>
                      <span className="shrink-0 font-mono font-bold text-ink">{formatBRL(order.total)} · {timeOf(order.created_at)}</span>
                    </p>
                {/* Endereço e telefone */}
                <div className="space-y-1 text-[15px] text-ink">
                  {!isPickup && (
                    <p className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
                      <span>
                        <strong>{order.address_street}, {order.address_number}</strong>
                        {order.address_complement && ` · ${order.address_complement}`}
                        {order.address_reference && <span className="block text-amber-800">Ref: {order.address_reference}</span>}
                      </span>
                    </p>
                  )}
                  <p className="flex items-center gap-2 text-ink-secondary"><Phone className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />{order.phone}</p>
                </div>

                  <div className="space-y-1.5 text-[15px]">
                    {order.items.map((item) => (
                      <div key={item.id} className="flex items-start justify-between gap-2">
                        <span className="text-ink">
                          <span className="font-mono font-bold">{item.quantity}x</span> {item.product_name}
                          {item.doneness && <span className="ml-1.5 text-sm text-amber-800">{formatDoneness(item.doneness)}</span>}
                          {item.notes && <span className="block text-sm text-ink-muted">Obs: {item.notes}</span>}
                        </span>
                        <span className="shrink-0 font-mono text-ink-muted">{formatBRL(item.unit_price * item.quantity)}</span>
                      </div>
                    ))}
                    <StatusTimeline order={order} />
                    <WhatsAppStatus messages={whatsappMessages.filter((m) => m.delivery_order_id === order.id)} onRetry={(id) => void retryWhatsAppMessage(id)} />
                  </div>
                {/* Pagamento numa linha só */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-[15px]">
                  <span className="text-ink">{paymentLine(order)}</span>
                  {canCancel && order.status !== 'CANCELLED' && (
                    order.paid_at
                      ? <button type="button" className="min-h-[44px] text-sm font-semibold text-ink-secondary underline" onClick={() => void markDeliveryPaid(order.id, false)}>Desfazer</button>
                      : <button type="button" className="btn-secondary min-h-[44px] px-3 text-sm" onClick={() => void markDeliveryPaid(order.id, true)}><BadgeCheck className="h-4 w-4" aria-hidden="true" />{order.payment_method === 'PIX' ? 'PIX recebido' : 'Marcar pago'}</button>
                  )}
                </div>

                  <div className="flex gap-2">
                    <button type="button" onClick={() => sendWhatsAppUpdate(order)} className="btn-secondary min-h-[44px] flex-1 px-3.5" aria-label="Enviar atualização de status no WhatsApp do cliente">
                      <MessageCircle className="h-4 w-4 text-ink-muted" aria-hidden="true" />WhatsApp
                    </button>
                    {isActive && canCancel && (
                      <details className="relative">
                        <summary className="btn-secondary flex min-h-[44px] min-w-[44px] cursor-pointer list-none items-center justify-center px-3 [&::-webkit-details-marker]:hidden" aria-label={`Mais opções do pedido #${order.order_number}`}>
                          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                        </summary>
                        <div className="absolute bottom-full right-0 z-10 mb-1 w-48 rounded-md border border-line bg-surface p-1 shadow-card">
                          <button type="button" onClick={() => void handleCancelOrder(order)} className="flex min-h-[44px] w-full items-center gap-2 rounded-md px-3 text-left text-[15px] font-semibold text-rose-700 hover:bg-rose-50">
                            <Trash2 className="h-4 w-4" aria-hidden="true" />Cancelar pedido
                          </button>
                        </div>
                      </details>
                    )}
                  </div>
                  {order.driver_name && <p className="text-center text-sm text-ink-secondary">Entregador: <strong>{order.driver_name}</strong></p>}
                  </div>
                )}

                <div className={`flex h-7 items-center justify-between gap-2 rounded-b-xl px-3 text-xs font-bold ${level ? LEVEL_STRIP[level] : 'bg-surface-muted text-ink-secondary'}`}>
                  <span className="min-w-0 truncate">{itemCount} {itemCount === 1 ? 'item' : 'itens'} · {lateBy > 0 ? `Atrasado ${lateBy} min` : order.status === 'PREPARING' && !hasGrillItems(order) ? 'Em preparo' : status.label}</span>
                  {isActive && <span className="shrink-0 font-mono text-sm font-black"><KDSElapsedTimer compact createdAt={stageStart(order)} /></span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      </>
      )}
    </div>
  );
};
