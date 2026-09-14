import {
  Bike,
  CheckCheck,
  Flame,
  MapPin,
  MessageCircle,
  Phone,
  Trash2
} from 'lucide-react';
import React,{ useState } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatCard } from '../../components/ui/StatCard';
import { getDeliveryStatusConfig } from '../../lib/deliveryStatus';
import { formatBRL,formatDoneness } from '../../lib/formatters';
import {
  buildDeliveryConfirmedWhatsAppMessage,
  buildDeliveryDispatchedWhatsAppMessage,
  buildWhatsAppLink
} from '../../lib/whatsapp';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDeliveryStore } from '../../stores/useDeliveryStore';
import { DeliveryOrder } from '../../types/domain';

type DeliveryFilter = 'ALL_ACTIVE' | 'OUT_FOR_DELIVERY' | 'DELIVERED';

export const DeliveryManagementView: React.FC = () => {
  const { deliveryOrders, updateDeliveryStatus, cancelDeliveryOrderAtomic } = useDeliveryStore();
  const { currentProfile } = useAuthStore();

  const [filter, setFilter] = useState<DeliveryFilter>('ALL_ACTIVE');

  const filteredOrders = deliveryOrders.filter((order) => {
    if (filter === 'ALL_ACTIVE') return order.status === 'CONFIRMED' || order.status === 'PREPARING';
    if (filter === 'OUT_FOR_DELIVERY') return order.status === 'OUT_FOR_DELIVERY';
    if (filter === 'DELIVERED') return order.status === 'DELIVERED';
    return true;
  });

  const handleAdvanceStatus = (order: DeliveryOrder) => {
    if (order.status === 'CONFIRMED') {
      updateDeliveryStatus(order.id, 'PREPARING');
    } else if (order.status === 'PREPARING') {
      const driverName = prompt('Nome do Motoboy responsável pela entrega:', 'Carlos Motoboy');
      if (driverName) {
        updateDeliveryStatus(order.id, 'OUT_FOR_DELIVERY', driverName);
      }
    } else if (order.status === 'OUT_FOR_DELIVERY') {
      updateDeliveryStatus(order.id, 'DELIVERED');
    }
  };

  const handleCancelOrder = (order: DeliveryOrder) => {
    const reason = prompt(`Motivo do cancelamento do pedido #${order.order_number}:`, 'Desistência do cliente');
    if (!reason) return;
    cancelDeliveryOrderAtomic(order.id, reason, currentProfile.id);
  };

  const sendWhatsAppUpdate = (order: DeliveryOrder) => {
    let msg = '';
    if (order.status === 'OUT_FOR_DELIVERY') {
      msg = buildDeliveryDispatchedWhatsAppMessage({
        orderNumber: order.order_number,
        customerName: order.customer_name,
        driverName: order.driver_name,
        total: order.total,
        paymentMethod: order.payment_method,
        cashChangeFor: order.cash_change_for,
      });
    } else {
      const itemsSummary = order.items
        .map((i) => `• ${i.quantity}x ${i.product_name}${i.doneness ? ` (${formatDoneness(i.doneness)})` : ''}`)
        .join('\n');

      msg = buildDeliveryConfirmedWhatsAppMessage({
        orderNumber: order.order_number,
        customerName: order.customer_name,
        address: `${order.address_street}, ${order.address_number} - ${order.address_neighborhood}`,
        subtotal: order.subtotal,
        deliveryFee: order.delivery_fee,
        total: order.total,
        itemsSummary,
      });
    }

    const link = buildWhatsAppLink(order.phone, msg);
    window.open(link, '_blank');
  };

  const countActive = deliveryOrders.filter((o) => o.status === 'CONFIRMED' || o.status === 'PREPARING').length;
  const countDispatched = deliveryOrders.filter((o) => o.status === 'OUT_FOR_DELIVERY').length;
  const countDelivered = deliveryOrders.filter((o) => o.status === 'DELIVERED').length;

  return (
    <div className="page-layout">
      
      <PageHeader eyebrow="Pedidos e entregas" title="Delivery" description="Acompanhe cada pedido, organize as saídas e mantenha o cliente informado." icon={Bike} />
      <div className="stat-grid">
        <StatCard label="Em produção" value={countActive} hint="Confirmados e em preparo" icon={Flame} tone="warning" />
        <StatCard label="Em rota de entrega" value={countDispatched} hint="Pedidos com o entregador" icon={Bike} tone="info" />
        <StatCard label="Entregas concluídas" value={countDelivered} hint="Pedidos entregues" icon={CheckCheck} tone="success" />
      </div>

      {/* Filtros Rápidos */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setFilter('ALL_ACTIVE')}
          className={`filter-chip ${filter === 'ALL_ACTIVE' ? 'is-active' : ''}`}
         type="button" aria-pressed={filter === 'ALL_ACTIVE'}>
          <Flame className="w-4 h-4" />
          <span>Em Produção / Brasa ({countActive})</span>
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
            const isDispatched = order.status === 'OUT_FOR_DELIVERY';
            const isDelivered = order.status === 'DELIVERED';
            const status = getDeliveryStatusConfig(order.status);

            return (
              <div
                key={order.id}
                className={`p-5 rounded-2xl border transition flex flex-col justify-between space-y-4 shadow-sm ${
                  isDispatched
                    ? 'bg-sky-50 border-sky-300 ring-1 ring-sky-300'
                    : isPreparing
                    ? 'bg-brand-50 border-brand-300'
                    : 'bg-surface-muted border-line hover:border-brand-300'
                }`}
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                    <div>
                      <span className="text-2xl font-bold tabular-nums text-ink">
                        #{order.order_number}
                      </span>
                      <h4 className="font-bold text-ink text-sm">
                        {order.customer_name}
                      </h4>
                    </div>

                    <div className="text-right">
                      <span className="text-sm tabular-nums font-bold text-brand-700 block">
                        {formatBRL(order.total)}
                      </span>
                      <span className="text-xs text-ink-muted tabular-nums">
                        {new Date(order.created_at).toLocaleTimeString('pt-BR')}
                      </span>
                    </div>
                  </div>

                  <span className={`status-badge mt-3 ${status.classes}`}>{status.label}</span>

                  {/* Endereço Completo de Entrega */}
                  <div className="mt-3.5 p-3.5 rounded-2xl bg-surface-muted border border-line space-y-1.5 text-xs">
                    <div className="flex items-center gap-2 text-ink font-bold">
                      <MapPin className="w-3.5 h-3.5 text-rose-700 shrink-0" />
                      <span>{order.address_street}, {order.address_number}</span>
                    </div>
                    <p className="text-ink-muted pl-5 text-xs">
                      Bairro: <strong className="text-ink">{order.address_neighborhood}</strong>
                      {order.address_complement && ` • Comp: ${order.address_complement}`}
                    </p>
                    {order.address_reference && (
                      <p className="text-amber-800 pl-5 text-xs italic">
                        Ref: {order.address_reference}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 text-ink-muted pl-5 text-xs">
                      <Phone className="w-3 h-3" />
                      <span>{order.phone}</span>
                    </div>
                  </div>

                  {/* Itens do Pedido */}
                  <div className="mt-3.5 space-y-1.5 text-xs">
                    <span className="text-xs font-bold text-ink-muted">
                      Itens para Embalar:
                    </span>
                    {order.items.map((item) => (
                      <div key={item.id} className="flex justify-between items-start text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="tabular-nums font-bold text-ink">{item.quantity}x</span>
                          <span className="text-ink font-medium">{item.product_name}</span>
                          {item.doneness && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 tabular-nums">
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
                  <div className="mt-3.5 p-3 rounded-2xl bg-surface-muted border border-line flex items-center justify-between text-xs">
                    <div>
                      <span className="text-xs text-ink-muted font-semibold">Forma:</span>
                      <div className="font-bold text-ink">
                        {order.payment_method === 'PIX' ? 'PIX' : order.payment_method === 'DINHEIRO' ? 'Dinheiro' : 'Cartão na entrega'}
                      </div>
                    </div>
                    {order.cash_change_for && (
                      <div className="text-right text-emerald-700 tabular-nums font-bold text-xs">
                        Troco para {formatBRL(order.cash_change_for)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Ações Operacionais */}
                <div className="border-t border-line pt-3.5 space-y-2">
                  <div className="flex gap-2">
                    {/* Botão de Avançar Status */}
                    {!isDelivered && (
                      <button
                        onClick={() => handleAdvanceStatus(order)}
                        className={`flex-1 py-3 rounded-2xl font-bold text-xs transition flex items-center justify-center gap-2 shadow-sm ${
                          isConfirmed
                            ? 'btn-primary text-white'
                            : isPreparing
                            ? 'bg-sky-700 hover:bg-sky-800 text-white'
                            : 'btn-success'
                        }`}
                       type="button">
                        {isConfirmed && <span>Iniciar Preparo</span>}
                        {isPreparing && (
                          <>
                            <Bike className="w-4 h-4" />
                            <span>Despachar Motoboy</span>
                          </>
                        )}
                        {isDispatched && (
                          <>
                            <CheckCheck className="w-4 h-4" />
                            <span>Confirmar Entrega</span>
                          </>
                        )}
                      </button>
                    )}

                    {/* Botão de WhatsApp para Avisar Cliente */}
                    <button
                      onClick={() => sendWhatsAppUpdate(order)}
                      className="px-3.5 py-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs transition flex items-center gap-1.5 shadow-sm"
                      title="Enviar atualização de status no WhatsApp do cliente"
                     type="button" aria-label="Enviar atualização de status no WhatsApp do cliente">
                      <MessageCircle className="w-4 h-4 text-emerald-700" />
                      <span className="hidden sm:inline">WhatsApp</span>
                    </button>

                    {/* Cancelar */}
                    {!isDelivered && (
                      <button
                        onClick={() => handleCancelOrder(order)}
                        className="p-3 rounded-2xl text-ink-muted hover:text-rose-700 hover:bg-rose-50 border border-line transition"
                        title="Cancelar pedido"
                       type="button" aria-label="Cancelar pedido">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {order.driver_name && (
                    <div className="text-center text-xs text-sky-800 tabular-nums pt-1">
                      🛵 Motoboy: <strong>{order.driver_name}</strong>
                    </div>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
