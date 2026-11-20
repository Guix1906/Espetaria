import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  QrCode,
  Receipt,
  RotateCcw,
  Search,
  Users,
  Wallet,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { FilterChip } from '../../components/ui/FilterChip';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { KpiCard } from '../../components/ui/KpiCard';
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
  { key: 'DINHEIRO', label: 'Dinheiro', icon: Banknote, bar: 'bg-amber-500', tile: 'bg-amber-50 text-amber-800' },
  { key: 'PIX', label: 'PIX', icon: QrCode, bar: 'bg-emerald-600', tile: 'bg-emerald-50 text-emerald-700' },
  { key: 'DEBITO', label: 'Débito', icon: CreditCard, bar: 'bg-ink-secondary', tile: 'bg-surface-muted text-ink-secondary' },
  { key: 'CREDITO', label: 'Crédito', icon: CreditCard, bar: 'bg-brand-500', tile: 'bg-brand-50 text-brand-700' },
] as const;

const minutesSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));

/** "agora", "há 12 min", "há 1 h 05". */
function sinceLabel(iso: string): string {
  const min = minutesSince(iso);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  return `há ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

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

  // Atualiza os "há X min" a cada 30 s
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

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

  const openTabOf = (table: RestaurantTable) =>
    tabs.find((tab) => (tab.table_id === table.id || tab.table_id === `table-${table.number}`) && tab.status === 'OPEN');

  // Mesas e comandas
  const waitingBillTables = tables.filter((t) => t.status === 'AGUARDANDO_CONTA');
  const activeTables = tables.filter((t) => t.status === 'OCUPADA' || t.status === 'AGUARDANDO_CONTA');
  const closedTabs = currentShift
    ? tabs
        .filter((t) => t.shift_id === currentShift.id && t.status === 'CLOSED')
        .sort((a, b) => (b.closed_at || b.opened_at).localeCompare(a.closed_at || a.opened_at))
    : [];

  const openTotal = activeTables.reduce((s, t) => s + (openTabOf(t)?.total || 0), 0);
  const closedTotal = closedTabs.reduce((s, t) => s + (t.total || 0), 0);
  const avgTicket = closedTabs.length ? closedTotal / closedTabs.length : 0;
  const oldestBill = [...waitingBillTables].sort((a, b) => a.updated_at.localeCompare(b.updated_at))[0];

  // Se não houver mesas aguardando conta ao abrir, exibe todas as ativas
  const effectiveFilter = filter === 'WAITING_BILL' && waitingBillTables.length === 0 ? 'ALL_ACTIVE' : filter;

  const shownTables = activeTables
    .filter((t) => (effectiveFilter === 'WAITING_BILL' ? t.status === 'AGUARDANDO_CONTA' : true))
    .filter((t) => {
      if (!query) return true;
      const currentTab = openTabOf(t);
      const numStr = String(t.number);
      return (
        numStr.includes(query) ||
        numStr.padStart(2, '0').includes(query) ||
        (currentTab?.customer_name?.toLocaleLowerCase('pt-BR').includes(query) ?? false)
      );
    })
    // Conta pedida primeiro (a mais antiga no topo), depois pelo número da mesa
    .sort((a, b) => {
      const wa = a.status === 'AGUARDANDO_CONTA';
      const wb = b.status === 'AGUARDANDO_CONTA';
      if (wa !== wb) return wa ? -1 : 1;
      if (wa && wb) return a.updated_at.localeCompare(b.updated_at);
      return a.number - b.number;
    });

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

  const canReopen = ['MASTER', 'GERENTE', 'CAIXA'].includes(currentProfile.role);

  return (
    <div className="page-layout">

      <PageHeader eyebrow="Recebimentos" title="Caixa" description="Feche contas, divida pagamentos e acompanhe os recebimentos do turno." icon={Receipt} />

      {!currentShift && (
        <p className="notice border-amber-200 bg-amber-50 text-amber-900" role="status">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
          O turno está fechado. Abra o turno na Visão geral para receber pagamentos.
        </p>
      )}

      {/* Números do turno */}
      <section aria-label="Resumo do turno" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Recebido no turno" value={formatBRL(totalShiftRevenue)} icon={Wallet} tone="success"
          hint={`${shiftPayments.length} ${shiftPayments.length === 1 ? 'pagamento' : 'pagamentos'}`} />
        <KpiCard label="Contas pedidas" value={waitingBillTables.length} icon={AlertTriangle}
          tone={waitingBillTables.length > 0 ? 'warning' : 'neutral'} highlight={waitingBillTables.length > 0}
          hint={oldestBill ? `A mais antiga pediu ${sinceLabel(oldestBill.updated_at)}` : 'Nenhuma mesa esperando'} />
        <KpiCard label="Em aberto nas mesas" value={formatBRL(openTotal)} icon={Users} tone="brand"
          hint={`${activeTables.length} ${activeTables.length === 1 ? 'mesa ocupada' : 'mesas ocupadas'}`} />
        <KpiCard label="Comandas encerradas" value={closedTabs.length} icon={CheckCircle2}
          hint={closedTabs.length ? `Ticket médio ${formatBRL(avgTicket)}` : 'Nenhuma ainda'} />
      </section>

      {/* Recebido por forma de pagamento */}
      <section className="surface-card p-4 sm:p-5" aria-labelledby="cashier-methods-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="cashier-methods-title" className="text-base font-semibold text-ink">Recebido por forma de pagamento</h2>
          <span className="font-mono text-sm font-semibold text-ink-secondary">{formatBRL(totalShiftRevenue)}</span>
        </div>
        <div className="mt-3 flex h-3 w-full overflow-hidden rounded-sm bg-surface-muted" aria-hidden="true">
          {totalShiftRevenue > 0 && METHOD_BAR.map((m) => {
            const value = revenueByMethod[m.key];
            return value > 0 ? <span key={m.key} className={m.bar} style={{ width: `${(value / totalShiftRevenue) * 100}%` }} /> : null;
          })}
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {METHOD_BAR.map((m) => {
            const Icon = m.icon;
            const value = revenueByMethod[m.key];
            const pct = totalShiftRevenue > 0 ? Math.round((value / totalShiftRevenue) * 100) : 0;
            return (
              <li key={m.key} className="flex items-center gap-3 rounded-lg border border-line bg-white/60 p-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${m.tile}`} aria-hidden="true">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm text-ink-secondary">
                    <span className={`h-2 w-2 rounded-sm ${m.bar}`} aria-hidden="true" />
                    {m.label}
                    {value > 0 && <span className="text-xs text-ink-muted">{pct}%</span>}
                  </p>
                  <p className="font-mono text-base font-bold text-ink">{formatBRL(value)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Filtros e busca */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="filter-bar" aria-label="Mostrar">
          <FilterChip active={effectiveFilter === 'WAITING_BILL'} onClick={() => setFilter('WAITING_BILL')} count={waitingBillTables.length}>
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />Conta pedida
          </FilterChip>
          <FilterChip active={effectiveFilter === 'ALL_ACTIVE'} onClick={() => setFilter('ALL_ACTIVE')} count={activeTables.length}>
            <Users className="h-4 w-4" aria-hidden="true" />Em atendimento
          </FilterChip>
          <FilterChip active={effectiveFilter === 'CLOSED_TODAY'} onClick={() => setFilter('CLOSED_TODAY')} count={closedTabs.length}>
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />Encerradas
          </FilterChip>
        </div>

        {effectiveFilter !== 'CLOSED_TODAY' && activeTables.length > 0 && (
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar mesa ou cliente"
              aria-label="Buscar mesa ou cliente no caixa"
              className="h-11 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-sm placeholder:text-ink-muted focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
        )}
      </div>

      {/* Mesas / comandas */}
      {effectiveFilter !== 'CLOSED_TODAY' ? (
        activeTables.length === 0 ? (
          <EmptyState title="Nenhuma mesa aberta" description="As mesas estão livres para novos clientes. As próximas comandas aparecerão aqui." icon={Receipt} />
        ) : shownTables.length === 0 ? (
          <EmptyState title="Nenhuma mesa encontrada" description="Confira o número da mesa ou o nome do cliente." icon={Search} />
        ) : (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {shownTables.map((table) => {
              const currentTab = openTabOf(table);
              const isWaitingBill = table.status === 'AGUARDANDO_CONTA';
              const items = currentTab ? getTabOrderItems(currentTab.id) : [];
              const itemCount = items.filter((i) => i.status !== 'CANCELLED').length;
              const customer = currentTab?.customer_name && !/^mesa\s*\d+$/i.test(currentTab.customer_name.trim()) ? currentTab.customer_name : null;

              return (
                <article
                  key={table.id}
                  className={`surface-card flex flex-col overflow-hidden transition hover:shadow-xs ${
                    isWaitingBill ? 'border-2 border-brand-600' : 'hover:border-line-strong'
                  }`}
                >
                  {isWaitingBill && (
                    <p className="flex items-center gap-1.5 bg-brand-600 px-4 py-1.5 text-xs font-bold text-white">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                      Pediu a conta {sinceLabel(table.updated_at)}
                    </p>
                  )}
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-mono text-xl font-bold tabular-nums text-ink">Mesa {String(table.number).padStart(2, '0')}</h3>
                        {customer && <p className="mt-0.5 truncate text-sm font-medium text-ink-secondary">{customer}</p>}
                      </div>
                      <span className="flex shrink-0 items-center gap-1 rounded-md bg-surface-muted px-2 py-1 text-xs font-semibold tabular-nums text-ink-secondary">
                        <Users className="h-3.5 w-3.5" aria-hidden="true" />
                        {currentTab?.people_count || 1} {(currentTab?.people_count || 1) === 1 ? 'pessoa' : 'pessoas'}
                      </span>
                    </div>

                    <div className="flex items-end justify-between gap-2 border-t border-line pt-3">
                      <div className="space-y-0.5 text-xs text-ink-muted">
                        <p>{itemCount === 1 ? '1 item' : `${itemCount} itens`}</p>
                        {currentTab && (
                          <p className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden="true" />Aberta {sinceLabel(currentTab.opened_at)}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-ink-muted">Total</p>
                        <p className="font-mono text-2xl font-bold tabular-nums text-ink">{formatBRL(currentTab?.total || 0)}</p>
                      </div>
                    </div>

                    {/* Toda cobrança passa pelo fechamento de conta */}
                    <button
                      onClick={() => setSelectedTableForCheckout(table)}
                      className={`mt-auto min-h-[48px] w-full ${isWaitingBill ? 'btn-primary' : 'btn-secondary'}`}
                      type="button"
                    >
                      <Receipt className="h-4 w-4" aria-hidden="true" />
                      <span>Cobrar mesa {String(table.number).padStart(2, '0')}</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : (
        /* Comandas encerradas no turno */
        closedTabs.length === 0 ? (
          <EmptyState title="Nenhuma comanda encerrada" description="Os recibos e pagamentos aparecerão aqui após o fechamento das contas." icon={Receipt} />
        ) : (
          <section className="surface-card overflow-hidden" aria-label="Comandas encerradas">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
              <h2 className="text-base font-semibold text-ink">Encerradas no turno</h2>
              <p className="text-sm text-ink-secondary">
                {closedTabs.length} {closedTabs.length === 1 ? 'comanda' : 'comandas'} · <strong className="font-mono text-ink">{formatBRL(closedTotal)}</strong>
              </p>
            </div>
            <ul className="divide-y divide-line">
              {closedTabs.map((tab) => {
                const table = tables.find((t) => t.id === tab.table_id || `table-${t.number}` === tab.table_id);
                const tabPayments = payments.filter((p) => p.tab_id === tab.id && p.status === 'PAID');
                const customer = tab.customer_name && !/^mesa\s*\d+$/i.test(tab.customer_name.trim()) ? tab.customer_name : null;

                return (
                  <li key={tab.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700" aria-hidden="true">
                      <CheckCircle2 className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink">
                        Mesa {table ? String(table.number).padStart(2, '0') : '—'}
                        {customer && <span className="font-normal text-ink-secondary"> · {customer}</span>}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                        <span className="font-mono">Fechada às {hhmm(tab.closed_at || tab.opened_at)}</span>
                        {tabPayments.map((p) => (
                          <span key={p.id} className="status-badge bg-surface-muted text-ink-secondary">
                            {METHOD_LABELS[p.method] ?? p.method} <span className="font-mono">{formatBRL(p.amount)}</span>
                          </span>
                        ))}
                      </p>
                    </div>
                    <span className="font-mono text-lg font-bold tabular-nums text-emerald-800">{formatBRL(tab.total)}</span>
                    <div className="flex w-full gap-2 sm:w-auto">
                      <button onClick={() => setSelectedClosedTabForReceipt(tab)} className="btn-secondary min-h-[44px] flex-1 sm:flex-none" type="button">
                        <Receipt className="h-4 w-4" aria-hidden="true" />
                        Ver cupom
                      </button>
                      {canReopen && (
                        <button
                          onClick={() => handleReopen(tab)}
                          className="btn-danger-soft min-h-[44px] flex-1 sm:flex-none"
                          title="Reabrir comanda caso tenha sido fechada por engano"
                          type="button"
                        >
                          <RotateCcw className="h-4 w-4" aria-hidden="true" />
                          Reabrir
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )
      )}

      {/* Fechamento da mesa selecionada */}
      {selectedTableForCheckout && (
        <TableSettlementModal
          table={selectedTableForCheckout}
          isOpen={true}
          onClose={() => setSelectedTableForCheckout(null)}
        />
      )}

      {/* Cupom de comanda já fechada */}
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
