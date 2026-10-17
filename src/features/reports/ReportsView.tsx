import { useMemo, useState } from 'react';
import { Download, Receipt, ShoppingBag, Users, UtensilsCrossed } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { FilterChip } from '../../components/ui/FilterChip';
import { StatCard } from '../../components/ui/StatCard';
import { PeriodPicker, defaultPeriod, type Period } from '../../components/ui/PeriodPicker';
import { Chart, CHART_COLORS, baseOptions } from '../../components/charts/Chart';
import { formatBRL } from '../../lib/formatters';
import { METHOD_LABELS, downloadCsv, sumBy, type FinanceDataset } from '../../lib/financeData';
import { useFinanceData } from '../finance/useFinanceData';
import { Empty } from '../finance/FinanceView';

type Section = 'sales' | 'products' | 'waiters' | 'delivery' | 'hours' | 'losses' | 'shifts';
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'sales', label: 'Vendas' }, { id: 'products', label: 'Produtos' }, { id: 'waiters', label: 'Garçons' },
  { id: 'delivery', label: 'Delivery' }, { id: 'hours', label: 'Horários' }, { id: 'losses', label: 'Cancelamentos e perdas' }, { id: 'shifts', label: 'Turnos' },
];
const SECTOR: Record<string, string> = { GRILL: 'Churrasqueira', KITCHEN: 'Cozinha', BAR: 'Bar', NONE: 'Outros' };
const STATUS: Record<string, string> = { CONFIRMED: 'Confirmado', PREPARING: 'Em preparo', READY: 'Pronto',OUT_FOR_DELIVERY: 'Em entrega', DELIVERED: 'Entregue', CANCELLED: 'Cancelado', PENDING: 'Pendente' };
const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const day = (iso: string) => new Date(iso).toLocaleDateString('sv-SE');

export function ReportsView() {
  const [period, setPeriod] = useState<Period>(() => defaultPeriod('30d'));
  const [section, setSection] = useState<Section>('sales');
  const { data, loading, error } = useFinanceData(period);

  return (
    <div className="page-layout">
      <PageHeader title="Relatórios" description="O que vendeu, quanto, quando, por quem e onde. Tudo com exportação para planilha." />
      <PeriodPicker value={period} onChange={setPeriod} presets={['today', '7d', '30d', 'month', 'last', '12m', 'year']} />
      <div className="filter-bar border-b border-line pb-2" aria-label="Relatórios">
        {SECTIONS.map((s) => <FilterChip key={s.id} active={section === s.id} onClick={() => setSection(s.id)}>{s.label}</FilterChip>)}
      </div>
      {error && <p role="alert" className="notice border-rose-200 bg-rose-50 text-rose-800">{error}</p>}
      {!data ? <div className="surface-card p-10 text-center text-sm text-ink-muted" role="status">{loading ? 'Carregando relatório...' : 'Sem dados.'}</div> : (
        <>
          {section === 'sales' && <Sales data={data} />}
          {section === 'products' && <Products data={data} />}
          {section === 'waiters' && <Waiters data={data} />}
          {section === 'delivery' && <Delivery data={data} />}
          {section === 'hours' && <Hours data={data} />}
          {section === 'losses' && <Losses data={data} />}
          {section === 'shifts' && <Shifts data={data} />}
        </>
      )}
    </div>
  );
}

function Card({ title, onExport, children }: { title: string; onExport?: () => void; children: React.ReactNode }) {
  return (
    <section className="surface-card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {onExport && <button type="button" className="btn-secondary h-10 px-3" onClick={onExport}><Download className="h-4 w-4" aria-hidden="true" />Exportar</button>}
      </div>
      {children}
    </section>
  );
}

function Table({ head, rows, align }: { head: string[]; rows: (string | number | JSX.Element)[][]; align?: ('l' | 'r')[] }) {
  if (rows.length === 0) return <Empty />;
  return (
    <div className="-mx-4 overflow-x-auto sm:-mx-5">
      <table className="data-table">
        <thead><tr>{head.map((h, i) => <th key={h} className={`${i === 0 ? 'pl-4 sm:pl-5' : ''} ${align?.[i] === 'r' ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={`${j === 0 ? 'pl-4 sm:pl-5' : ''} ${align?.[j] === 'r' ? 'text-right tabular-nums' : ''}`}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Sales({ data }: { data: FinanceDataset }) {
  const total = data.sales.reduce((s, x) => s + x.amount, 0);
  const salon = data.sales.filter((s) => s.channel === 'SALAO').reduce((s, x) => s + x.amount, 0);
  const delivery = data.sales.filter((s) => s.channel === 'DELIVERY').reduce((s, x) => s + x.amount, 0);
  const people = data.tabs.reduce((s, t) => s + t.people, 0);
  const tabsTotal = data.tabs.reduce((s, t) => s + t.total, 0);
  const serviceFee = data.tabs.reduce((s, t) => s + t.service_fee, 0);
  const discounts = data.tabs.reduce((s, t) => s + t.discount, 0);
  // Mesma regra do faturamento: só pedido com pagamento registrado (venda estornada sai do ticket)
  const deliveredOrders = data.deliveries.filter((d) => d.status !== 'CANCELLED' && d.paid);
  const byDay = useMemo(() => {
    const map = new Map<string, { salon: number; delivery: number }>();
    const cursor = new Date(`${data.from}T12:00:00`); const end = new Date(`${data.to}T12:00:00`);
    while (cursor <= end) { map.set(cursor.toLocaleDateString('sv-SE'), { salon: 0, delivery: 0 }); cursor.setDate(cursor.getDate() + 1); }
    data.sales.forEach((s) => { const row = map.get(day(s.at)); if (row) row[s.channel === 'SALAO' ? 'salon' : 'delivery'] += s.amount; });
    return [...map.entries()];
  }, [data]);
  const byMethod = sumBy(data.sales, (s) => METHOD_LABELS[s.method] ?? s.method, (s) => s.amount);

  return (
    <div className="space-y-6">
      <div className="stat-grid">
        <StatCard label="Faturamento" value={formatBRL(total)} hint={<>Salão {formatBRL(salon)} · Delivery {formatBRL(delivery)}</>} icon={Receipt} />
        <StatCard label="Ticket médio por mesa" value={formatBRL(data.tabs.length ? tabsTotal / data.tabs.length : 0)} hint={`${data.tabs.length} mesas fechadas`} icon={UtensilsCrossed} />
        <StatCard label="Ticket por pessoa" value={formatBRL(people ? tabsTotal / people : 0)} hint={`${people} pessoas atendidas`} icon={Users} />
        <StatCard label="Ticket médio delivery" value={formatBRL(deliveredOrders.length ? deliveredOrders.reduce((s, d) => s + d.total, 0) / deliveredOrders.length : 0)} hint={`${deliveredOrders.length} pedidos`} icon={ShoppingBag} />
      </div>
      <Card title="Faturamento por dia" onExport={() => downloadCsv(`vendas-por-dia_${data.from}_${data.to}.csv`, ['Dia', 'Salão', 'Delivery', 'Total'], byDay.map(([d, v]) => [new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR'), v.salon, v.delivery, v.salon + v.delivery]))}>
        <Chart type="bar" height={300} series={[{ name: 'Salão', data: byDay.map(([, v]) => +v.salon.toFixed(2)) }, { name: 'Delivery', data: byDay.map(([, v]) => +v.delivery.toFixed(2)) }]} options={baseOptions({ colors: [CHART_COLORS.balance, CHART_COLORS.brand], chart: { type: 'bar', stacked: true }, plotOptions: { bar: { columnWidth: byDay.length > 20 ? '80%' : '50%', borderRadius: 2 } }, xaxis: { categories: byDay.map(([d]) => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })), tickAmount: Math.min(byDay.length, 12) } })} />
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Por forma de pagamento">
          <Table head={['Forma', 'Valor', '%']} align={['l', 'r', 'r']} rows={byMethod.map((m) => [m.name, formatBRL(m.total), total ? `${((m.total / total) * 100).toFixed(1)}%` : '—'])} />
        </Card>
        <Card title="Composição das mesas fechadas">
          <Table head={['Item', 'Valor']} align={['l', 'r']} rows={[['Total das mesas', formatBRL(tabsTotal)], ['Taxa de serviço', formatBRL(serviceFee)], ['Descontos concedidos', formatBRL(discounts)], ['Delivery: taxas de entrega', formatBRL(deliveredOrders.reduce((s, d) => s + d.fee, 0))]]} />
        </Card>
      </div>
    </div>
  );
}

function Products({ data }: { data: FinanceDataset }) {
  const [sector, setSector] = useState('ALL');
  const valid = data.items.filter((i) => !i.cancelled && (sector === 'ALL' || i.sector === sector));
  const rows = useMemo(() => {
    const map = new Map<string, { qty: number; total: number; salon: number; delivery: number; sector: string }>();
    valid.forEach((i) => { const r = map.get(i.product_name) ?? { qty: 0, total: 0, salon: 0, delivery: 0, sector: i.sector }; r.qty += i.quantity; r.total += i.total; r[i.channel === 'SALAO' ? 'salon' : 'delivery'] += i.quantity; map.set(i.product_name, r); });
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [valid]);
  const grand = rows.reduce((s, [, r]) => s + r.total, 0);
  const bySector = sumBy(data.items.filter((i) => !i.cancelled), (i) => SECTOR[i.sector] ?? i.sector, (i) => i.total);
  const top = rows.slice(0, 12);
  return (
    <div className="space-y-6">
      <div className="filter-bar">{['ALL', 'GRILL', 'KITCHEN', 'BAR'].map((s) => <FilterChip key={s} active={sector === s} onClick={() => setSector(s)}>{s === 'ALL' ? 'Todos' : SECTOR[s]}</FilterChip>)}</div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><Card title="Mais vendidos (faturamento)">
          {top.length ? <Chart type="bar" height={Math.max(220, top.length * 30)} series={[{ name: 'Faturamento', data: top.map(([, r]) => +r.total.toFixed(2)) }]} options={baseOptions({ colors: [CHART_COLORS.brand], plotOptions: { bar: { horizontal: true, borderRadius: 2, barHeight: '65%' } }, xaxis: { categories: top.map(([n]) => n) } })} /> : <Empty />}
        </Card></div>
        <Card title="Por setor">
          {bySector.length ? <Chart type="donut" height={260} series={bySector.map((s) => +s.total.toFixed(2))} options={baseOptions({ labels: bySector.map((s) => s.name), colors: CHART_COLORS.palette, legend: { position: 'bottom' } })} /> : <Empty />}
        </Card>
      </div>
      <Card title="Todos os produtos" onExport={() => downloadCsv(`produtos_${data.from}_${data.to}.csv`, ['Produto', 'Setor', 'Qtd. total', 'Qtd. salão', 'Qtd. delivery', 'Faturamento', '% do total'], rows.map(([n, r]) => [n, SECTOR[r.sector] ?? r.sector, r.qty, r.salon, r.delivery, r.total, grand ? +((r.total / grand) * 100).toFixed(1) : 0]))}>
        <Table head={['Produto', 'Qtd.', 'Salão', 'Delivery', 'Faturamento', '%']} align={['l', 'r', 'r', 'r', 'r', 'r']} rows={rows.map(([n, r]) => [n, r.qty, r.salon, r.delivery, formatBRL(r.total), grand ? `${((r.total / grand) * 100).toFixed(1)}%` : '—'])} />
      </Card>
    </div>
  );
}

function Waiters({ data }: { data: FinanceDataset }) {
  const rows = useMemo(() => {
    const map = new Map<string, { items: number; total: number; espetos: number; cancelled: number }>();
    data.items.filter((i) => i.channel === 'SALAO').forEach((i) => {
      const name = (i.waiter_id && data.staff[i.waiter_id]) || 'Não identificado';
      const r = map.get(name) ?? { items: 0, total: 0, espetos: 0, cancelled: 0 };
      if (i.cancelled) r.cancelled += i.quantity; else { r.items += i.quantity; r.total += i.total; if (i.sector === 'GRILL') r.espetos += i.quantity; }
      map.set(name, r);
    });
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [data]);
  return (
    <div className="space-y-6">
      <Card title="Vendas lançadas por garçom">
        {rows.length ? <Chart type="bar" height={Math.max(200, rows.length * 44)} series={[{ name: 'Vendido', data: rows.map(([, r]) => +r.total.toFixed(2)) }]} options={baseOptions({ colors: [CHART_COLORS.balance], plotOptions: { bar: { horizontal: true, borderRadius: 2, barHeight: '55%' } }, xaxis: { categories: rows.map(([n]) => n) } })} /> : <Empty />}
      </Card>
      <Card title="Detalhe" onExport={() => downloadCsv(`garcons_${data.from}_${data.to}.csv`, ['Garçom', 'Itens', 'Espetos', 'Vendido', 'Itens cancelados'], rows.map(([n, r]) => [n, r.items, r.espetos, r.total, r.cancelled]))}>
        <Table head={['Garçom', 'Itens', 'Espetos', 'Vendido', 'Cancelados']} align={['l', 'r', 'r', 'r', 'r']} rows={rows.map(([n, r]) => [n, r.items, r.espetos, formatBRL(r.total), r.cancelled])} />
        <p className="mt-3 text-xs text-ink-muted">Valor dos itens lançados por cada um (sem taxa de serviço). A taxa de 10% de cada mesa está em Vendas → Composição.</p>
      </Card>
    </div>
  );
}

function Delivery({ data }: { data: FinanceDataset }) {
  const valid = data.deliveries.filter((d) => d.status !== 'CANCELLED');
  const hoods = useMemo(() => {
    const map = new Map<string, { orders: number; total: number; fees: number }>();
    valid.forEach((d) => { const r = map.get(d.neighborhood) ?? { orders: 0, total: 0, fees: 0 }; r.orders += 1; r.total += d.total; r.fees += d.fee; map.set(d.neighborhood, r); });
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [valid]);
  const status = sumBy(data.deliveries, (d) => STATUS[d.status] ?? d.status, () => 1);
  const unpaid = valid.filter((d) => !d.paid);
  return (
    <div className="space-y-6">
      <div className="stat-grid">
        <StatCard label="Pedidos" value={valid.length} hint={`${data.deliveries.length - valid.length} cancelados`} icon={ShoppingBag} />
        <StatCard label="Faturamento" value={formatBRL(valid.reduce((s, d) => s + d.total, 0))} hint={`Taxas: ${formatBRL(valid.reduce((s, d) => s + d.fee, 0))}`} icon={Receipt} />
        <StatCard label="A receber" value={formatBRL(unpaid.reduce((s, d) => s + d.total, 0))} hint={`${unpaid.length} pedidos sem baixa de pagamento`} icon={Receipt} />
        <StatCard label="Bairros atendidos" value={hoods.length} hint={hoods[0] ? `Mais pedidos: ${hoods[0][0]}` : '—'} icon={Users} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><Card title="Faturamento por bairro">
          {hoods.length ? <Chart type="bar" height={Math.max(220, Math.min(hoods.length, 15) * 30)} series={[{ name: 'Faturamento', data: hoods.slice(0, 15).map(([, r]) => +r.total.toFixed(2)) }]} options={baseOptions({ colors: [CHART_COLORS.brand], plotOptions: { bar: { horizontal: true, borderRadius: 2, barHeight: '65%' } }, xaxis: { categories: hoods.slice(0, 15).map(([n]) => n) } })} /> : <Empty />}
        </Card></div>
        <Card title="Situação dos pedidos">
          {status.length ? <Chart type="donut" height={260} series={status.map((s) => s.total)} options={baseOptions({ labels: status.map((s) => s.name), colors: CHART_COLORS.palette, legend: { position: 'bottom' }, tooltip: { y: { formatter: (v: number) => `${v} pedidos` } } }, false)} /> : <Empty />}
        </Card>
      </div>
      <Card title="Bairros" onExport={() => downloadCsv(`delivery-bairros_${data.from}_${data.to}.csv`, ['Bairro', 'Pedidos', 'Faturamento', 'Taxas de entrega', 'Ticket médio'], hoods.map(([n, r]) => [n, r.orders, r.total, r.fees, +(r.total / r.orders).toFixed(2)]))}>
        <Table head={['Bairro', 'Pedidos', 'Faturamento', 'Taxas', 'Ticket médio']} align={['l', 'r', 'r', 'r', 'r']} rows={hoods.map(([n, r]) => [n, r.orders, formatBRL(r.total), formatBRL(r.fees), formatBRL(r.total / r.orders)])} />
      </Card>
    </div>
  );
}

function Hours({ data }: { data: FinanceDataset }) {
  const hours = useMemo(() => {
    const items = Array.from({ length: 24 }, () => 0);
    const money = Array.from({ length: 24 }, () => 0);
    data.items.filter((i) => !i.cancelled).forEach((i) => { const h = new Date(i.at).getHours(); items[h] = (items[h] ?? 0) + i.quantity; money[h] = (money[h] ?? 0) + i.total; });
    const first = items.findIndex((v) => v > 0); const last = 23 - [...items].reverse().findIndex((v) => v > 0);
    const range = first === -1 ? [] : Array.from({ length: last - first + 1 }, (_, k) => first + k);
    return range.map((h) => ({ h, items: items[h]!, money: money[h]! }));
  }, [data]);
  const weekdays = useMemo(() => {
    const names = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const totals = Array.from({ length: 7 }, () => 0);
    data.sales.forEach((s) => { const d = new Date(s.at).getDay(); totals[d] = (totals[d] ?? 0) + s.amount; });
    return names.map((n, i) => ({ n, v: totals[i]! }));
  }, [data]);
  const peak = [...hours].sort((a, b) => b.money - a.money)[0];
  return (
    <div className="space-y-6">
      <Card title={peak ? `Movimento por horário · pico às ${peak.h}h` : 'Movimento por horário'} onExport={() => downloadCsv(`horarios_${data.from}_${data.to}.csv`, ['Hora', 'Itens', 'Valor'], hours.map((r) => [`${r.h}h`, r.items, r.money]))}>
        {hours.length ? <Chart type="bar" height={300} series={[{ name: 'Valor vendido', data: hours.map((r) => +r.money.toFixed(2)) }]} options={baseOptions({ colors: [CHART_COLORS.brand], plotOptions: { bar: { columnWidth: '60%', borderRadius: 2 } }, xaxis: { categories: hours.map((r) => `${r.h}h`) } })} /> : <Empty />}
      </Card>
      <Card title="Faturamento por dia da semana">
        <Chart type="bar" height={260} series={[{ name: 'Faturamento', data: weekdays.map((w) => +w.v.toFixed(2)) }]} options={baseOptions({ colors: [CHART_COLORS.balance], plotOptions: { bar: { columnWidth: '50%', borderRadius: 2 } }, xaxis: { categories: weekdays.map((w) => w.n) } })} />
      </Card>
    </div>
  );
}

function Losses({ data }: { data: FinanceDataset }) {
  const cancelled = data.items.filter((i) => i.cancelled);
  const losses = data.losses.filter((l) => l.type !== 'CANCELAMENTO_RETORNO');
  const byProduct = sumBy(cancelled, (i) => i.product_name, (i) => i.total).slice(0, 10);
  const label: Record<string, string> = { PERDA: 'Perda', DESCARTE: 'Descarte' };
  return (
    <div className="space-y-6">
      <div className="stat-grid stat-grid--three">
        <StatCard label="Itens cancelados" value={cancelled.reduce((s, i) => s + i.quantity, 0)} hint={formatBRL(cancelled.reduce((s, i) => s + i.total, 0))} icon={Receipt} />
        <StatCard label="Perdas e descartes" value={losses.reduce((s, l) => s + l.quantity, 0)} hint={`${losses.length} registros`} icon={UtensilsCrossed} />
        <StatCard label="Voltaram ao estoque" value={data.losses.filter((l) => l.type === 'CANCELAMENTO_RETORNO').reduce((s, l) => s + l.quantity, 0)} hint="Cancelados antes do preparo" icon={ShoppingBag} />
      </div>
      <Card title="Cancelamentos por produto (valor)">
        {byProduct.length ? <Chart type="bar" height={Math.max(200, byProduct.length * 30)} series={[{ name: 'Cancelado', data: byProduct.map((b) => +b.total.toFixed(2)) }]} options={baseOptions({ colors: [CHART_COLORS.outflow], plotOptions: { bar: { horizontal: true, borderRadius: 2, barHeight: '60%' } }, xaxis: { categories: byProduct.map((b) => b.name) } })} /> : <Empty text="Nenhum cancelamento no período." />}
      </Card>
      <Card title="Perdas e descartes" onExport={() => downloadCsv(`perdas_${data.from}_${data.to}.csv`, ['Data', 'Produto', 'Tipo', 'Quantidade', 'Motivo'], losses.map((l) => [fmt(l.at), l.product_name, label[l.type] ?? l.type, l.quantity, l.reason ?? '']))}>
        <Table head={['Data', 'Produto', 'Tipo', 'Qtd.', 'Motivo']} align={['l', 'l', 'l', 'r', 'l']} rows={losses.map((l) => [fmt(l.at), l.product_name, label[l.type] ?? l.type, l.quantity, l.reason ?? '—'])} />
      </Card>
    </div>
  );
}

function Shifts({ data }: { data: FinanceDataset }) {
  const rows = data.shifts.map((s) => {
    const sold = data.sales.filter((x) => x.at >= s.opened_at && (!s.closed_at || x.at <= s.closed_at));
    const cash = sold.filter((x) => x.method === 'DINHEIRO').reduce((sum, x) => sum + x.amount, 0);
    const expected = s.cash_start + cash;
    return { s, total: sold.reduce((sum, x) => sum + x.amount, 0), expected, diff: s.cash_end == null ? null : s.cash_end - expected };
  });
  return (
    <Card title="Turnos e conferência do caixa" onExport={() => downloadCsv(`turnos_${data.from}_${data.to}.csv`, ['Turno', 'Abertura', 'Fechamento', 'Faturamento', 'Fundo de troco', 'Dinheiro esperado', 'Dinheiro contado', 'Diferença'], rows.map((r) => [r.s.name, fmt(r.s.opened_at), r.s.closed_at ? fmt(r.s.closed_at) : 'Aberto', r.total, r.s.cash_start, r.expected, r.s.cash_end ?? '', r.diff ?? '']))}>
      <Table head={['Turno', 'Abertura', 'Faturamento', 'Esperado na gaveta', 'Contado', 'Diferença']} align={['l', 'l', 'r', 'r', 'r', 'r']} rows={rows.map((r) => [r.s.name, fmt(r.s.opened_at), formatBRL(r.total), formatBRL(r.expected), r.s.cash_end == null ? (r.s.status === 'ABERTO' ? 'Aberto' : '—') : formatBRL(r.s.cash_end), r.diff == null ? '—' : <span className={Math.abs(r.diff) < 0.01 ? 'text-emerald-800' : 'font-medium text-rose-700'}>{r.diff > 0 ? '+' : ''}{formatBRL(r.diff)}</span>])} />
      <p className="mt-3 text-xs text-ink-muted">Esperado na gaveta = fundo de troco + vendas em dinheiro do turno.</p>
    </Card>
  );
}
