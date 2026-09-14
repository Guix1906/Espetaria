import React from 'react';
import { 
  Receipt, 
  X, 
  CheckCircle2, 
  Users, 
  CheckCheck,
} from 'lucide-react';
import { useTableStore } from '../../stores/useTableStore';
import { RestaurantTable, OrderItem } from '../../types/domain';
import { formatBRL, formatDoneness, getOrderItemStatusConfig } from '../../lib/formatters';

interface WaiterViewTabProps {
  table: RestaurantTable;
  isOpen: boolean;
  onClose: () => void;
  onRequestBill: () => void;
}

export const WaiterViewTab: React.FC<WaiterViewTabProps> = ({
  table,
  isOpen,
  onClose,
  onRequestBill,
}) => {
  const { tabs, getTabOrderItems, markDelivered } = useTableStore();

  if (!isOpen) return null;

  const currentTab = tabs.find((t) => t.table_id === table.id && t.status === 'OPEN');
  const items = currentTab ? getTabOrderItems(currentTab.id) : [];

  const handleMarkDelivered = (item: OrderItem) => {
    markDelivered(item.id);
  };

  const readyToDeliverCount = items.filter((i) => i.status === 'READY').length;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-[#14151f] border-t sm:border border-white/15 rounded-t-3xl sm:rounded-3xl w-full max-w-lg p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95">
        
        {/* Topo do Extrato */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-white text-base leading-tight font-brand">
                Consumo — Mesa {String(table.number).padStart(2, '0')}
              </h3>
              <p className="text-xs text-stone-400 mt-0.5 flex items-center gap-2">
                <span className="font-bold text-white">{currentTab?.customer_name || 'Comanda Aberta'}</span>
                <span>•</span>
                <span className="flex items-center gap-1 font-medium">
                  <Users className="w-3.5 h-3.5 text-stone-500" />
                  {currentTab?.people_count} pessoas
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Alerta de Itens Prontos para Entrega */}
        {readyToDeliverCount > 0 && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between gap-2 shadow-lg shadow-emerald-950/20 animate-pulse">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-bold">
                {readyToDeliverCount} {readyToDeliverCount === 1 ? 'item pronto' : 'itens prontos'} na brasa/cozinha para servir!
              </span>
            </div>
          </div>
        )}

        {/* Lista de Itens Já Lançados */}
        <div className="overflow-y-auto flex-1 space-y-2.5 pr-1 text-xs">
          {items.length === 0 ? (
            <div className="py-12 text-center text-stone-500 font-medium">
              Nenhum item consumido ainda nesta mesa.
            </div>
          ) : (
            items.map((item) => {
              const statusConf = getOrderItemStatusConfig(item.status);
              const isReady = item.status === 'READY';
              const isDelivered = item.status === 'DELIVERED';
              const isCancelled = item.status === 'CANCELLED';

              return (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 shadow-md ${
                    isReady
                      ? 'bg-emerald-950/30 border-emerald-500/40 shadow-emerald-950/30'
                      : isCancelled
                      ? 'bg-rose-950/20 border-rose-900/30 text-stone-500 line-through'
                      : 'bg-[#090a0f] border-white/10 text-stone-200'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">
                        {item.quantity}x {item.product_name}
                      </span>
                      {item.doneness && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono font-bold">
                          {formatDoneness(item.doneness)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full border font-bold ${statusConf.bg} ${statusConf.color}`}>
                        {statusConf.label}
                      </span>
                      <span className="text-stone-400 font-mono font-bold text-xs">
                        {formatBRL(item.unit_price * item.quantity)}
                      </span>
                    </div>

                    {item.notes && (
                      <div className="text-[11px] text-amber-300/80 italic mt-1">
                        Obs: {item.notes}
                      </div>
                    )}
                  </div>

                  {/* Ação de Entrega na Mesa */}
                  {isReady && (
                    <button
                      onClick={() => handleMarkDelivered(item)}
                      className="px-3.5 py-2.5 rounded-xl btn-emerald text-xs transition active:scale-95 flex items-center gap-1.5 shrink-0 shadow-md shadow-emerald-950/30"
                    >
                      <CheckCheck className="w-4 h-4" />
                      <span>Servir Mesa</span>
                    </button>
                  )}

                  {isDelivered && (
                    <div className="text-[10px] text-stone-400 flex items-center gap-1 font-mono shrink-0 font-medium">
                      <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Entregue</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Resumo Financeiro da Mesa */}
        {currentTab && (
          <div className="border-t border-white/10 pt-4 space-y-2.5 text-xs">
            <div className="flex justify-between text-stone-400">
              <span>Subtotal dos Itens:</span>
              <span className="font-mono font-bold text-stone-200">
                {formatBRL(currentTab.subtotal)}
              </span>
            </div>
            <div className="flex justify-between text-stone-400">
              <span>Taxa de Serviço Opcional (10%):</span>
              <span className="font-mono text-stone-300">
                {formatBRL(currentTab.service_fee)}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm font-bold text-white pt-2 border-t border-white/10">
              <span className="text-stone-300">Total da Conta:</span>
              <span className="text-2xl font-black text-amber-400 font-mono">
                {formatBRL(currentTab.total)}
              </span>
            </div>

            {/* Divisão por Pessoa */}
            <div className="p-3 rounded-2xl bg-[#090a0f] border border-white/10 flex items-center justify-between text-xs text-stone-300 font-mono">
              <span>Divisão ({currentTab.people_count} pess.):</span>
              <strong className="text-amber-300 text-sm font-bold">
                {formatBRL(currentTab.total / Math.max(1, currentTab.people_count))} / pessoa
              </strong>
            </div>

            {/* Botão de Solicitar Fechamento */}
            <div className="pt-2">
              <button
                onClick={onRequestBill}
                className="w-full py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/15 text-stone-200 font-bold transition active:scale-95 flex items-center justify-center gap-2"
              >
                <Receipt className="w-4 h-4 text-orange-400" />
                <span>Solicitar Fechamento de Conta ao Caixa</span>
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
