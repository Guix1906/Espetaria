import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CreditCard,
  QrCode,
  Receipt,
  RotateCcw,
  Users
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { PageHeader } from '../../components/ui/PageHeader';
import { formatBRL } from '../../lib/formatters';
import { METHOD_LABELS } from '../../lib/financeData';
import { useAuthStore } from '../../stores/useAuthStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useTableStore } from '../../stores/useTableStore';
import { useNavFocusStore } from '../../stores/useNavFocusStore';
import { RestaurantTable, Tab } from '../../types/domain';
import { ReceiptModal } from './ReceiptModal';
import { TableSettlementModal } from './TableSettlementModal';

type CashierFilter = 'WAITING_BILL' | 'ALL_ACTIVE' | 'CLOSED_TODAY';

const METHOD_BAR = [
  { key: 'DINHEIRO', label: 'Dinheiro', icon: Banknote, bar: 'bg-amber-500' },
  { key: 'PIX', label: 'PIX', icon: QrCode, bar: 'bg-emerald-600' },
  { key: 'DEBITO', label: 'Débito', icon: CreditCard, bar: 'bg-ink-secondary' },
  { key: 'CREDITO', label: 'Crédito', icon: CreditCard, bar: 'bg-brand-500' },
] as const;

/** Há quanto tempo a mesa pediu a conta (a mesa muda de status nesse momento). */
function billMinutes(table: RestaurantTable): string {
  const min = Math.max(0, Math.floor((Date.now() - new Date(table.updated_at).getTime()) / 60000));
  return min < 1 ? 'agora' : `há ${min} min`;
}

export const CashierModule: React.FC = () => {
  const { notify, requestText } = useFeedback();
  const { tables, tabs, payments, getTabOrderItems, reopenTabAtomic } = useTableStore();
  const { currentShift } = useShiftStore();
  const { currentProfile } = useAuthStore();

  const [filter, setFilter] = useState<CashierFilter>('WAITING_BILL');
  const [searchTerm, setSearchTerm] = useState('');
  const query = searchTerm.trim().toLocaleLowerCase('pt-BR');
  // Vindo da Visão geral ("Cobrar"), já abre o fechamento daquela mesa
  const [selectedTableForCheckout, setSelectedTableForCheckout] = useState<RestaurantTable | null>(() => {
    const id = useNavFocusStore.getState().tableId;
    return id ? useTableStore.getState().tables.find((t) => t.id === id) ?? null : null;
  });
  useEffect(() => {
    return useNavFocusStore.subscribe((state) => {
      if (state.tableId) {
        const table = useTableStore.getState().tables.find((t) => t.id === state.tableId);
        if (table) setSelectedTableForCheckout(table);
        useNavFocusStore.getState().clear();
      }
    });
  }, []);
  useEffect(() => { useNavFocusStore.getState().clear(); }, []);
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

  const handleReopen = async (tab: Tab) => {
    if (!['MASTER', 'GERENTE', 'CAIXA'].includes(currentProfile.role)) {
      notify('Apenas Gerente ou Caixa podem reabrir comandas.', 'error');
      return;
    }

    const reason = await requestText({ title: "Reabrir comanda", label: "Motivo da reabertura", confirmText: "Reabrir comanda", message: 'Motivo para reabertura da comanda fechada:', initialValue: 'Erro na cobrança de itens' });
    if (!reason) return;

    try {
      reopenTabAtomic(tab.id, currentProfile.id, reason);
      notify('Comanda reaberta com sucesso.', 'success');
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  return (
    <div className="page-layout">

      <PageHeader eyebrow="Recebimentos" title="Caixa" description="Feche contas, divida pagamentos e acompanhe os recebimentos do turno." icon={Receipt} />
      <section className="surface-card p-4 sm:p-5" aria-label="Recebido no turno">
        <p className="text-sm font-medium text-ink-muted">Recebido no turno</p>
        <p className="mt-0.5 font-mono text-3xl font-bold text-ink">{formatBRL(totalShiftRevenue)}</p>
        <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-sm bg-surface-muted" aria-hidden="true">
          {METHOD_BAR.map((m) => {
            const value = revenueByMethod[m.key];
            return value > 0 ? <span key={m.key} className={m.bar} style={{ width: `${(value / totalShiftRevenue) * 100}%` }} /> : null;
          })}
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {METHOD_BAR.map((m) => {
            const Icon = m.icon;
            return (
              <li key={m.key} className="flex items-start gap-2">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm ${m.bar}`} aria-hidden="true" />
                <div>
                  <p className="flex items-center gap-1 text-sm text-ink-secondary"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{m.label}</p>
                  <p className="font-mono text-base font-bold text-ink">{formatBRL(revenueByMethod[m.key])}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Barra de Filtros e Busca Rápida de Mesas */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 pb-1 text-xs">
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

        {effectiveFilter !== 'CLOSED_TODAY' && activeTables.length > 0 && (
          <div className="w-full sm:w-64">
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar mesa nº ou cliente..."
              aria-label="Buscar mesa ou cliente no caixa"
              className="w-full h-9 px-3 rounded-xl border border-line bg-surface text-xs placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition"
            />
          </div>
        )}
      </div>

      {/* Régua de Acesso Rápido / Atalho Direto para as Mesas Ativas */}
      {effectiveFilter !== 'CLOSED_TODAY' && activeTables.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 custom-scrollbar">
          <span className="text-[13px] font-bold uppercase tracking-wider text-ink-muted whitespace-nowrap">
            Acesso direto:
          </span>
          {activeTables.map((t) => {
            const tTab = tabs.find((tb) => (tb.table_id === t.id || tb.table_id === `table-${t.number}`) && tb.status === 'OPEN');
            const isBill = t.status === 'AGUARDANDO_CONTA';
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTableForCheckout(t)}
                className={`shrink-0 h-8 px-2.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition active:scale-95 ${
                  isBill
                    ? 'border-brand-500 bg-brand-50 text-brand-900 hover:bg-brand-100 shadow-xs'
                    : 'border-line bg-surface hover:bg-surface-muted text-ink'
                }`}
                title={`Abrir fechamento da Mesa ${String(t.number).padStart(2, '0')}`}
              >
                <span>Mesa {String(t.number).padStart(2, '0')}</span>
                {isBill && <span className="h-1.5 w-1.5 rounded-full bg-brand-600 animate-pulse" />}
                {tTab && <span className="font-mono text-ink-muted font-normal">· {formatBRL(tTab.total)}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Grade de Mesas / Comandas */}
      {effectiveFilter !== 'CLOSED_TODAY' ? (
        activeTables.length === 0 ? (
          <EmptyState title="Nenhuma mesa aberta" description="As mesas estão livres para novos clientes. As próximas comandas aparecerão aqui." icon={Receipt} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3.5">
            {activeTables
              .filter((t) => (effectiveFilter === 'WAITING_BILL' ? t.status === 'AGUARDANDO_CONTA' : true))
              .filter((t) => {
                if (!query) return true;
                const currentTab = tabs.find((tab) => (tab.table_id === t.id || tab.table_id === `table-${t.number}`) && tab.status === 'OPEN');
                const numStr = String(t.number);
                return (
                  numStr.includes(query) ||
                  numStr.padStart(2, '0').includes(query) ||
                  (currentTab?.customer_name?.toLocaleLowerCase('pt-BR').includes(query) ?? false)
                );
              })
              .map((table) => {
                const currentTab = tabs.find((tab) => (tab.table_id === table.id || tab.table_id === `table-${table.number}`) && tab.status === 'OPEN');
                const isWaitingBill = table.status === 'AGUARDANDO_CONTA';
                const items = currentTab ? getTabOrderItems(currentTab.id) : [];

                return (
                  <div
                    key={table.id}
                    className="p-3.5 sm:p-4 rounded-xl border border-line bg-surface transition flex flex-col justify-between space-y-3 hover:border-line-strong hover:shadow-xs"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xl font-bold tabular-nums text-ink font-mono">
                            Mesa {String(table.number).padStart(2, '0')}
                          </span>
                          {isWaitingBill && (
                            <span className="status-badge bg-brand-500 text-white text-[13px]">
                              Conta pedida {billMinutes(table)}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-ink-muted flex items-center gap-1 tabular-nums shrink-0">
                          <Users className="w-3.5 h-3.5 text-ink-muted" />
                          {currentTab?.people_count || 1}p
                        </span>
                      </div>

                      <p className="text-xs text-ink-muted mt-1 truncate font-medium">
                        {currentTab?.customer_name || `Mesa ${table.number}`}
                      </p>

                      <div className="mt-2.5 pt-2 border-t border-line/60 flex items-baseline justify-between">
                        <span className="text-xs text-ink-muted">
                          {items.filter(i => i.status !== 'CANCELLED').length} itens
                        </span>
                        <span className="text-lg font-bold tabular-nums text-brand-700 font-mono">
                          {formatBRL(currentTab?.total || 0)}
                        </span>
                      </div>
                    </div>

                    {/* Toda cobrança passa pelo fechamento de conta */}
                    <button
                      onClick={() => setSelectedTableForCheckout(table)}
                      className={`w-full min-h-[44px] rounded-lg font-bold text-sm transition flex items-center justify-center gap-1.5 ${
                        isWaitingBill ? 'bg-brand-700 text-white hover:bg-brand-800' : 'bg-ink text-white hover:bg-ink-secondary'
                      }`}
                      type="button"
                    >
                      <Receipt className="w-4 h-4" />
                      <span>Cobrar</span>
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
              const table = tables.find((t) => t.id === tab.table_id || `table-${t.number}` === tab.table_id);
              const tabPayments = payments.filter((p) => p.tab_id === tab.id && p.status === 'PAID');

              return (
                <div
                  key={tab.id}
                  className="p-5 rounded-2xl bg-surface-muted border border-line space-y-3.5 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                    <div>
                      <div className="font-bold text-ink text-base tabular-nums">
                        Mesa {table ? String(table.number).padStart(2, '0') : '—'} · {new Date(tab.closed_at || tab.opened_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <p className="text-xs text-ink-muted mt-0.5">
                        {tab.customer_name || 'Sem nome'}
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
                          className="status-badge bg-surface-muted text-ink"
                        >
                          {METHOD_LABELS[p.method] ?? p.method}: <span className="font-mono">{formatBRL(p.amount)}</span>
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
                      <span>Ver cupom</span>
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
          table={tables.find((t) => t.id === selectedClosedTabForReceipt.table_id || `table-${t.number}` === selectedClosedTabForReceipt.table_id)}
          items={getTabOrderItems(selectedClosedTabForReceipt.id)}
          payments={payments.filter((p) => p.tab_id === selectedClosedTabForReceipt.id && p.status === 'PAID')}
        />
      )}

    </div>
  );
};
