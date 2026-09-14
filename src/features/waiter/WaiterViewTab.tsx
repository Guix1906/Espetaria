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
  const { tabs, getTabOrderItems } = useTableStore();

  if (!isOpen) return null;

  const currentTab = tabs.find((t) => t.table_id === table.id && t.status === 'OPEN');
  const items = currentTab ? getTabOrderItems(currentTab.id) : [];

  const handleMarkDelivered = (item: OrderItem) => {
    // Atualiza status do item para DELIVERED
    useTableStore.setState((state) => ({
      orderItems: state.orderItems.map((i) =>
        i.id === item.id ? { ...i, status: 'DELIVERED' as const, delivered_at: new Date().toISOString() } : i
      ),
    }));
  };

  const readyToDeliverCount = items.filter((i) => i.status === 'READY').length;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border-t sm:border border-slate-700 rounded-t-3xl sm:rounded-2xl w-full max-w-lg p-5 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
        
        {/* Topo do Extrato */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-600/20 text-amber-400 border border-amber-600/30 flex items-center justify-center">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base leading-none">
                Consumo da Mesa {String(table.number).padStart(2, '0')}
              </h3>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                <span>{currentTab?.customer_name}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3 text-slate-500" />
                  {currentTab?.people_count} pessoas
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Alerta de Itens Prontos para Entrega */}
        {readyToDeliverCount > 0 && (
          <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-700 text-emerald-300 text-xs flex items-center justify-between gap-2 animate-pulse">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-bold">
                {readyToDeliverCount} {readyToDeliverCount === 1 ? 'item pronto' : 'itens prontos'} para servir na mesa!
              </span>
            </div>
          </div>
        )}

        {/* Lista de Itens Já Lançados */}
        <div className="overflow-y-auto flex-1 space-y-2.5 pr-1 text-xs">
          {items.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
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
                  className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                    isReady
                      ? 'bg-emerald-950/40 border-emerald-600/80 shadow-md shadow-emerald-950/30'
                      : isCancelled
                      ? 'bg-rose-950/20 border-rose-900/40 text-slate-500 line-through'
                      : 'bg-slate-800/60 border-slate-700/80 text-slate-200'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">
                        {item.quantity}x {item.product_name}
                      </span>
                      {item.doneness && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 font-mono">
                          {formatDoneness(item.doneness)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${statusConf.bg} ${statusConf.color}`}>
                        {statusConf.label}
                      </span>
                      <span className="text-slate-400 font-mono text-[11px]">
                        {formatBRL(item.unit_price * item.quantity)}
                      </span>
                    </div>

                    {item.notes && (
                      <div className="text-[11px] text-amber-400/90 italic mt-0.5">
                        Obs: {item.notes}
                      </div>
                    )}
                  </div>

                  {/* Ação de Entrega na Mesa */}
                  {isReady && (
                    <button
                      onClick={() => handleMarkDelivered(item)}
                      className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition active:scale-95 shadow-md shadow-emerald-950/40 flex items-center gap-1.5 shrink-0"
                    >
                      <CheckCheck className="w-4 h-4" />
                      <span>Servir Mesa</span>
                    </button>
                  )}

                  {isDelivered && (
                    <div className="text-[10px] text-slate-500 flex items-center gap-1 font-mono shrink-0">
                      <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
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
          <div className="border-t border-slate-800 pt-3 space-y-2 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Subtotal Consumido:</span>
              <span className="font-mono font-semibold text-slate-200">
                {formatBRL(currentTab.subtotal)}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Taxa de Serviço (10%):</span>
              <span className="font-mono text-slate-300">
                {formatBRL(currentTab.service_fee)}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm font-bold text-white pt-1 border-t border-slate-800">
              <span>Total da Conta:</span>
              <span className="text-xl font-black text-amber-400 font-mono">
                {formatBRL(currentTab.total)}
              </span>
            </div>

            {/* Divisão por Pessoa */}
            <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-between text-xs text-slate-300 font-mono">
              <span>Divisão ({currentTab.people_count} pessoas):</span>
              <strong className="text-white text-sm">
                {formatBRL(currentTab.total / Math.max(1, currentTab.people_count))} / pessoa
              </strong>
            </div>

            {/* Botão de Solicitar Fechamento */}
            <div className="pt-2">
              <button
                onClick={onRequestBill}
                className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold transition active:scale-95 flex items-center justify-center gap-2"
              >
                <Receipt className="w-4 h-4 text-rose-400" />
                <span>Solicitar Fechamento de Conta ao Caixa</span>
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
