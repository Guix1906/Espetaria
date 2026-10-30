import {
  CheckCircle2,
  Printer,
  Receipt,
  Users,
  CreditCard,
  X,
} from 'lucide-react';
import React from 'react';
import { Dialog } from '../../components/ui/Dialog';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { usePrintStore } from '../../stores/usePrintStore';
import { formatBRL } from '../../lib/formatters';
import { isFreshReady } from '../../lib/productionStatus';
import { useTableStore } from '../../stores/useTableStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { TabItemsPanel } from './TabItemsPanel';
import { RestaurantTable } from '../../types/domain';

interface WaiterViewTabProps {
  table: RestaurantTable;
  isOpen: boolean;
  onClose: () => void;
  onRequestBill: () => void;
  onSettleTab?: () => void;
}

export const WaiterViewTab: React.FC<WaiterViewTabProps> = ({
  table,
  isOpen,
  onClose,
  onRequestBill,
  onSettleTab,
}) => {
  const { tabs, getTabOrderItems } = useTableStore();
  const { notify } = useFeedback();
  const { currentProfile } = useAuthStore();
  const canSettle = ['MASTER', 'GERENTE', 'CAIXA'].includes(currentProfile.role);
  const [printing, setPrinting] = React.useState(false);

  const reprintBill = async () => {
    setPrinting(true);
    const ok = await usePrintStore.getState().printBill(table.id);
    setPrinting(false);
    notify(ok ? 'Conta enviada para a impressora da churrasqueira.' : 'Não foi possível imprimir a conta.', ok ? 'success' : 'error');
  };

  if (!isOpen) return null;

  const currentTab = tabs.find((t) => t.table_id === table.id && t.status === 'OPEN');
  const items = currentTab ? getTabOrderItems(currentTab.id) : [];

  const readyToDeliverCount = items.filter((i) => isFreshReady(i)).length;

  return (
    <Dialog label="Consumo da mesa" onClose={onClose} placement="sheet">
      <div className="dialog-panel bg-surface-muted border-t sm:border border-line rounded-t-md sm:rounded-2xl w-full max-w-lg p-5 sm:p-6 shadow-card space-y-4 max-h-[92vh] flex flex-col fade-in zoom-in-95">

        {/* Topo do Extrato */}
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <div className="bg-brand-700 w-11 h-11 rounded-2xl text-white flex items-center justify-center shadow-card">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-ink text-xl leading-tight font-sans">
                Consumo — Mesa {String(table.number).padStart(2, '0')}
              </h3>
              <p className="text-base text-ink-muted mt-0.5 flex items-center gap-2">
                <span className="font-bold text-ink">{currentTab?.customer_name || 'Comanda aberta'}</span>
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
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-base flex items-center justify-between gap-2 shadow-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span className="font-bold">
                {readyToDeliverCount} {readyToDeliverCount === 1 ? 'item pronto' : 'itens prontos'} para levar à mesa
              </span>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto pr-1">
          <TabItemsPanel table={table} compact />
        </div>

        {/* Resumo Financeiro da Mesa */}
        {currentTab && (
          <div className="border-t border-line pt-4 space-y-2.5 text-base">
            <div className="flex justify-between text-ink-muted">
              <span>Subtotal</span>
              <span className="tabular-nums font-bold text-ink">
                {formatBRL(currentTab.subtotal)}
              </span>
            </div>
            {currentTab.service_fee > 0 && (
              <div className="flex justify-between text-ink-muted">
                <span>Taxa de serviço</span>
                <span className="tabular-nums text-ink">
                  {formatBRL(currentTab.service_fee)}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center text-base font-bold text-ink pt-2 border-t border-line">
              <span className="text-ink">Total</span>
              <span className="text-2xl font-bold text-brand-700 tabular-nums">
                {formatBRL(currentTab.total)}
              </span>
            </div>

            {/* Divisão por Pessoa */}
            <div className="flex items-center justify-between gap-2 rounded-md bg-surface-muted px-3 py-2.5 text-base text-ink">
              <span className="whitespace-nowrap">Por pessoa ({currentTab.people_count})</span>
              <strong className="whitespace-nowrap text-base font-semibold text-brand-700 tabular-nums">{formatBRL(currentTab.total / Math.max(1, currentTab.people_count))}</strong>
            </div>

            {/* Botão de Solicitar Fechamento (já imprime a conta na churrasqueira) */}
            {canSettle && onSettleTab && (
              <button
                onClick={() => {
                  onClose();
                  onSettleTab();
                }}
                className="w-full py-3.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 active:scale-[0.98] text-white font-bold transition flex items-center justify-center gap-2 shadow-sm text-base"
                type="button">
                <CreditCard className="w-5 h-5" />
                <span>Receber e Encerrar Conta</span>
              </button>
            )}

            <div className="pt-2 space-y-2">
              {table.status === 'AGUARDANDO_CONTA' && (
                <button
                  onClick={() => void reprintBill()}
                  disabled={printing}
                  className="w-full py-3.5 rounded-2xl bg-brand-700 text-white font-bold transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-60"
                  type="button">
                  <Printer className="w-4 h-4" />
                  <span>{printing ? 'Enviando...' : 'Imprimir conta de novo'}</span>
                </button>
              )}
              {table.status !== 'AGUARDANDO_CONTA' && (
                <button
                  onClick={onRequestBill}
                  className="w-full py-3.5 rounded-md bg-surface border border-line-strong text-ink font-bold transition flex flex-col items-center justify-center gap-0.5 shadow-sm"
                  type="button">
                  <span className="flex items-center gap-2"><Receipt className="w-4 h-4 text-brand-700" />Pedir a conta</span>
                  <span className="text-sm font-medium text-ink-muted">A conta sai na impressora da churrasqueira</span>
                </button>
              )}
            </div>
          </div>
        )}

      </div>
    </Dialog>
  );
};
