import { StatusTag } from '../../components/ui/StatusTag';
import {
  BadgeCheck,
  Bike,
  CheckCheck,
  Clock3,
  DollarSign,
  Flame,
  MapPin,
  MessageCircle,
  PackageCheck,
  Phone,
  Store,
  Trash2
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { DriverPayoutsView } from './DriverPayoutsView';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { EmptyState } from '../../components/ui/EmptyState';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatCard } from '../../components/ui/StatCard';
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
import { KDSElapsedTimer, LEVEL_CARD, elapsedLevel, useNow } from '../kds/KDSElapsedTimer';

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
      <div className="stat-grid stat-grid--three">
        <StatCard label="Em produção" value={countActive} hint="Confirmados, em preparo e prontos" icon={Flame} tone="warning" />
        <StatCard label="Em rota de entrega" value={countDispatched} hint="Pedidos com o entregador" icon={Bike} tone="info" />
        <StatCard label="Entregas concluídas" value={countDelivered} hint="Pedidos entregues" icon={CheckCheck} tone="success" />
      </div>

      {/* Filtros Rápidos */}
      <div className="flex flex-wrap items-center gap-2 pb-1 text-xs">
        <button
          onClick={() => setFilter('ALL_ACTIVE')}
          className={`filter-chip ${filter === 'ALL_ACTIVE' ? 'is-active' : ''}`}
          type="button" aria-pressed={filter === 'ALL_ACTIVE'}>
          <Flame className="w-4 h-4" />
          <span>Em produção ({countActive})</span>
        </button>

        {countAwaiting > 0 && (
          <button
            onClick={() => setFilter('AWAITING_PAYMENT')}
            className={`filter-chip ${filter === 'AWAITING_PAYMENT' ? 'is-active' : ''}`}
            type="button" aria-pressed={filter === 'AWAITING_PAYMENT'}>
            <Clock3 className="w-4 h-4" />
            <span>Aguardando PIX ({countAwaiting})</span>
          </button>
        )}

        <button
          onClick={() => setFilter('READY')}
          className={`filter-chip ${filter === 'READY' ? 'is-active' : ''}`}
          type="button" aria-pressed={filter === 'READY'}>
          <PackageCheck className="w-4 h-4" />
          <span>Prontos ({countReady})</span>
        </button>

        <button
          onClick={() => setFilter('OUT_FOR_DELIVERY')}
          className={`filter-chip ${filter === 'OUT_FOR_DELIVERY' ? 'is-active' : ''}`}
          type="button" aria-pressed={filter === 'OUT_FOR_DELIVERY'}>
          <Bike className="w-4 h-4" />
          <span>Em entrega ({countDispatched})</span>
        </button>

        <button
          onClick={() => setFilter('DELIVERED')}
          className={`filter-chip ${filter === 'DELIVERED' ? 'is-active' : ''}`}
          type="button" aria-pressed={filter === 'DELIVERED'}>
          <CheckCheck className="w-4 h-4" />
          <span>Entregues ({countDelivered})</span>
        </button>
      </div>

      {/* Grade de Pedidos de Delivery */}
      {filteredOrders.length === 0 ? (
        <EmptyState title="Nenhum pedido nesta etapa" description="Os pedidos do cardápio digital aparecerão aqui para acompanhamento." icon={Bike} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredOrders.map((order) => {
            const isConfirmed = order.status === 'CONFIRMED';
            const isPreparing = order.status === 'PREPARING';
            const isReady = order.status === 'READY';
            const isDispatched = order.status === 'OUT_FOR_DELIVERY';
            const isDelivered = order.status === 'DELIVERED';
            const isPickup = isPickupOrder(order);
            const status = getDeliveryStatusConfig(order.status, order.order_type);
            const isActive = !isDelivered && order.status !== 'CANCELLED';

            return (
              <div
                key={order.id}
                className={`p-5 rounded-lg border border-line border-l-8 bg-surface flex flex-col justify-between space-y-4 ${isActive ? LEVEL_CARD[elapsedLevel(order.created_at, now, 30, 45)] : 'border-l-line'}`}
              >
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
                    <div className="min-w-0">
                      <span className="text-sm font-semibold tabular-nums text-ink-muted">
                        #{order.order_number} · {formatBRL(order.total)}
                      </span>
                      <h4 className="break-words text-2xl font-bold leading-tight text-ink">
                        {order.customer_name}
                      </h4>
                    </div>

                    {isActive ? (
                      <KDSElapsedTimer createdAt={order.created_at} warningMinutes={30} urgentMinutes={45} />
                    ) : (
                      <span className="text-xs text-ink-muted tabular-nums">
                        {new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <StatusTag kind={status.kind} className="font-semibold">{status.label}</StatusTag>
                    <span className="text-sm text-ink-secondary">{isPickup ? 'Retirada no local' : 'Entrega'}</span>
                  </div>
                  <StatusTimeline order={order} />

                  {isPickup ? (
                    <div className="mt-3.5 p-3.5 rounded-md bg-surface-soft space-y-1.5 text-[15px]">
                      <div className="flex items-center gap-2 text-ink font-bold">
                        <Store className="w-4 h-4 text-ink-muted shrink-0" />
                        <span>Cliente vem buscar no balcão</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-ink-muted pl-5 text-sm">
                        <Phone className="w-3 h-3" />
                        <span>{order.phone}</span>
                      </div>
                    </div>
                  ) : (
                  /* Endereço Completo de Entrega */
                  <div className="mt-3.5 p-3.5 rounded-md bg-surface-soft space-y-1.5 text-[15px]">
                    <div className="flex items-center gap-2 text-ink font-bold">
                      <MapPin className="w-3.5 h-3.5 text-rose-700 shrink-0" />
                      <span>{order.address_street}, {order.address_number}</span>
                    </div>
                    <p className="text-ink-muted pl-5 text-sm">
                      Bairro: <strong className="text-ink">{order.address_neighborhood}</strong>
                      {order.address_complement && ` • Comp: ${order.address_complement}`}
                    </p>
                    {order.address_reference && (
                      <p className="text-amber-800 pl-5 text-sm">
                        Ref: {order.address_reference}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 text-ink-muted pl-5 text-sm">
                      <Phone className="w-3 h-3" />
                      <span>{order.phone}</span>
                    </div>
                  </div>
                  )}

                  {/* Itens do Pedido */}
                  <div className="mt-3.5 space-y-1.5 text-[15px]">
                    <span className="text-xs font-bold text-ink-muted">
                      Itens para embalar
                    </span>
                    {order.items.map((item) => (
                      <div key={item.id} className="flex justify-between items-start text-[15px]">
                        <div className="flex items-center gap-1.5">
                          <span className="tabular-nums font-bold text-ink">{item.quantity}x</span>
                          <span className="text-ink font-medium">{item.product_name}</span>
                          {item.doneness && (
                            <span className="text-xs px-1.5 py-0.5 rounded-sm bg-amber-100 text-amber-800 tabular-nums">
                              {formatDoneness(item.doneness)}
                            </span>
                          )}
                        </div>
                        <span className="tabular-nums text-ink-muted font-bold">
                          {formatBRL(item.unit_price * item.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Pagamento e Troco */}
                  <div className="mt-3.5 p-3 rounded-md bg-surface-soft flex items-center justify-between text-[15px]">
                    <div>
                      <span className="text-xs text-ink-muted font-semibold">Forma:</span>
                      <div className="font-bold text-ink">
                        {deliveryPaymentLabel(order.payment_method, order.order_type)}
                      </div>
                    </div>
                    {order.cash_change_for && (
                      <div className="text-right text-emerald-700 tabular-nums font-bold text-xs">
                        Troco para {formatBRL(order.cash_change_for)}
                      </div>
                    )}
                  </div>

                  {/* Confirmação do pagamento (PIX conferido no banco) */}
                  <div className={`mt-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3 text-xs ${order.paid_at ? 'bg-emerald-50 text-emerald-900' : order.payment_method === 'PIX' ? 'bg-amber-50 text-amber-900' : 'border-line bg-surface-muted text-ink-muted'}`}>
                    <span className="flex items-center gap-1.5 font-semibold">
                      {order.paid_at ? <><BadgeCheck className="h-4 w-4" aria-hidden="true" />Pago às {new Date(order.paid_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</>
                        : order.payment_method === 'PIX' ? <><Clock3 className="h-4 w-4" aria-hidden="true" />Aguardando PIX</>
                        : isPickup ? 'Receber na retirada' : 'Receber na entrega'}
                    </span>
                    {canCancel && order.status !== 'CANCELLED' && (
                      order.paid_at
                        ? <button type="button" className="font-semibold underline" onClick={() => void markDeliveryPaid(order.id, false)}>Desfazer</button>
                        : <button type="button" className="btn-success px-3 py-1.5 text-xs" onClick={() => void markDeliveryPaid(order.id, true)}><BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />{order.payment_method === 'PIX' ? 'PIX recebido' : 'Marcar pago'}</button>
                    )}
                  </div>

                  <WhatsAppStatus messages={whatsappMessages.filter((m) => m.delivery_order_id === order.id)} onRetry={(id) => void retryWhatsAppMessage(id)} />
                </div>

                {/* Ações Operacionais */}
                <div className="border-t border-line pt-3.5 space-y-2">
                  {/* Ação principal em linha própria (largura total) para nunca cortar o texto no cartão estreito */}
                  <div className="flex flex-wrap gap-2">
                    {/* Botão de Avançar Status */}
                    {!isDelivered && order.status !== 'AWAITING_PAYMENT' && (
                      <button
                        onClick={() => handleAdvanceStatus(order)}
                        className={`basis-full min-h-[48px] whitespace-nowrap px-3 rounded-md font-semibold text-[15px] transition flex items-center justify-center gap-2 ${isConfirmed
                            ? 'btn-primary text-white'
                            : isPreparing
                              ? 'btn-success'
                              : isReady
                                ? 'btn-primary'
                                : 'btn-success'
                          }`}
                        type="button">
                        {isConfirmed && <span>Iniciar preparo</span>}
                        {isPreparing && (
                          <>
                            <PackageCheck className="w-4 h-4" />
                            <span>Pedido pronto</span>
                          </>
                        )}
                        {isReady && isPickup && (
                          <>
                            <CheckCheck className="w-4 h-4" />
                            <span>Cliente retirou</span>
                          </>
                        )}
                        {isReady && !isPickup && (
                          <>
                            <Bike className="w-4 h-4" />
                            <span>Saiu para entrega</span>
                          </>
                        )}
                        {isDispatched && (
                          <>
                            <CheckCheck className="w-4 h-4" />
                            <span>Confirmar entrega</span>
                          </>
                        )}
                      </button>
                    )}

                    {/* Botão de WhatsApp para Avisar Cliente */}
                    <button
                      onClick={() => sendWhatsAppUpdate(order)}
                      className="btn-secondary min-h-[44px] flex-1 px-3.5"
                      title="Enviar atualização de status no WhatsApp do cliente"
                      type="button" aria-label="Enviar atualização de status no WhatsApp do cliente">
                      <MessageCircle className="w-4 h-4 text-emerald-700" />
                      <span>WhatsApp</span>
                    </button>

                    {/* Cancelar */}
                    {!isDelivered && canCancel && (
                      <button
                        onClick={() => void handleCancelOrder(order)}
                        className="btn-secondary min-h-[44px] flex-1 px-3 text-rose-700 hover:bg-rose-50"
                        title="Cancelar pedido"
                        type="button" aria-label={`Cancelar pedido #${order.order_number}`}>
                        <Trash2 className="h-4 w-4" />
                        <span>Cancelar</span>
                      </button>
                    )}
                  </div>

                  {order.driver_name && (
                    <div className="text-center text-sm text-ink-secondary pt-1">
                      Motoboy: <strong>{order.driver_name}</strong>
                    </div>
                  )}
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
