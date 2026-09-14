import React, { useState } from 'react';
import { 
  Receipt, 
  CreditCard, 
  Banknote, 
  QrCode, 
  Users, 
  Sparkles, 
  AlertTriangle, 
  RotateCcw,
  CheckCircle2
} from 'lucide-react';
import { useTableStore } from '../../stores/useTableStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { RestaurantTable, Tab } from '../../types/domain';
import { formatBRL } from '../../lib/formatters';
import { TableSettlementModal } from './TableSettlementModal';
import { ReceiptModal } from './ReceiptModal';

type CashierFilter = 'WAITING_BILL' | 'ALL_ACTIVE' | 'CLOSED_TODAY';

export const CashierModule: React.FC = () => {
  const { tables, tabs, payments, getTabOrderItems, reopenTabAtomic } = useTableStore();
  const { currentShift } = useShiftStore();
  const { currentProfile } = useAuthStore();

  const [filter, setFilter] = useState<CashierFilter>('WAITING_BILL');
  const [selectedTableForCheckout, setSelectedTableForCheckout] = useState<RestaurantTable | null>(null);
  const [selectedClosedTabForReceipt, setSelectedClosedTabForReceipt] = useState<Tab | null>(null);

  // Pagamentos do turno atual
  const shiftPayments = currentShift
    ? payments.filter((p) => p.shift_id === currentShift.id && p.status === 'PAID')
    : [];

  const totalShiftRevenue = shiftPayments.reduce((sum, p) => sum + p.amount, 0);

  const revenueByMethod = {
    DINHEIRO: shiftPayments.filter((p) => p.method === 'DINHEIRO').reduce((s, p) => s + p.amount, 0),
    PIX: shiftPayments.filter((p) => p.method === 'PIX').reduce((s, p) => s + p.amount, 0),
    DEBITO: shiftPayments.filter((p) => p.method === 'DEBITO').reduce((s, p) => s + p.amount, 0),
    CREDITO: shiftPayments.filter((p) => p.method === 'CREDITO').reduce((s, p) => s + p.amount, 0),
  };

  // Mesas e comandas
  const waitingBillTables = tables.filter((t) => t.status === 'AGUARDANDO_CONTA');
  const activeTables = tables.filter((t) => t.status === 'OCUPADA' || t.status === 'AGUARDANDO_CONTA');
  const closedTabs = currentShift
    ? tabs.filter((t) => t.shift_id === currentShift.id && t.status === 'CLOSED')
    : [];

  // Se não houver mesas aguardando conta ao abrir, exibe todas as ativas
  const effectiveFilter = filter === 'WAITING_BILL' && waitingBillTables.length === 0 ? 'ALL_ACTIVE' : filter;

  const handleReopen = (tab: Tab) => {
    if (!['MASTER', 'GERENTE', 'CAIXA'].includes(currentProfile.role)) {
      alert('Apenas Gerente ou Caixa podem reabrir comandas.');
      return;
    }

    const reason = prompt('Motivo para reabertura da comanda fechada:', 'Erro na cobrança de itens');
    if (!reason) return;

    try {
      reopenTabAtomic(tab.id, currentProfile.id, reason);
      alert('Comanda reaberta com sucesso.');
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <div className="min-h-0 bg-surface text-ink p-3 sm:p-5 space-y-4">
      
      {/* Topo do Módulo: Resumo Financeiro do Turno */}
      <div className="bg-surface-muted border border-line p-4 sm:p-6 rounded-2xl shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-line pb-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold shadow-sm">
              <Receipt className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-bold text-ink font-sans">
                  Frente de Caixa & Fechamento
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 tabular-nums font-bold">
                  TURNO EM ANDAMENTO
                </span>
              </div>
              <p className="text-xs text-ink-muted mt-0.5">
                Fechamento de contas, divisão multimeios, troco e emissão de cupons térmicos
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right bg-surface-muted sm:bg-transparent p-3 sm:p-0 rounded-2xl border sm:border-0 border-line w-full sm:w-auto">
            <span className="text-xs text-ink-muted tabular-nums block">Faturamento do Turno:</span>
            <div className="text-2xl sm:text-3xl font-bold text-brand-700 tabular-nums tracking-tight">
              {formatBRL(totalShiftRevenue)}
            </div>
          </div>
        </div>

        {/* Métricas por Meio de Pagamento */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-surface-muted border border-line flex items-center gap-3 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-sm">
              <Banknote className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs text-ink-muted font-semibold">Dinheiro</span>
              <div className="tabular-nums font-bold text-ink text-sm">
                {formatBRL(revenueByMethod.DINHEIRO)}
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-surface-muted border border-line flex items-center gap-3 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center shadow-sm">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs text-ink-muted font-semibold">PIX Instantâneo</span>
              <div className="tabular-nums font-bold text-ink text-sm">
                {formatBRL(revenueByMethod.PIX)}
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-surface-muted border border-line flex items-center gap-3 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shadow-sm">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs text-ink-muted font-semibold">Cartão Débito</span>
              <div className="tabular-nums font-bold text-ink text-sm">
                {formatBRL(revenueByMethod.DEBITO)}
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-surface-muted border border-line flex items-center gap-3 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shadow-sm">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs text-ink-muted font-semibold">Cartão Crédito</span>
              <div className="tabular-nums font-bold text-ink text-sm">
                {formatBRL(revenueByMethod.CREDITO)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setFilter('WAITING_BILL')}
          className={`filter-chip ${effectiveFilter === 'WAITING_BILL' ? 'is-active' : ''}`}
         type="button" aria-pressed={effectiveFilter === 'WAITING_BILL'}>
          <AlertTriangle className="w-4 h-4" />
          <span>Aguardando Conta ({waitingBillTables.length})</span>
        </button>

        <button
          onClick={() => setFilter('ALL_ACTIVE')}
          className={`filter-chip ${effectiveFilter === 'ALL_ACTIVE' ? 'is-active' : ''}`}
         type="button" aria-pressed={effectiveFilter === 'ALL_ACTIVE'}>
          <Users className="w-4 h-4" />
          <span>Todas Mesas Abertas ({activeTables.length})</span>
        </button>

        <button
          onClick={() => setFilter('CLOSED_TODAY')}
          className={`filter-chip ${effectiveFilter === 'CLOSED_TODAY' ? 'is-active' : ''}`}
         type="button" aria-pressed={effectiveFilter === 'CLOSED_TODAY'}>
          <CheckCircle2 className="w-4 h-4" />
          <span>Comandas Encerradas ({closedTabs.length})</span>
        </button>
      </div>

      {/* Grade de Mesas / Comandas */}
      {effectiveFilter !== 'CLOSED_TODAY' ? (
        activeTables.length === 0 ? (
          <div className="py-20 text-center rounded-2xl bg-surface-muted border border-line p-8 space-y-3 shadow-sm">
            <div className="w-16 h-16 rounded-2xl bg-surface-muted border border-line text-ink-muted flex items-center justify-center mx-auto">
              <Sparkles className="w-8 h-8 text-amber-800" />
            </div>
            <h3 className="text-xl font-bold text-ink font-sans">Nenhuma mesa aberta no salão</h3>
            <p className="text-xs text-ink-muted">Todas as comandas estão fechadas e as mesas livres para novos clientes.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {activeTables
              .filter((t) => (effectiveFilter === 'WAITING_BILL' ? t.status === 'AGUARDANDO_CONTA' : true))
              .map((table) => {
                const currentTab = tabs.find((tab) => tab.table_id === table.id && tab.status === 'OPEN');
                const isWaitingBill = table.status === 'AGUARDANDO_CONTA';
                const items = currentTab ? getTabOrderItems(currentTab.id) : [];

                return (
                  <div
                    key={table.id}
                    className={`p-5 rounded-2xl border transition flex flex-col justify-between space-y-4 shadow-sm ${
                      isWaitingBill
                        ? 'bg-amber-50 border-2 border-amber-400 shadow-card ring-1 ring-amber-300'
                        : 'bg-surface-muted border-line hover:border-brand-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-bold tabular-nums text-ink">
                            Mesa {String(table.number).padStart(2, '0')}
                          </span>
                          {isWaitingBill && (
                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 tabular-nums font-bold">
                              Conta Pedida!
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-ink-muted flex items-center gap-1 tabular-nums">
                          <Users className="w-3.5 h-3.5 text-ink-muted" />
                          {currentTab?.people_count}p
                        </span>
                      </div>

                      <p className="text-xs text-ink-muted mt-1 truncate font-medium">
                        {currentTab?.customer_name || `Mesa ${table.number}`}
                      </p>

                      <div className="mt-3.5 pt-3 border-t border-line flex items-baseline justify-between">
                        <span className="text-xs text-ink-muted">
                          {items.filter(i => i.status !== 'CANCELLED').length} itens consumidos
                        </span>
                        <span className="text-xl font-bold tabular-nums text-brand-700">
                          {formatBRL(currentTab?.total || 0)}
                        </span>
                      </div>
                    </div>

                    {/* Botão de Fechamento */}
                    <button
                      onClick={() => setSelectedTableForCheckout(table)}
                      className={`w-full py-3.5 rounded-2xl font-bold text-xs transition flex items-center justify-center gap-2 shadow-sm ${
                        isWaitingBill
                          ? 'btn-primary'
                          : 'btn-secondary'
                      }`}
                     type="button">
                      <Receipt className="w-4 h-4" />
                      <span>Fechar Conta / Checkout</span>
                    </button>
                  </div>
                );
              })}
          </div>
        )
      ) : (
        /* Aba de Histórico de Comandas Fechadas */
        closedTabs.length === 0 ? (
          <div className="py-20 text-center rounded-2xl bg-surface-muted border border-line p-8 space-y-2 shadow-sm">
            <CheckCircle2 className="w-10 h-10 text-ink-muted mx-auto" />
            <h3 className="text-sm font-bold text-ink-muted">Nenhuma comanda fechada neste turno ainda.</h3>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {closedTabs.map((tab) => {
              const table = tables.find((t) => t.id === tab.table_id);
              const tabPayments = payments.filter((p) => p.tab_id === tab.id && p.status === 'PAID');

              return (
                <div
                  key={tab.id}
                  className="p-5 rounded-2xl bg-surface-muted border border-line space-y-3.5 shadow-sm"
                >
                  <div className="flex items-center justify-between border-b border-line pb-3">
                    <div>
                      <div className="font-bold text-ink text-base tabular-nums">
                        Mesa {table ? String(table.number).padStart(2, '0') : '??'} • #{tab.id.slice(0, 6)}
                      </div>
                      <p className="text-xs text-ink-muted mt-0.5">
                        {tab.customer_name} • Fechada às {new Date(tab.closed_at || tab.opened_at).toLocaleTimeString('pt-BR')}
                      </p>
                    </div>
                    <span className="text-lg font-bold text-emerald-700 tabular-nums">
                      {formatBRL(tab.total)}
                    </span>
                  </div>

                  {/* Discriminativo de Meios de Pagamento */}
                  <div className="space-y-1 text-xs">
                    <span className="text-xs text-ink-muted font-semibold">
                      Recebimentos:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {tabPayments.map((p) => (
                        <span
                          key={p.id}
                          className="px-2.5 py-0.5 rounded-lg bg-surface-muted border border-line text-ink tabular-nums text-xs"
                        >
                          {p.method}: {formatBRL(p.amount)}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex gap-2 pt-1 border-t border-line">
                    <button
                      onClick={() => setSelectedClosedTabForReceipt(tab)}
                      className="btn-secondary flex-1 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 font-bold"
                     type="button">
                      <Receipt className="w-3.5 h-3.5" />
                      <span>Ver Cupom</span>
                    </button>

                    {['MASTER', 'GERENTE', 'CAIXA'].includes(currentProfile.role) && (
                      <button
                        onClick={() => handleReopen(tab)}
                        className="btn-secondary px-3 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1 text-ink-muted hover:text-rose-700"
                        title="Reabrir comanda caso tenha sido fechada por engano"
                       type="button" aria-label="Reabrir comanda caso tenha sido fechada por engano">
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reabrir</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Modal de Checkout / Fechamento da Mesa Selecionada */}
      {selectedTableForCheckout && (
        <TableSettlementModal
          table={selectedTableForCheckout}
          isOpen={true}
          onClose={() => setSelectedTableForCheckout(null)}
        />
      )}

      {/* Modal de Cupom Térmico para Comanda Já Fechada */}
      {selectedClosedTabForReceipt && (
        <ReceiptModal
          isOpen={true}
          onClose={() => setSelectedClosedTabForReceipt(null)}
          tab={selectedClosedTabForReceipt}
          table={tables.find((t) => t.id === selectedClosedTabForReceipt.table_id)}
          items={getTabOrderItems(selectedClosedTabForReceipt.id)}
          payments={payments.filter((p) => p.tab_id === selectedClosedTabForReceipt.id && p.status === 'PAID')}
        />
      )}

    </div>
  );
};
