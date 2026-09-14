import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CreditCard,
  QrCode,
  Receipt,
  RotateCcw,
  Sparkles,
  Users
} from 'lucide-react';
import React,{ useState } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatCard } from '../../components/ui/StatCard';
import { formatBRL } from '../../lib/formatters';
import { useAuthStore } from '../../stores/useAuthStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useTableStore } from '../../stores/useTableStore';
import { RestaurantTable,Tab } from '../../types/domain';
import { ReceiptModal } from './ReceiptModal';
import { TableSettlementModal } from './TableSettlementModal';

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
    <div className="page-layout">
      
      <PageHeader eyebrow="Recebimentos" title="Caixa" description="Feche contas, divida pagamentos e acompanhe os recebimentos do turno." icon={Receipt} actions={<div className="surface-card px-5 py-3"><p className="text-xs font-medium text-ink-muted">Recebido no turno</p><p className="text-2xl font-bold text-brand-800 tabular-nums">{formatBRL(totalShiftRevenue)}</p></div>} />
      <div className="stat-grid">
        <StatCard label="Dinheiro" value={formatBRL(revenueByMethod.DINHEIRO)} icon={Banknote} tone="success" />
        <StatCard label="PIX" value={formatBRL(revenueByMethod.PIX)} icon={QrCode} />
        <StatCard label="Débito" value={formatBRL(revenueByMethod.DEBITO)} icon={CreditCard} tone="info" />
        <StatCard label="Crédito" value={formatBRL(revenueByMethod.CREDITO)} icon={CreditCard} tone="warning" />
      </div>

      {/* Barra de Filtros */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setFilter('WAITING_BILL')}
          className={`filter-chip ${effectiveFilter === 'WAITING_BILL' ? 'is-active' : ''}`}
         type="button" aria-pressed={effectiveFilter === 'WAITING_BILL'}>
          <AlertTriangle className="w-4 h-4" />
          <span>Conta solicitada ({waitingBillTables.length})</span>
        </button>

        <button
          onClick={() => setFilter('ALL_ACTIVE')}
          className={`filter-chip ${effectiveFilter === 'ALL_ACTIVE' ? 'is-active' : ''}`}
         type="button" aria-pressed={effectiveFilter === 'ALL_ACTIVE'}>
          <Users className="w-4 h-4" />
          <span>Em atendimento ({activeTables.length})</span>
        </button>

        <button
          onClick={() => setFilter('CLOSED_TODAY')}
          className={`filter-chip ${effectiveFilter === 'CLOSED_TODAY' ? 'is-active' : ''}`}
         type="button" aria-pressed={effectiveFilter === 'CLOSED_TODAY'}>
          <CheckCircle2 className="w-4 h-4" />
          <span>Encerradas ({closedTabs.length})</span>
        </button>
      </div>

      {/* Grade de Mesas / Comandas */}
      {effectiveFilter !== 'CLOSED_TODAY' ? (
        activeTables.length === 0 ? (
          <EmptyState title="Nenhuma mesa aberta" description="As mesas estão livres para novos clientes. As próximas comandas aparecerão aqui." icon={Sparkles} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
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
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-bold tabular-nums text-ink">
                            Mesa {String(table.number).padStart(2, '0')}
                          </span>
                          {isWaitingBill && (
                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 tabular-nums font-bold">
                              Conta solicitada
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
                      <span>Fechar conta</span>
                    </button>
                  </div>
                );
              })}
          </div>
        )
      ) : (
        /* Aba de Histórico de Comandas Fechadas */
        closedTabs.length === 0 ? (
          <EmptyState title="Nenhuma comanda encerrada" description="Os recibos e pagamentos aparecerão aqui após o fechamento das contas." icon={Receipt} />
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
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
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
