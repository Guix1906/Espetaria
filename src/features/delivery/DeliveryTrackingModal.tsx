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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg p-5 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
        
        {/* Topo do Acompanhamento */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-bold uppercase">
              Acompanhamento ao Vivo
            </span>
            <h3 className="font-extrabold text-white text-lg mt-1 leading-none">
              Pedido #{order.order_number}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Linha do Tempo Visual do Pedido */}
        <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-amber-400 font-semibold">
              <Clock className="w-4 h-4 animate-spin" />
              <span>Previsão de Entrega: 35 a 50 min</span>
            </div>
            <span className="text-xs text-slate-400 font-mono">
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
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center transition shadow-md ${
                      isCurrent
                        ? 'bg-amber-600 text-slate-950 font-black animate-bounce ring-4 ring-amber-500/30'
                        : isPast
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span
                    className={`text-[10px] font-bold leading-tight ${
                      isCurrent ? 'text-amber-400 font-extrabold' : isPast ? 'text-emerald-400' : 'text-slate-500'
                    }`}
                  >
                    {step.label}
                  </span>
                  <span className="text-[9px] text-slate-500 leading-none hidden sm:block">
                    {step.desc}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detalhes do Pedido & Endereço */}
        <div className="overflow-y-auto flex-1 space-y-3 pr-1 text-xs">
          <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/70 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-white text-xs">
              <MapPin className="w-3.5 h-3.5 text-rose-400" />
              <span>Entregar em:</span>
            </div>
            <p className="text-slate-300">
              {order.address_street}, {order.address_number} — {order.address_neighborhood}
            </p>
            {order.address_complement && (
              <p className="text-slate-400 text-[11px]">Comp: {order.address_complement}</p>
            )}
            {order.address_reference && (
              <p className="text-amber-400/90 text-[11px] italic">Ref: {order.address_reference}</p>
            )}
          </div>

          {/* Itens */}
          <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/70 space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-white text-xs">
              <Receipt className="w-3.5 h-3.5 text-amber-400" />
              <span>Itens Solicitados:</span>
            </div>
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between items-center text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-white">{item.quantity}x</span>
                  <span className="text-slate-300">{item.product_name}</span>
                  {item.doneness && (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-rose-950 text-rose-300 font-mono">
                      {formatDoneness(item.doneness)}
                    </span>
                  )}
                </div>
                <span className="font-mono text-slate-400">
                  {formatBRL(item.unit_price * item.quantity)}
                </span>
              </div>
            ))}
            <div className="pt-2 border-t border-slate-700/80 flex justify-between font-bold text-white text-xs">
              <span>Total com entrega:</span>
              <span className="text-amber-400 font-mono text-sm">{formatBRL(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Botão de WhatsApp */}
        <div className="pt-1">
          <button
            onClick={openWhatsApp}
            className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/60"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Tirar Dúvidas via WhatsApp</span>
          </button>
        </div>

      </div>
    </div>
  );
};
