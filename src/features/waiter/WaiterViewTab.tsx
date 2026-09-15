import {
  CheckCheck,
  CheckCircle2,
  Receipt,
  Users,
  X,
} from 'lucide-react';
import React from 'react';
import { Dialog } from '../../components/ui/Dialog';
import { formatBRL, formatDoneness, getOrderItemStatusConfig } from '../../lib/formatters';
import { useTableStore } from '../../stores/useTableStore';
import { OrderItem, RestaurantTable } from '../../types/domain';

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
    <Dialog label="Consumo da mesa" onClose={onClose} placement="sheet">
      <div className="dialog-panel bg-surface-muted border-t sm:border border-line rounded-t-3xl sm:rounded-2xl w-full max-w-lg p-5 sm:p-6 shadow-card space-y-4 max-h-[92vh] flex flex-col fade-in zoom-in-95">

        {/* Topo do Extrato */}
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <div className="bg-brand-700 w-11 h-11 rounded-2xl text-white flex items-center justify-center shadow-card">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-ink text-base leading-tight font-sans">
                Consumo — Mesa {String(table.number).padStart(2, '0')}
              </h3>
              <p className="text-xs text-ink-muted mt-0.5 flex items-center gap-2">
                <span className="font-bold text-ink">{currentTab?.customer_name || 'Comanda Aberta'}</span>
                <span>•</span>
                <span className="flex items-center gap-1 font-medium">
                  <Users className="w-3.5 h-3.5 text-ink-muted" />
                  {currentTab?.people_count} pessoas
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-surface-muted transition"
            type="button" aria-label="Fechar janela">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Alerta de Itens Prontos para Entrega */}
        {readyToDeliverCount > 0 && (
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between gap-2 shadow-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span className="font-bold">
                {readyToDeliverCount} {readyToDeliverCount === 1 ? 'item pronto' : 'itens prontos'} na brasa/cozinha para servir!
              </span>
            </div>
          </div>
        )}

        {/* Lista de Itens Já Lançados */}
        <div className="overflow-y-auto flex-1 space-y-2.5 pr-1 text-xs">
          {items.length === 0 ? (
            <div className="py-12 text-center text-ink-muted font-medium">
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
                  className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-colors ${isReady
                      ? 'bg-emerald-50 border-emerald-300 shadow-sm'
                      : isCancelled
                        ? 'bg-rose-50 border-rose-200 text-ink-muted line-through'
                        : 'bg-surface-muted border-line text-ink'
                    }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-ink text-sm">
                        {item.quantity}x {item.product_name}
                      </span>
                      {item.doneness && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 tabular-nums font-bold">
                          {formatDoneness(item.doneness)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full border font-bold ${statusConf.bg} ${statusConf.color}`}>
                        {statusConf.label}
                      </span>
                      <span className="text-ink-muted tabular-nums font-bold text-xs">
                        {formatBRL(item.unit_price * item.quantity)}
                      </span>
                    </div>

                    {item.notes && (
                      <div className="text-xs text-amber-800 italic mt-1">
                        Obs: {item.notes}
                      </div>
                    )}
                  </div>

                  {/* Ação de Entrega na Mesa */}
                  {isReady && (
                    <button
                      onClick={() => handleMarkDelivered(item)}
                      className="px-3.5 py-2.5 rounded-xl btn-success text-xs transition flex items-center gap-1.5 shrink-0 shadow-sm"
                      type="button">
                      <CheckCheck className="w-4 h-4" />
                      <span>Servir Mesa</span>
                    </button>
                  )}

                  {isDelivered && (
                    <div className="text-xs text-ink-muted flex items-center gap-1 tabular-nums shrink-0 font-medium">
                      <CheckCheck className="w-3.5 h-3.5 text-emerald-700" />
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
          <div className="border-t border-line pt-4 space-y-2.5 text-xs">
            <div className="flex justify-between text-ink-muted">
              <span>Subtotal dos Itens:</span>
              <span className="tabular-nums font-bold text-ink">
                {formatBRL(currentTab.subtotal)}
              </span>
            </div>
            <div className="flex justify-between text-ink-muted">
              <span>Taxa de Serviço Opcional (10%):</span>
              <span className="tabular-nums text-ink">
                {formatBRL(currentTab.service_fee)}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm font-bold text-ink pt-2 border-t border-line">
              <span className="text-ink">Total da Conta:</span>
              <span className="text-2xl font-bold text-brand-700 tabular-nums">
                {formatBRL(currentTab.total)}
              </span>
            </div>

            {/* Divisão por Pessoa */}
            <div className="p-3 rounded-2xl bg-surface-muted border border-line flex items-center justify-between text-xs text-ink tabular-nums">
              <span>Divisão ({currentTab.people_count} pess.):</span>
              <strong className="text-brand-700 text-sm font-bold">
                {formatBRL(currentTab.total / Math.max(1, currentTab.people_count))} / pessoa
              </strong>
            </div>

            {/* Botão de Solicitar Fechamento */}
            <div className="pt-2">
              <button
                onClick={onRequestBill}
                className="w-full py-3.5 rounded-2xl bg-surface-muted hover:bg-surface-muted border border-line text-ink font-bold transition flex items-center justify-center gap-2 shadow-sm"
                type="button">
                <Receipt className="w-4 h-4 text-brand-700" />
                <span>Solicitar Fechamento de Conta ao Caixa</span>
              </button>
            </div>
          </div>
        )}

      </div>
    </Dialog>
  );
};
