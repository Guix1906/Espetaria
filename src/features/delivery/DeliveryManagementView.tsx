import React, { useState } from 'react';
import { 
  Bike, 
  MapPin, 
  Phone, 
  CheckCheck, 
  Flame, 
  MessageCircle, 
  Trash2, 
  Sparkles
} from 'lucide-react';
import { useDeliveryStore } from '../../stores/useDeliveryStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { DeliveryOrder } from '../../types/domain';
import { formatBRL, formatDoneness } from '../../lib/formatters';
import { 
  buildWhatsAppLink, 
  buildDeliveryConfirmedWhatsAppMessage, 
  buildDeliveryDispatchedWhatsAppMessage 
} from '../../lib/whatsapp';

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
    <div className="min-h-screen bg-obsidian-950 text-obsidian-100 p-3 sm:p-5 space-y-4">
      
      {/* Topo do Painel de Expedição */}
      <div className="bg-carbon-900 border border-carbon-800 p-4 sm:p-5 rounded-3xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-ember-600 to-gold-600 text-obsidian-950 flex items-center justify-center font-black shadow-lg shadow-ember-950/60">
            <Bike className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-wide uppercase font-serif">
                Expedição & Gestão Delivery
              </h2>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-ember-500/10 text-ember-400 border border-ember-500/30 font-mono font-bold tracking-wider">
                CONTROLE EM TEMPO REAL
              </span>
            </div>
            <p className="text-xs text-obsidian-400 mt-0.5">
              Despacho de motoboys, avisos automáticos no WhatsApp e conciliação de entregas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="px-3.5 py-2 rounded-2xl bg-carbon-800 text-obsidian-300 border border-carbon-700 font-bold">
            🔥 {countActive} em preparo
          </span>
          <span className="px-3.5 py-2 rounded-2xl bg-cyan-950/80 text-cyan-300 border border-cyan-700/60 font-bold shadow-md shadow-cyan-950/40">
            🛵 {countDispatched} na rota
          </span>
        </div>
      </div>

      {/* Filtros Rápidos */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setFilter('ALL_ACTIVE')}
          className={`px-4 py-2.5 rounded-2xl font-bold transition flex items-center gap-2 whitespace-nowrap active:scale-95 ${
            filter === 'ALL_ACTIVE'
              ? 'btn-ember text-obsidian-950 shadow-lg'
              : 'bg-carbon-900 text-obsidian-400 border border-carbon-800 hover:text-white hover:border-carbon-700'
          }`}
        >
          <Flame className="w-4 h-4" />
          <span>Em Produção / Brasa ({countActive})</span>
        </button>

        <button
          onClick={() => setFilter('OUT_FOR_DELIVERY')}
          className={`px-4 py-2.5 rounded-2xl font-bold transition flex items-center gap-2 whitespace-nowrap active:scale-95 ${
            filter === 'OUT_FOR_DELIVERY'
              ? 'bg-cyan-600 text-obsidian-950 font-black shadow-lg shadow-cyan-950/60'
              : 'bg-carbon-900 text-obsidian-400 border border-carbon-800 hover:text-white hover:border-carbon-700'
          }`}
        >
          <Bike className="w-4 h-4" />
          <span>Com Motoboy ({countDispatched})</span>
        </button>

        <button
          onClick={() => setFilter('DELIVERED')}
          className={`px-4 py-2.5 rounded-2xl font-bold transition flex items-center gap-2 whitespace-nowrap active:scale-95 ${
            filter === 'DELIVERED'
              ? 'bg-emerald-600 text-white font-black shadow-lg shadow-emerald-950/60'
              : 'bg-carbon-900 text-obsidian-400 border border-carbon-800 hover:text-white hover:border-carbon-700'
          }`}
        >
          <CheckCheck className="w-4 h-4" />
          <span>Entregues Hoje ({countDelivered})</span>
        </button>
      </div>

      {/* Grade de Pedidos de Delivery */}
      {filteredOrders.length === 0 ? (
        <div className="py-20 text-center rounded-3xl bg-carbon-900/60 border border-carbon-800 p-8 space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-carbon-800 border border-carbon-700 text-obsidian-400 flex items-center justify-center mx-auto">
            <Sparkles className="w-8 h-8 text-gold-400" />
          </div>
          <h3 className="text-xl font-bold text-white font-serif">Nenhum pedido nesta etapa no momento</h3>
          <p className="text-xs text-obsidian-400 max-w-sm mx-auto">
            Novos pedidos feitos pelo cardápio público digital aparecerão automaticamente nesta fila.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredOrders.map((order) => {
            const isConfirmed = order.status === 'CONFIRMED';
            const isPreparing = order.status === 'PREPARING';
            const isDispatched = order.status === 'OUT_FOR_DELIVERY';
            const isDelivered = order.status === 'DELIVERED';

            return (
              <div
                key={order.id}
                className={`p-5 rounded-3xl border transition flex flex-col justify-between space-y-4 shadow-xl ${
                  isDispatched
                    ? 'bg-gradient-to-b from-carbon-900 to-cyan-950/30 border-cyan-500 shadow-cyan-950/40 ring-1 ring-cyan-500/50'
                    : isPreparing
                    ? 'bg-gradient-to-b from-carbon-900 to-ember-950/30 border-ember-500 shadow-ember-950/40'
                    : 'bg-carbon-900 border-carbon-800 hover:border-carbon-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between border-b border-carbon-800 pb-3">
                    <div>
                      <span className="text-2xl font-black font-mono text-white">
                        #{order.order_number}
                      </span>
                      <h4 className="font-extrabold text-white text-sm">
                        {order.customer_name}
                      </h4>
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-mono font-black text-gold-400 block">
                        {formatBRL(order.total)}
                      </span>
                      <span className="text-[10px] text-obsidian-400 font-mono">
                        {new Date(order.created_at).toLocaleTimeString('pt-BR')}
                      </span>
                    </div>
                  </div>

                  {/* Endereço Completo de Entrega */}
                  <div className="mt-3.5 p-3.5 rounded-2xl bg-obsidian-900/80 border border-carbon-800 space-y-1.5 text-xs">
                    <div className="flex items-center gap-2 text-obsidian-200 font-bold">
                      <MapPin className="w-3.5 h-3.5 text-ruby-400 shrink-0" />
                      <span>{order.address_street}, {order.address_number}</span>
                    </div>
                    <p className="text-obsidian-400 pl-5 text-[11px]">
                      Bairro: <strong className="text-white">{order.address_neighborhood}</strong>
                      {order.address_complement && ` • Comp: ${order.address_complement}`}
                    </p>
                    {order.address_reference && (
                      <p className="text-gold-400/90 pl-5 text-[11px] italic">
                        Ref: {order.address_reference}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 text-obsidian-400 pl-5 text-[11px]">
                      <Phone className="w-3 h-3" />
                      <span>{order.phone}</span>
                    </div>
                  </div>

                  {/* Itens do Pedido */}
                  <div className="mt-3.5 space-y-1.5 text-xs">
                    <span className="text-[10px] uppercase font-bold text-obsidian-500 tracking-wider">
                      Itens para Embalar:
                    </span>
                    {order.items.map((item) => (
                      <div key={item.id} className="flex justify-between items-start text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-white">{item.quantity}x</span>
                          <span className="text-obsidian-200">{item.product_name}</span>
                          {item.doneness && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-ember-950 text-ember-300 font-mono">
                              {formatDoneness(item.doneness)}
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-obsidian-400">
                          {formatBRL(item.unit_price * item.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Pagamento e Troco */}
                  <div className="mt-3.5 p-3 rounded-2xl bg-carbon-800/80 border border-carbon-700 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] text-obsidian-400 uppercase font-semibold">Forma:</span>
                      <div className="font-bold text-white">
                        {order.payment_method === 'PIX' ? '⚡ PIX Online' : order.payment_method === 'DINHEIRO' ? '💰 Dinheiro' : '💳 Cartão na Entrega'}
                      </div>
                    </div>
                    {order.cash_change_for && (
                      <div className="text-right text-emerald-400 font-mono font-bold text-[11px]">
                        Troco para {formatBRL(order.cash_change_for)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Ações Operacionais */}
                <div className="border-t border-carbon-800 pt-3.5 space-y-2">
                  <div className="flex gap-2">
                    {/* Botão de Avançar Status */}
                    {!isDelivered && (
                      <button
                        onClick={() => handleAdvanceStatus(order)}
                        className={`flex-1 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition active:scale-95 flex items-center justify-center gap-2 shadow-lg ${
                          isConfirmed
                            ? 'btn-ember text-obsidian-950'
                            : isPreparing
                            ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-obsidian-950'
                            : 'btn-emerald'
                        }`}
                      >
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
                      className="px-3.5 py-3 rounded-2xl bg-emerald-950/80 hover:bg-emerald-900 text-emerald-400 border border-emerald-600/50 font-bold text-xs transition flex items-center gap-1.5 shadow-md shadow-emerald-950/40"
                      title="Enviar atualização de status no WhatsApp do cliente"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span className="hidden sm:inline">Zap</span>
                    </button>

                    {/* Cancelar */}
                    {!isDelivered && (
                      <button
                        onClick={() => handleCancelOrder(order)}
                        className="p-3 rounded-2xl text-obsidian-500 hover:text-ruby-400 hover:bg-ruby-950/50 border border-carbon-800 transition"
                        title="Cancelar pedido"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {order.driver_name && (
                    <div className="text-center text-[11px] text-cyan-300 font-mono pt-1">
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
