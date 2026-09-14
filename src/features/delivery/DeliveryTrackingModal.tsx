import { Dialog } from '../../components/ui/Dialog';
import React from 'react';
import { 
  X, 
  CheckCircle2, 
  Flame, 
  Bike, 
  MessageCircle, 
  Clock, 
  MapPin, 
  Receipt 
} from 'lucide-react';
import { DeliveryOrder } from '../../types/domain';
import { formatBRL, formatDoneness } from '../../lib/formatters';

interface DeliveryTrackingModalProps {
  order: DeliveryOrder;
  isOpen: boolean;
  onClose: () => void;
}

export const DeliveryTrackingModal: React.FC<DeliveryTrackingModalProps> = ({
  order,
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const steps = [
    { key: 'CONFIRMED', label: 'Pedido Confirmado', icon: CheckCircle2, desc: 'Recebido pela espetaria' },
    { key: 'PREPARING', label: 'Na Brasa', icon: Flame, desc: 'Espetos assando no ponto' },
    { key: 'OUT_FOR_DELIVERY', label: 'A Caminho', icon: Bike, desc: order.driver_name ? `Com ${order.driver_name}` : 'Motoboy a caminho' },
    { key: 'DELIVERED', label: 'Entregue', icon: CheckCircle2, desc: 'Bom apetite!' },
  ];

  const getStepIndex = (status: string) => {
    switch (status) {
      case 'CONFIRMED': return 0;
      case 'PREPARING': return 1;
      case 'OUT_FOR_DELIVERY': return 2;
      case 'DELIVERED': return 3;
      default: return 0;
    }
  };

  const currentStepIdx = getStepIndex(order.status);

  const openWhatsApp = () => {
    const text = encodeURIComponent(
      `Olá! Gostaria de saber sobre o meu pedido de delivery #${order.order_number} (${order.customer_name}).`
    );
    window.open(`https://wa.me/5511987654321?text=${text}`, '_blank');
  };

  return (
    <Dialog label="Acompanhar entrega" onClose={onClose}>
      <div className="dialog-panel bg-surface-muted border border-line rounded-2xl w-full max-w-lg p-5 sm:p-6 shadow-card space-y-4 max-h-[92vh] flex flex-col zoom-in-95 duration-200">
        
        {/* Topo do Acompanhamento */}
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 tabular-nums font-bold">
              Acompanhamento ao Vivo
            </span>
            <h3 className="font-bold text-ink text-lg mt-1 leading-none font-sans">
              Pedido #{order.order_number}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-muted transition"
           type="button" aria-label="Fechar janela">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Linha do Tempo Visual do Pedido */}
        <div className="bg-surface-muted p-4 rounded-2xl border border-line space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-amber-800 font-semibold">
              <Clock className="w-4 h-4 text-amber-800" />
              <span>Previsão de Entrega: 35 a 50 min</span>
            </div>
            <span className="text-xs text-ink-muted tabular-nums">
              {new Date(order.created_at).toLocaleTimeString('pt-BR')}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1 relative">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              const isPast = idx < currentStepIdx;
              const isCurrent = idx === currentStepIdx;

              return (
                <div key={step.key} className="flex flex-col items-center text-center space-y-1">
                  <div
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center transition shadow-sm ${
                      isCurrent
                        ? 'bg-brand-700 text-white font-bold ring-4 ring-brand-200'
                        : isPast
                        ? 'bg-emerald-700 text-white font-bold'
                        : 'bg-surface-muted text-ink-muted'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span
                    className={`text-xs font-bold leading-tight ${
                      isCurrent ? 'text-brand-700 font-bold' : isPast ? 'text-emerald-700' : 'text-ink-muted'
                    }`}
                  >
                    {step.label}
                  </span>
                  <span className="text-xs text-ink-muted leading-none hidden sm:block">
                    {step.desc}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detalhes do Pedido & Endereço */}
        <div className="overflow-y-auto flex-1 space-y-3 pr-1 text-xs">
          <div className="p-3.5 rounded-2xl bg-surface-muted border border-line space-y-1">
            <div className="flex items-center gap-2 font-bold text-ink text-xs font-sans">
              <MapPin className="w-3.5 h-3.5 text-red-700" />
              <span>Entregar em:</span>
            </div>
            <p className="text-ink">
              {order.address_street}, {order.address_number} — {order.address_neighborhood}
            </p>
            {order.address_complement && (
              <p className="text-ink-muted text-xs">Comp: {order.address_complement}</p>
            )}
            {order.address_reference && (
              <p className="text-amber-800 text-xs italic font-medium">Ref: {order.address_reference}</p>
            )}
          </div>

          {/* Itens */}
          <div className="p-3.5 rounded-2xl bg-surface-muted border border-line space-y-2">
            <div className="flex items-center gap-2 font-bold text-ink text-xs font-sans">
              <Receipt className="w-3.5 h-3.5 text-amber-800" />
              <span>Itens Solicitados:</span>
            </div>
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-ink tabular-nums">{item.quantity}x</span>
                  <span className="text-ink">{item.product_name}</span>
                  {item.doneness && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-brand-100 text-brand-800 tabular-nums">
                      {formatDoneness(item.doneness)}
                    </span>
                  )}
                </div>
                <span className="tabular-nums text-ink-muted">
                  {formatBRL(item.unit_price * item.quantity)}
                </span>
              </div>
            ))}
            <div className="pt-2 border-t border-line flex justify-between font-bold text-ink text-xs">
              <span className="font-sans">Total com entrega:</span>
              <span className="text-brand-700 tabular-nums text-base font-bold">{formatBRL(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Botão de WhatsApp */}
        <div className="pt-1">
          <button
            onClick={openWhatsApp}
            className="btn-success w-full py-3.5 rounded-2xl text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm"
           type="button">
            <MessageCircle className="w-4 h-4" />
            <span>Tirar Dúvidas via WhatsApp</span>
          </button>
        </div>

      </div>
    </Dialog>
  );
};
