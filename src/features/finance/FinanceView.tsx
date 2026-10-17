import { useMemo, useState, type FormEvent } from 'react';
import { ArrowDownRight, ArrowUpRight, CalendarClock, ChevronDown, Download, Eye, Landmark, Pencil, Scale, Trash2, Wallet, X } from 'lucide-react';
import { Dialog } from '../../components/ui/Dialog';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { useAuthStore } from '../../stores/useAuthStore';
import { PageHeader } from '../../components/ui/PageHeader';
import { FilterChip } from '../../components/ui/FilterChip';
import { StatCard } from '../../components/ui/StatCard';
import { PeriodPicker, defaultPeriod, type Period } from '../../components/ui/PeriodPicker';
import { Chart, CHART_COLORS, baseOptions } from '../../components/charts/Chart';
import { formatBRL } from '../../lib/formatters';
import { METHOD_LABELS, SALE_METHODS, buildCashFlow, downloadCsv, financeEntriesApi, salesApi, sumBy, todayISO, type CashFlowGrouping, type FinanceDataset, type FinanceKind, type SaleRecord } from '../../lib/financeData';
import { useFinanceData } from './useFinanceData';
import { EntriesPanel, EntryForm } from './EntriesPanel';

type Tab = 'overview' | 'cashflow' | 'PAGAR' | 'RECEBER';

export function FinanceView() {
  const [period, setPeriod] = useState<Period>(() => defaultPeriod('30d'));
  const [tab, setTab] = useState<Tab>('overview');
  const { data, loading, error, reload } = useFinanceData(period);

  return (
    <div className="page-layout">
      <PageHeader title="Financeiro" description="Entradas e saídas reais do caixa, contas a pagar e a receber. As vendas do salão e do delivery entram sozinhas." />
      <PeriodPicker value={period} onChange={setPeriod} />
      <div className="filter-bar border-b border-line pb-2" aria-label="Seções do financeiro">
        <FilterChip active={tab === 'overview'} onClick={() => setTab('overview')}>Visão geral</FilterChip>
        <FilterChip active={tab === 'cashflow'} onClick={() => setTab('cashflow')}>Fluxo de caixa</FilterChip>
        <FilterChip active={tab === 'PAGAR'} onClick={() => setTab('PAGAR')}>Contas a pagar</FilterChip>
        <FilterChip active={tab === 'RECEBER'} onClick={() => setTab('RECEBER')}>Contas a receber</FilterChip>
      </div>
      {error && <p role="alert" className="notice border-rose-200 bg-rose-50 text-rose-800">{error}</p>}
      {!data ? <div className="surface-card p-10 text-center text-sm text-ink-muted" role="status">{loading ? 'Carregando dados do período...' : 'Sem dados.'}</div> : (
        <>
          {tab === 'overview' && <Overview data={data} />}
          {tab === 'cashflow' && <CashFlow data={data} reload={reload} />}
          {(tab === 'PAGAR' || tab === 'RECEBER') && <EntriesPanel kind={tab as FinanceKind} data={data} onChanged={reload} />}
        </>
      )}
    </div>
  );
}

/** Gráfico de fluxo: escuras = realizado, claras = previsto; linhas = saldo realizado e projetado. */
export function CashFlowChart({ data, height = 320, grouping = 'auto', showForecast = false }: { data: FinanceDataset; height?: number; grouping?: CashFlowGrouping; showForecast?: boolean }) {
  const flow = useMemo(() => buildCashFlow(data, grouping), [data, grouping]);
  const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  // Padrão: 3 séries (entradas, saídas, saldo). Previsões só quando pedidas.
  const series = showForecast
    ? [
        { name: 'Entradas', type: 'column', group: 'mov', data: flow.map((b) => +b.inflow.toFixed(2)) },
        { name: 'Entradas previstas', type: 'column', group: 'mov', data: flow.map((b) => +b.inflowForecast.toFixed(2)) },
        { name: 'Saídas', type: 'column', group: 'mov', data: flow.map((b) => +(-b.outflow).toFixed(2)) },
        { name: 'Saídas previstas', type: 'column', group: 'mov', data: flow.map((b) => +(-b.outflowForecast).toFixed(2)) },
        { name: 'Saldo', type: 'line', data: flow.map((b) => +b.balance.toFixed(2)) },
        { name: 'Saldo projetado', type: 'line', data: flow.map((b) => +b.projected.toFixed(2)) },
      ]
    : [
        { name: 'Entradas', type: 'column', group: 'mov', data: flow.map((b) => +b.inflow.toFixed(2)) },
        { name: 'Saídas', type: 'column', group: 'mov', data: flow.map((b) => +(-b.outflow).toFixed(2)) },
        { name: 'Saldo', type: 'line', data: flow.map((b) => +b.balance.toFixed(2)) },
      ];
  const lineFrom = showForecast ? 4 : 2;
  return (
    <Chart
      type="line"
      height={height}
      series={series}
      options={baseOptions({
        colors: showForecast
          ? [CHART_COLORS.inflow, CHART_COLORS.inflowForecast, CHART_COLORS.outflow, CHART_COLORS.outflowForecast, CHART_COLORS.balance, CHART_COLORS.brand]
          : [CHART_COLORS.inflow, CHART_COLORS.outflow, CHART_COLORS.balance],
        chart: { type: 'line', stacked: true },
        plotOptions: { bar: { columnWidth: flow.length > 20 ? '80%' : '55%', borderRadius: 2 } },
        stroke: showForecast ? { width: [0, 0, 0, 0, 2.5, 2], curve: 'smooth', dashArray: [0, 0, 0, 0, 0, 5] } : { width: [0, 0, 2.5], curve: 'smooth' },
        markers: { size: flow.length > 24 ? 0 : showForecast ? [0, 0, 0, 0, 4, 3] : [0, 0, 4], strokeWidth: 0, hover: { size: 5 } },
        xaxis: { categories: flow.map((b) => b.label), tickAmount: Math.min(flow.length, 12) },
        tooltip: {
          shared: true, intersect: false,
          y: { formatter: (v: number, { seriesIndex }: { seriesIndex: number }) => (seriesIndex >= lineFrom ? money(v) : money(Math.abs(v))) },
        },
      })}
    />
  );
}

/** Botão "Mostrar previsto" do gráfico de fluxo. */
function ForecastToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return <button type="button" aria-pressed={value} onClick={() => onChange(!value)} className={`min-h-[44px] rounded-md border px-3.5 text-sm font-semibold ${value ? 'border-ink bg-ink text-white' : 'border-line-strong bg-surface text-ink-secondary'}`}>{value ? 'Ocultar previsto' : 'Mostrar previsto'}</button>;
}
/** Agrupamento do fluxo: dia, semana, mês ou ano. */
function GroupingPicker({ value, onChange }: { value: CashFlowGrouping; onChange: (g: CashFlowGrouping) => void }) {
  const options: { id: CashFlowGrouping; label: string }[] = [{ id: 'day', label: 'Dia' }, { id: 'week', label: 'Semana' }, { id: 'month', label: 'Mês' }, { id: 'year', label: 'Ano' }];
  return (
    <div role="group" aria-label="Agrupar por" className="inline-flex rounded-xl border border-line bg-surface p-0.5">
      {options.map((o) => <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)} className={`h-9 min-h-0 rounded-lg px-3 text-sm font-medium ${value === o.id ? 'bg-brand-950 text-white' : 'text-ink-secondary hover:text-ink'}`}>{o.label}</button>)}
    </div>
  );
}

/** Agrupamento escolhido; volta ao automático quando o período muda. */
function useGrouping(data: FinanceDataset) {
  const [state, setState] = useState<{ key: string; value: CashFlowGrouping }>(() => ({ key: data.from + data.to, value: autoGrouping(data) }));
  const value = state.key === data.from + data.to ? state.value : autoGrouping(data);
  return [value, (g: CashFlowGrouping) => setState({ key: data.from + data.to, value: g })] as const;
}

/** Agrupamento padrão conforme o tamanho do período. */
function autoGrouping(data: FinanceDataset): CashFlowGrouping {
  const days = Math.round((new Date(data.to).getTime() - new Date(data.from).getTime()) / 86_400_000) + 1;
  return days > 400 ? 'year' : days > 62 ? 'month' : days > 31 ? 'week' : 'day';
}
function Overview({ data }: { data: FinanceDataset }) {
  const [grouping, setGrouping] = useGrouping(data);
  const [showForecast, setShowForecast] = useState(false);
  const today = todayISO();
  const inflow = data.sales.reduce((s, x) => s + x.amount, 0) + data.entries.filter((e) => e.kind === 'RECEBER' && e.paid_at).reduce((s, e) => s + e.amount, 0);
  const outflow = data.entries.filter((e) => e.kind === 'PAGAR' && e.paid_at).reduce((s, e) => s + e.amount, 0);
  const toPay = data.entries.filter((e) => e.kind === 'PAGAR' && !e.paid_at);
  const toReceive = data.entries.filter((e) => e.kind === 'RECEBER' && !e.paid_at);
  const overdue = [...toPay, ...toReceive].filter((e) => e.due_date < today);
  const salon = data.sales.filter((s) => s.channel === 'SALAO').reduce((s, x) => s + x.amount, 0);
  const delivery = data.sales.filter((s) => s.channel === 'DELIVERY').reduce((s, x) => s + x.amount, 0);
  const byMethod = sumBy(data.sales, (s) => METHOD_LABELS[s.method] ?? s.method, (s) => s.amount);
  const expenses = sumBy(data.entries.filter((e) => e.kind === 'PAGAR'), (e) => e.category, (e) => e.amount);
  const pendingDelivery = data.deliveries.filter((d) => !d.paid && d.status !== 'CANCELLED').reduce((s, d) => s + d.total, 0);

  return (
    <div className="space-y-6">
      <div className="stat-grid">
        <StatCard label="Entradas no período" value={formatBRL(inflow)} hint={<>Salão {formatBRL(salon)} · Delivery {formatBRL(delivery)}</>} icon={ArrowUpRight} />
        <StatCard label="Saídas no período" value={formatBRL(outflow)} hint="Contas pagas" icon={ArrowDownRight} />
        <StatCard label="Resultado" value={<span className={inflow - outflow < 0 ? 'text-rose-700' : ''}>{formatBRL(inflow - outflow)}</span>} hint="Entradas menos saídas" icon={Scale} />
        <StatCard label="A receber" value={formatBRL(toReceive.reduce((s, e) => s + e.amount, 0) + pendingDelivery + data.openTabsTotal)} hint="Contas, delivery a receber e comandas abertas" icon={Wallet} tone="success" />
        <StatCard label="A pagar" value={formatBRL(toPay.reduce((s, e) => s + e.amount, 0))} hint="Contas ainda não pagas" icon={Wallet} tone="danger" />
      </div>
      {overdue.length > 0 && <p className="notice border-amber-200 bg-amber-50 text-amber-900"><CalendarClock className="h-5 w-5 shrink-0" aria-hidden="true" />{overdue.length} {overdue.length === 1 ? 'conta vencida' : 'contas vencidas'} em aberto, somando {formatBRL(overdue.reduce((s, e) => s + e.amount, 0))}. Veja em Contas a pagar / a receber.</p>}
      <section className="surface-card p-4 sm:p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">Fluxo de caixa</h2><div className="flex flex-wrap items-center gap-2"><ForecastToggle value={showForecast} onChange={setShowForecast} /><GroupingPicker value={grouping} onChange={setGrouping} /></div></div>
        <p className="mb-2 text-[13px] text-ink-muted">{showForecast ? 'Barras claras: previsto (contas em aberto, delivery a receber e comandas abertas). Linha tracejada: saldo projetado.' : 'Barras: entradas e saídas realizadas. Linha: saldo.'}</p>
        <CashFlowChart data={data} grouping={grouping} showForecast={showForecast} />
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surface-card p-4 sm:p-5">
          <h2 className="mb-2 text-base font-semibold">Recebido por forma de pagamento</h2>
          {byMethod.length ? <Chart type="donut" height={280} series={byMethod.map((m) => +m.total.toFixed(2))} options={baseOptions({ labels: byMethod.map((m) => m.name), colors: CHART_COLORS.palette, legend: { position: 'bottom' }, plotOptions: { pie: { donut: { size: '62%', labels: { show: true, total: { show: true, label: 'Total', formatter: () => formatBRL(byMethod.reduce((s, m) => s + m.total, 0)) } } } } } })} /> : <Empty />}
        </section>
        <section className="surface-card p-4 sm:p-5">
          <h2 className="mb-2 text-base font-semibold">Despesas por categoria</h2>
          {expenses.length ? <Chart type="bar" height={280} series={[{ name: 'Despesas', data: expenses.map((e) => +e.total.toFixed(2)) }]} options={baseOptions({ colors: [CHART_COLORS.outflow], plotOptions: { bar: { horizontal: true, borderRadius: 2, barHeight: '60%' } }, xaxis: { categories: expenses.map((e) => e.name) } })} /> : <Empty text="Nenhuma conta a pagar lançada no período." />}
        </section>
      </div>
    </div>
  );
}

function CashFlow({ data, reload }: { data: FinanceDataset; reload: () => void }) {
  const [grouping, setGrouping] = useGrouping(data);
  const [showForecast, setShowForecast] = useState(false);
  const [editingEntry, setEditingEntry] = useState<import('../../lib/financeData').FinanceEntry | null>(null);
  const [viewingEntry, setViewingEntry] = useState<{ description: string; amount: number; date: string; source: string; method?: string } | null>(null);
  const [editingSale, setEditingSale] = useState<SaleRecord | null>(null);
  const { notify, requestText, requestChoice } = useFeedback();
  const canManage = ['MASTER', 'GERENTE'].includes(useAuthStore((s) => s.currentProfile.role));
  const flow = useMemo(() => buildCashFlow(data, grouping), [data, grouping]);
  const exportCsv = () => downloadCsv(`fluxo-de-caixa_${data.from}_${data.to}.csv`, ['Período', 'Entradas', 'Saídas', 'Entradas previstas', 'Saídas previstas', 'Saldo realizado', 'Saldo projetado'], flow.map((b) => [b.label, b.inflow, b.outflow, b.inflowForecast, b.outflowForecast, b.balance, b.projected]));

  // Vendas agrupadas por dia e canal; contas a pagar/receber continuam uma por uma
  type Row =
    | { kind: 'sales'; id: string; date: string; channel: SaleRecord['channel']; total: number; sales: SaleRecord[] }
    | { kind: 'entry'; id: string; date: string; description: string; amount: number; type: 'in' | 'out'; source: string; raw: import('../../lib/financeData').FinanceEntry };
  const rows = useMemo(() => {
    const groups = new Map<string, Extract<Row, { kind: 'sales' }>>();
    data.sales.forEach((s) => {
      const date = s.at.slice(0, 10);
      const key = `${date}|${s.channel}`;
      const g = groups.get(key) ?? { kind: 'sales' as const, id: `sales-${key}`, date, channel: s.channel, total: 0, sales: [] };
      g.total += s.amount;
      g.sales.push(s);
      groups.set(key, g);
    });
    const entries: Row[] = data.entries.map((e) => ({
      kind: 'entry', id: e.id, date: e.paid_at?.slice(0, 10) ?? e.due_date, description: e.description, amount: e.amount,
      type: e.kind === 'RECEBER' ? 'in' : 'out', source: e.kind === 'RECEBER' ? 'A receber' : 'A pagar', raw: e,
    }));
    return [...groups.values(), ...entries].sort((x, y) => y.date.localeCompare(x.date));
  }, [data]);
  const dayLabel = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const handleDelete = async (id: string, description: string) => {
    const answer = await requestChoice({ title: `Excluir "${description}"?`, message: 'Esta ação não pode ser desfeita.', choices: [{ value: 'yes', label: 'Excluir' }, { value: 'no', label: 'Cancelar' }] });
    if (answer !== 'yes') return;
    try {
      await financeEntriesApi.remove(id);
      notify('Lançamento excluído.', 'success');
      reload();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Não foi possível excluir o lançamento.', 'error');
    }
  };

  /** Estorna a venda: sai do faturamento (delivery volta para "a receber"). Fica na auditoria. */
  const voidSale = async (sale: SaleRecord) => {
    const reason = await requestText({
      title: `Excluir venda de ${formatBRL(sale.amount)}`,
      message: sale.channel === 'SALAO'
        ? 'O pagamento será estornado e a venda sai do faturamento e dos relatórios. Fica registrado na auditoria com o motivo.'
        : 'O recebimento será estornado: o pedido de delivery volta para "a receber". Para cancelar o pedido em si, use a tela Delivery.',
      label: 'Motivo',
      initialValue: 'Lançamento de teste',
      confirmText: 'Excluir venda',
      danger: true,
    });
    if (!reason) return;
    try {
      await salesApi.void(sale, reason);
      notify('Venda estornada.', 'success');
      reload();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Não foi possível estornar a venda.', 'error');
    }
  };
  return (
    <div className="space-y-6">
      <section className="surface-card p-4 sm:p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Fluxo de caixa</h2>
          <div className="flex flex-wrap items-center gap-2"><ForecastToggle value={showForecast} onChange={setShowForecast} /><GroupingPicker value={grouping} onChange={setGrouping} /><button type="button" className="btn-secondary min-h-[44px]" onClick={exportCsv}><Download className="h-4 w-4" aria-hidden="true" />Exportar planilha</button></div>
        </div>
        <CashFlowChart data={data} height={360} grouping={grouping} showForecast={showForecast} />
      </section>
      <section className="surface-card p-4 sm:p-5">
        <h2 className="mb-2 text-base font-semibold">Saldo acumulado</h2>
        <Chart type="area" height={220} series={[{ name: 'Saldo realizado', data: flow.map((b) => +b.balance.toFixed(2)) }, { name: 'Saldo projetado', data: flow.map((b) => +b.projected.toFixed(2)) }]} options={baseOptions({ colors: [CHART_COLORS.balance, CHART_COLORS.brand], stroke: { width: [2, 2], curve: 'smooth', dashArray: [0, 5] }, fill: { type: 'gradient', gradient: { opacityFrom: 0.25, opacityTo: 0.02 } }, xaxis: { categories: flow.map((b) => b.label), tickAmount: Math.min(flow.length, 12) } })} />
      </section>
      <section className="surface-card overflow-x-auto p-0">
        <table className="data-table">
          <thead><tr><th className="pl-4">Período</th><th className="text-right">Entradas</th><th className="text-right">Saídas</th><th className="text-right">Previsto entrar</th><th className="text-right">Previsto sair</th><th className="text-right">Saldo</th><th className="pr-4 text-right">Projetado</th></tr></thead>
          <tbody>
            {flow.filter((b) => b.inflow || b.outflow || b.inflowForecast || b.outflowForecast).map((b) => (
              <tr key={b.key}>
                <td className="pl-4">{b.label}</td>
                <td className="text-right tabular-nums text-emerald-800">{b.inflow ? formatBRL(b.inflow) : '—'}</td>
                <td className="text-right tabular-nums text-rose-800">{b.outflow ? formatBRL(b.outflow) : '—'}</td>
                <td className="text-right tabular-nums text-ink-muted">{b.inflowForecast ? formatBRL(b.inflowForecast) : '—'}</td>
                <td className="text-right tabular-nums text-ink-muted">{b.outflowForecast ? formatBRL(b.outflowForecast) : '—'}</td>
                <td className={`text-right font-medium tabular-nums ${b.balance < 0 ? 'text-rose-700' : ''}`}>{formatBRL(b.balance)}</td>
                <td className={`pr-4 text-right tabular-nums ${b.projected < 0 ? 'text-rose-700' : 'text-ink-muted'}`}>{formatBRL(b.projected)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {flow.every((b) => !b.inflow && !b.outflow && !b.inflowForecast && !b.outflowForecast) && <Empty text="Nenhuma movimentação no período." />}
      </section>

      <section className="surface-card p-4 sm:p-5">
        <h2 className="mb-3 text-base font-semibold">Lançamentos do período</h2>
        {rows.length === 0 ? (
          <Empty text="Nenhum lançamento neste período." />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((row) => row.kind === 'sales' ? (
              <li key={row.id} className="py-1">
                <details className="group">
                  <summary className="flex min-h-[48px] cursor-pointer list-none items-center gap-3 py-2 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-ink">Vendas {row.channel === 'SALAO' ? 'do salão' : 'do delivery'} · <span className="font-mono">{dayLabel(row.date)}</span></span>
                      <span className="block text-[13px] text-ink-muted">{row.sales.length} {row.sales.length === 1 ? 'venda' : 'vendas'} · toque para ver</span>
                    </span>
                    <span className="font-mono text-base font-semibold text-emerald-800">+{formatBRL(row.total)}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <ul className="mb-2 divide-y divide-line rounded-md border border-line">
                    {row.sales.map((sale, idx) => (
                      <li key={`${sale.at}-${idx}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                        <span className="font-mono text-ink-muted">{new Date(sale.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="min-w-0 flex-1 text-ink-secondary">{METHOD_LABELS[sale.method] ?? sale.method}</span>
                        <span className="font-mono font-semibold text-ink">{formatBRL(sale.amount)}</span>
                        <span className="flex gap-1">
                          <button type="button" className="icon-button h-11 w-11" onClick={() => setViewingEntry({ description: `Venda ${sale.channel === 'SALAO' ? 'salão' : 'delivery'}`, amount: sale.amount, date: sale.at.slice(0, 10), source: sale.channel === 'SALAO' ? 'Salão' : 'Delivery', method: METHOD_LABELS[sale.method] ?? sale.method })} aria-label="Ver detalhes da venda"><Eye className="h-4 w-4" /></button>
                          {canManage && <button type="button" className="icon-button h-11 w-11" onClick={() => setEditingSale(sale)} aria-label="Corrigir forma de pagamento"><Pencil className="h-4 w-4" /></button>}
                          {canManage && <button type="button" className="icon-button h-11 w-11 text-rose-700 hover:bg-rose-50" onClick={() => void voidSale(sale)} aria-label="Estornar venda"><Trash2 className="h-4 w-4" /></button>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ) : (
              <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{row.description}</p>
                  <p className="mt-0.5 text-[13px] text-ink-muted"><span className="font-mono">{dayLabel(row.date)}</span> · {row.source}</p>
                </div>
                <span className={`font-mono text-base font-semibold ${row.type === 'in' ? 'text-emerald-800' : 'text-rose-800'}`}>{row.type === 'in' ? '+' : '-'}{formatBRL(row.amount)}</span>
                <div className="flex shrink-0 gap-1">
                  <button type="button" className="icon-button h-11 w-11" onClick={() => setViewingEntry({ description: row.description, amount: row.amount, date: row.date, source: row.source })} aria-label={`Ver detalhes de ${row.description}`}><Eye className="h-4 w-4" /></button>
                  <button type="button" className="icon-button h-11 w-11" onClick={() => setEditingEntry(row.raw)} aria-label={`Editar ${row.description}`}><Pencil className="h-4 w-4" /></button>
                  <button type="button" className="icon-button h-11 w-11 text-rose-700 hover:bg-rose-50" onClick={() => void handleDelete(row.id, row.description)} aria-label={`Excluir ${row.description}`}><Trash2 className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {viewingEntry && (
        <Dialog label="Detalhes do lançamento" onClose={() => setViewingEntry(null)}>
          <div className="dialog-panel w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-6">
            <h3 className="text-lg font-bold text-ink">Detalhes do lançamento</h3>
            <dl className="space-y-3 text-sm">
              <div><dt className="text-[13px] font-semibold text-ink-muted">Descrição</dt><dd className="font-medium text-ink">{viewingEntry.description}</dd></div>
              <div><dt className="text-[13px] font-semibold text-ink-muted">Valor</dt><dd className="font-mono font-bold text-ink">{formatBRL(viewingEntry.amount)}</dd></div>
              <div><dt className="text-[13px] font-semibold text-ink-muted">Data</dt><dd className="font-mono text-ink">{new Date(viewingEntry.date + 'T12:00:00').toLocaleDateString('pt-BR')}</dd></div>
              <div><dt className="text-[13px] font-semibold text-ink-muted">Origem</dt><dd className="text-ink">{viewingEntry.source}</dd></div>
              {viewingEntry.method && <div><dt className="text-[13px] font-semibold text-ink-muted">Forma de pagamento</dt><dd className="text-ink">{viewingEntry.method}</dd></div>}
            </dl>
            <button type="button" className="btn-primary min-h-[44px] w-full" onClick={() => setViewingEntry(null)}>Fechar</button>
          </div>
        </Dialog>
      )}
      {editingEntry && <EntryForm kind={editingEntry.kind} entry={editingEntry} onClose={() => setEditingEntry(null)} onSaved={() => { setEditingEntry(null); reload(); }} />}
      {editingSale && <SaleEditForm sale={editingSale} onClose={() => setEditingSale(null)} onSaved={() => { setEditingSale(null); reload(); }} />}

      <p className="flex items-start gap-2 text-xs text-ink-muted"><Landmark className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Entradas = pagamentos do salão + delivery pagos + contas recebidas. Saídas = contas pagas. O fundo de troco do turno não entra, porque não é venda.</p>
    </div>
  );
}

export function Empty({ text = 'Sem dados no período.' }: { text?: string }) {
  return <p className="py-10 text-center text-sm text-ink-muted">{text}</p>;
}

/** Corrige a forma de pagamento de uma venda já registrada (gerência, com motivo). */
function SaleEditForm({ sale, onClose, onSaved }: { sale: SaleRecord; onClose: () => void; onSaved: () => void }) {
  const { notify } = useFeedback();
  const [method, setMethod] = useState(sale.method);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (method === sale.method) { onClose(); return; }
    if (!reason.trim()) { notify('Informe o motivo da correção.', 'error'); return; }
    setBusy(true);
    try {
      await salesApi.adjust(sale, method, reason.trim());
      notify('Venda corrigida.', 'success');
      onSaved();
    } catch (error: unknown) {
      notify(error instanceof Error ? error.message : 'Não foi possível corrigir a venda.', 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog label="Corrigir venda" onClose={onClose} placement="sheet">
      <form onSubmit={submit} className="dialog-panel w-full max-w-md space-y-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Corrigir venda</h2>
            <p className="mt-0.5 text-sm text-ink-muted">{sale.channel === 'SALAO' ? 'Salão' : 'Delivery'} · {new Date(sale.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · <span className="tabular-nums">{formatBRL(sale.amount)}</span></p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
        <div>
          <label htmlFor="sale-method" className="text-sm">Forma de pagamento</label>
          <select id="sale-method" className="mt-1 w-full rounded-xl border px-3 py-2.5" value={method} onChange={(e) => setMethod(e.target.value)}>
            {SALE_METHODS[sale.channel].map((m) => <option key={m} value={m}>{METHOD_LABELS[m] ?? m}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="sale-reason" className="text-sm">Motivo</label>
          <input id="sale-reason" className="mt-1 w-full rounded-xl border px-3 py-2.5" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: cliente pagou em dinheiro, não PIX" />
        </div>
        <p className="text-xs text-ink-muted">O valor da venda não muda aqui: para tirar a venda do caixa, use Excluir. A correção fica registrada na auditoria.</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Salvando...' : 'Salvar correção'}</button>
        </div>
      </form>
    </Dialog>
  );
}