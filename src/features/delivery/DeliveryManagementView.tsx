import { StatusTag } from '../../components/ui/StatusTag';
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
import { deliveryPaymentLabel, getDeliveryStatusConfig, isPickupOrder } from '../../lib/deliveryStatus';
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
  PREPARING: 'Em preparo',
  READY: 'Pronto',
  OUT_FOR_DELIVERY: 'Saiu p/ entrega',
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
  else parts.push(pickup ? 'receber na retirada' : 'receber na entrega');
  return parts.join(' · ');
}

/** Hora de cada etapa já registrada (na brasa, pronto, saiu, entregue/retirado). */
function StatusTimeline({ order }: { order: DeliveryOrder }) {
  const pickup = isPickupOrder(order);
  const steps = [
    { label: 'Na brasa', at: order.status === 'AWAITING_PAYMENT' ? null : order.preparing_at ?? order.confirmed_at ?? order.created_at },
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
        <li key={m.id} title={m.last_error ?? undefined} className={`inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[11px] font-semibold ${m.status === 'SENT' ? 'bg-emerald-50 text-emerald-800' : m.status === 'FAILED' ? 'bg-rose-50 text-rose-800' : 'border-line bg-surface-muted text-ink-muted'}`}>
          <MessageCircle className="h-3 w-3" aria-hidden="true" />
          {EVENT_LABEL[m.event] ?? m.event}: {MESSAGE_STATUS_LABEL[m.status]}
          {m.status === 'FAILED' && <button type="button" className="ml-1 underline" onClick={() => onRetry(m.id)}>reenviar</button>}
        </li>
      ))}
    </ul>
  );
}

import { useCancelDeliveryOrder } from './useCancelDeliveryOrder';
import { LEVEL_CARD, useNow } from '../kds/KDSElapsedTimer';

export const DeliveryManagementView: React.FC = () => {
  const { requestText, notify } = useFeedback();
  const { deliveryOrders, updateDeliveryStatus, markDeliveryPaid, whatsappMessages, retryWhatsAppMessage } = useDeliveryStore();
  const { currentProfile } = useAuthStore();
  const settings = useSettingsStore((s) => s.settings);

  const [activeTab, setActiveTab] = useState<'orders' | 'payouts'>('orders');
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

  const filteredOrders = deliveryOrders.filter((order) => {
    if (filter === 'ALL_ACTIVE') return isInProduction(order.status);
    if (filter === 'AWAITING_PAYMENT') return order.status === 'AWAITING_PAYMENT';
    if (filter === 'READY') return order.status === 'READY';
    if (filter === 'OUT_FOR_DELIVERY') return order.status === 'OUT_FOR_DELIVERY';
    if (filter === 'DELIVERED') return order.status === 'DELIVERED';
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
  const mainAction = (order: DeliveryOrder): { label: string; icon: typeof Bike; tone: string; run: () => void } | null => {
    const pickup = isPickupOrder(order);
    const advance = () => void handleAdvanceStatus(order);
    switch (order.status) {
      case 'AWAITING_PAYMENT': return { label: 'Reenviar link do PIX', icon: Send, tone: 'btn-secondary', run: () => resendPixLink(order) };
      case 'CONFIRMED': return { label: 'Iniciar preparo', icon: Flame, tone: 'btn-primary', run: advance };
      case 'PREPARING': return { label: 'Pedido pronto', icon: PackageCheck, tone: 'btn-success', run: advance };
      case 'READY': return pickup ? { label: 'Cliente retirou', icon: CheckCheck, tone: 'btn-success', run: advance } : { label: 'Saiu para entrega', icon: Bike, tone: 'btn-primary', run: advance };
      case 'OUT_FOR_DELIVERY': return { label: 'Confirmar entrega', icon: CheckCheck, tone: 'btn-success', run: advance };
      default: return null;
    }
  };

  const countActive = deliveryOrders.filter((o) => isInProduction(o.status)).length;
  const countAwaiting = deliveryOrders.filter((o) => o.status === 'AWAITING_PAYMENT').length;
  const countReady = deliveryOrders.filter((o) => o.status === 'READY').length;
  const countDispatched = deliveryOrders.filter((o) => o.status === 'OUT_FOR_DELIVERY').length;
  const countDelivered = deliveryOrders.filter((o) => o.status === 'DELIVERED').length;

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
            <span className="sm:hidden">Entregadores</span>
            <span className="hidden sm:inline">Pagamentos dos entregadores</span>
          </button>
        )}
      </div>

      {activeTab === 'payouts' ? (
        <DriverPayoutsView />
      ) : (
      <>
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredOrders.map((order) => {
            const isPickup = isPickupOrder(order);
            const status = getDeliveryStatusConfig(order.status, order.order_type);
            const isActive = order.status !== 'DELIVERED' && order.status !== 'CANCELLED';
            const stageMin = minutesSince(stageStart(order), now);
            const eta = etaMaxMinutes(settings, isPickup);
            const elapsed = minutesSince(order.created_at, now);
            // Passou da previsão de Configurações (entrega ou retirada)
            const lateBy = isActive && order.status !== 'AWAITING_PAYMENT' ? Math.max(0, elapsed - eta) : 0;
            const level = !isActive ? null : lateBy > 0 ? 'urgent' : elapsed >= eta * 0.75 ? 'warning' : 'ok';
            const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
            const action = mainAction(order);

            return (
              <div key={order.id} className={`p-5 rounded-2xl border border-line bg-surface flex flex-col gap-3 ${level ? `border-l-8 ${LEVEL_CARD[level]}` : ''}`}>
                {/* Nº + cliente | total + hora */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-mono text-sm font-semibold text-ink-muted">#{order.order_number}</span>
                    <h4 className="break-words text-2xl font-bold leading-tight text-ink">{order.customer_name}</h4>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="block font-mono text-lg font-bold text-ink">{formatBRL(order.total)}</span>
                    <span className="font-mono text-sm text-ink-muted">{timeOf(order.created_at)}</span>
                  </div>
                </div>

                {/* Etapa com tempo + tipo */}
                <div className="flex flex-wrap items-center gap-2">
                  <StatusTag kind={status.kind} className="font-semibold">{status.label}{isActive ? ` · ${stageMin} min` : ''}</StatusTag>
                  {lateBy > 0 && <StatusTag kind="alert" className="font-semibold">Atrasado {lateBy} min</StatusTag>}
                  <span className="text-[15px] text-ink-secondary">{isPickup ? 'Retirada no balcão' : `Entrega · ${order.address_neighborhood || 'sem bairro'}`}</span>
                </div>

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

                {/* Itens recolhidos (com horários e mensagens do WhatsApp) */}
                <details className="group rounded-md border border-line">
                  <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-3 text-[15px] [&::-webkit-details-marker]:hidden">
                    <span className="font-semibold text-ink">{itemCount} {itemCount === 1 ? 'item' : 'itens'}</span>
                    <span className="flex items-center gap-1 font-semibold text-brand-700">Ver itens<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" /></span>
                  </summary>
                  <div className="space-y-1.5 border-t border-line px-3 py-2.5 text-[15px]">
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
                </details>

                {/* Pagamento numa linha só */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-[15px]">
                  <span className="text-ink">{paymentLine(order)}</span>
                  {canCancel && order.status !== 'CANCELLED' && (
                    order.paid_at
                      ? <button type="button" className="min-h-[44px] text-sm font-semibold text-ink-secondary underline" onClick={() => void markDeliveryPaid(order.id, false)}>Desfazer</button>
                      : <button type="button" className="btn-secondary min-h-[44px] px-3 text-sm" onClick={() => void markDeliveryPaid(order.id, true)}><BadgeCheck className="h-4 w-4" aria-hidden="true" />{order.payment_method === 'PIX' ? 'PIX recebido' : 'Marcar pago'}</button>
                  )}
                </div>

                {/* Ações: principal (48px) + WhatsApp e menu "mais" */}
                <div className="mt-auto space-y-2 border-t border-line pt-3">
                  {action && (
                    <button type="button" onClick={action.run} className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-md px-3 text-[15px] font-semibold ${action.tone}`}>
                      <action.icon className="h-5 w-5" aria-hidden="true" />{action.label}
                    </button>
                  )}
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
              </div>
            );
          })}
        </div>
      )}
      </>
      )}
    </div>
  );
};
