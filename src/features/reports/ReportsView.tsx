import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, Download } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { FilterChip } from '../../components/ui/FilterChip';
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
const STATUS: Record<string, string> = { CONFIRMED: 'Confirmado', PREPARING: 'Em preparo', READY: 'Pronto', OUT_FOR_DELIVERY: 'Em entrega', DELIVERED: 'Entregue', CANCELLED: 'Cancelado', PENDING: 'Pendente', AWAITING_PAYMENT: 'Aguardando PIX' };
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

/* ---------- peças comuns: uma faixa de resumo, blocos sem caixa, detalhes recolhidos ---------- */

/** Até 3 números numa faixa só, com uma linha de detalhe embaixo. */
function Summary({ items, footer }: { items: { label: string; value: ReactNode; hint?: ReactNode }[]; footer?: ReactNode }) {
  return (
    <section aria-label="Resumo" className="surface-card">
      <div className={`grid grid-cols-1 divide-y divide-line sm:divide-x sm:divide-y-0 ${items.length === 3 ? 'sm:grid-cols-3' : items.length === 2 ? 'sm:grid-cols-2' : ''}`}>
        {items.map((it) => (
          <div key={it.label} className="p-4 sm:p-5">
            <p className="text-sm text-ink-muted">{it.label}</p>
            <p className="mt-1 font-mono text-2xl font-bold text-ink">{it.value}</p>
            {it.hint && <p className="mt-0.5 text-[13px] text-ink-muted">{it.hint}</p>}
          </div>
        ))}
      </div>
      {footer && <p className="border-t border-line px-4 py-3 text-sm text-ink-secondary sm:px-5">{footer}</p>}
    </section>
  );
}

/** Bloco com título e exportação, sem caixa em volta. */
function Block({ title, onExport, children }: { title: string; onExport?: () => void; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {onExport && <button type="button" className="btn-secondary min-h-[44px] px-3" onClick={onExport}><Download className="h-4 w-4" aria-hidden="true" />Exportar</button>}
      </div>
      {children}
    </section>
  );
}

/** Detalhe extra, recolhido até tocar. */
function More({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group border-t border-line pt-3">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 text-[15px] font-semibold text-brand-700 [&::-webkit-details-marker]:hidden">
        {title}<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="mt-3 space-y-6">{children}</div>
    </details>
  );
}

/** Divisão em uma barra só + lista com valor e %, no lugar do gráfico de rosca. */
function SplitBar({ parts, unit = 'money' }: { parts: { name: string; total: number }[]; unit?: 'money' | 'count' }) {
  const list = [...parts].filter((p) => p.total > 0).sort((a, b) => b.total - a.total);
  const total = list.reduce((s, p) => s + p.total, 0);
  if (!total) return <Empty />;
  const color = (i: number) => CHART_COLORS.palette[i % CHART_COLORS.palette.length];
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-sm bg-surface-muted" aria-hidden="true">
        {list.map((p, i) => <span key={p.name} style={{ width: `${(p.total / total) * 100}%`, background: color(i) }} />)}
      </div>
      <ul className="mt-3 divide-y divide-line">
        {list.map((p, i) => (
          <li key={p.name} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="flex items-center gap-2 text-ink"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color(i) }} aria-hidden="true" />{p.name}</span>
            <span className="font-mono font-semibold text-ink">{unit === 'money' ? formatBRL(p.total) : p.total} <span className="font-normal text-ink-muted">{((p.total / total) * 100).toFixed(0)}%</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Table({ head, rows, align }: { head: string[]; rows: (string | number | JSX.Element)[][]; align?: ('l' | 'r')[] }) {
  if (rows.length === 0) return <Empty />;
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="data-table">
        <thead><tr>{head.map((h, i) => <th key={h} className={`${i === 0 ? 'pl-4' : ''} ${align?.[i] === 'r' ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={`${j === 0 ? 'pl-4' : ''} ${align?.[j] === 'r' ? 'text-right font-mono' : ''}`}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

const hBar = (names: string[], values: number[], color: string, name: string) => (
  <Chart type="bar" height={Math.max(200, names.length * 32)} series={[{ name, data: values.map((v) => +v.toFixed(2)) }]} options={baseOptions({ colors: [color], plotOptions: { bar: { horizontal: true, borderRadius: 2, barHeight: '60%' } }, xaxis: { categories: names } })} />
);

/* ---------- seções ---------- */

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
  const deliveryTotal = deliveredOrders.reduce((s, d) => s + d.total, 0);
  const orders = data.tabs.length + deliveredOrders.length;
  const byDay = useMemo(() => {
    const map = new Map<string, { salon: number; delivery: number }>();
    const cursor = new Date(`${data.from}T12:00:00`); const end = new Date(`${data.to}T12:00:00`);
    while (cursor <= end) { map.set(cursor.toLocaleDateString('sv-SE'), { salon: 0, delivery: 0 }); cursor.setDate(cursor.getDate() + 1); }
    data.sales.forEach((s) => { const row = map.get(day(s.at)); if (row) row[s.channel === 'SALAO' ? 'salon' : 'delivery'] += s.amount; });
    return [...map.entries()];
  }, [data]);
  const byMethod = sumBy(data.sales, (s) => METHOD_LABELS[s.method] ?? s.method, (s) => s.amount);

  return (
    <div className="space-y-8">
      <Summary
        items={[
          { label: 'Faturamento', value: formatBRL(total), hint: <>Salão {formatBRL(salon)} · Delivery {formatBRL(delivery)}</> },
          { label: 'Pedidos', value: orders, hint: `${data.tabs.length} mesas · ${deliveredOrders.length} delivery` },
          { label: 'Ticket médio', value: formatBRL(orders ? (tabsTotal + deliveryTotal) / orders : 0), hint: 'Mesas e delivery juntos' },
        ]}
        footer={<>Por mesa <strong className="font-mono text-ink">{formatBRL(data.tabs.length ? tabsTotal / data.tabs.length : 0)}</strong><span className="mx-2 text-ink-muted" aria-hidden="true">·</span>Por pessoa <strong className="font-mono text-ink">{formatBRL(people ? tabsTotal / people : 0)}</strong><span className="mx-2 text-ink-muted" aria-hidden="true">·</span>Delivery <strong className="font-mono text-ink">{formatBRL(deliveredOrders.length ? deliveryTotal / deliveredOrders.length : 0)}</strong></>}
      />
      <Block title="Faturamento por dia" onExport={() => downloadCsv(`vendas-por-dia_${data.from}_${data.to}.csv`, ['Dia', 'Salão', 'Delivery', 'Total'], byDay.map(([d, v]) => [new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR'), v.salon, v.delivery, v.salon + v.delivery]))}>
        <Chart type="bar" height={300} series={[{ name: 'Salão', data: byDay.map(([, v]) => +v.salon.toFixed(2)) }, { name: 'Delivery', data: byDay.map(([, v]) => +v.delivery.toFixed(2)) }]} options={baseOptions({ colors: [CHART_COLORS.balance, CHART_COLORS.brand], chart: { type: 'bar', stacked: true }, plotOptions: { bar: { columnWidth: byDay.length > 20 ? '80%' : '50%', borderRadius: 2 } }, xaxis: { categories: byDay.map(([d]) => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })), tickAmount: Math.min(byDay.length, 12) } })} />
      </Block>
      <div className="grid gap-8 lg:grid-cols-2">
        <Block title="Por forma de pagamento"><SplitBar parts={byMethod} /></Block>
        <Block title="Composição das mesas fechadas">
          <dl className="divide-y divide-line text-sm">
            {([['Total das mesas', tabsTotal], ['Taxa de serviço', serviceFee], ['Descontos concedidos', discounts], ['Delivery: taxas de entrega', deliveredOrders.reduce((s, d) => s + d.fee, 0)]] as const).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 py-2"><dt className="text-ink-secondary">{k}</dt><dd className="font-mono font-semibold text-ink">{formatBRL(v)}</dd></div>
            ))}
          </dl>
        </Block>
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
  const top = rows.slice(0, 10);
  return (
    <div className="space-y-8">
      <div className="filter-bar">{['ALL', 'GRILL', 'KITCHEN', 'BAR'].map((s) => <FilterChip key={s} active={sector === s} onClick={() => setSector(s)}>{s === 'ALL' ? 'Todos' : SECTOR[s]}</FilterChip>)}</div>
      <Block title="Mais vendidos (faturamento)">
        {top.length ? hBar(top.map(([n]) => n), top.map(([, r]) => r.total), CHART_COLORS.brand, 'Faturamento') : <Empty />}
      </Block>
      <Block title="Todos os produtos" onExport={() => downloadCsv(`produtos_${data.from}_${data.to}.csv`, ['Produto', 'Setor', 'Qtd. total', 'Qtd. salão', 'Qtd. delivery', 'Faturamento', '% do total'], rows.map(([n, r]) => [n, SECTOR[r.sector] ?? r.sector, r.qty, r.salon, r.delivery, r.total, grand ? +((r.total / grand) * 100).toFixed(1) : 0]))}>
        <Table head={['Produto', 'Qtd.', 'Salão', 'Delivery', 'Faturamento', '%']} align={['l', 'r', 'r', 'r', 'r', 'r']} rows={rows.map(([n, r]) => [n, r.qty, r.salon, r.delivery, formatBRL(r.total), grand ? `${((r.total / grand) * 100).toFixed(1)}%` : '—'])} />
      </Block>
      <More title="Ver faturamento por setor">
        <SplitBar parts={bySector} />
      </More>
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
    <div className="space-y-8">
      <Block title="Vendas lançadas por garçom">
        {rows.length ? hBar(rows.map(([n]) => n), rows.map(([, r]) => r.total), CHART_COLORS.balance, 'Vendido') : <Empty />}
      </Block>
      <Block title="Detalhe" onExport={() => downloadCsv(`garcons_${data.from}_${data.to}.csv`, ['Garçom', 'Itens', 'Espetos', 'Vendido', 'Itens cancelados'], rows.map(([n, r]) => [n, r.items, r.espetos, r.total, r.cancelled]))}>
        <Table head={['Garçom', 'Itens', 'Espetos', 'Vendido', 'Cancelados']} align={['l', 'r', 'r', 'r', 'r']} rows={rows.map(([n, r]) => [n, r.items, r.espetos, formatBRL(r.total), r.cancelled])} />
        <p className="mt-2 text-[13px] text-ink-muted">Valor dos itens lançados por cada um (sem taxa de serviço). A taxa de cada mesa está em Vendas → Composição.</p>
      </Block>
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
  const revenue = valid.reduce((s, d) => s + d.total, 0);
  const top = hoods.slice(0, 10);
  return (
    <div className="space-y-8">
      <Summary
        items={[
          { label: 'Pedidos', value: valid.length, hint: `${data.deliveries.length - valid.length} cancelados` },
          { label: 'Faturamento', value: formatBRL(revenue), hint: `Taxas de entrega ${formatBRL(valid.reduce((s, d) => s + d.fee, 0))}` },
          { label: 'Ticket médio', value: formatBRL(valid.length ? revenue / valid.length : 0), hint: hoods[0] ? `Mais pedidos: ${hoods[0][0]}` : undefined },
        ]}
        footer={<>A receber <strong className="font-mono text-ink">{formatBRL(unpaid.reduce((s, d) => s + d.total, 0))}</strong> ({unpaid.length} sem baixa)<span className="mx-2 text-ink-muted" aria-hidden="true">·</span>{hoods.length} {hoods.length === 1 ? 'bairro atendido' : 'bairros atendidos'}</>}
      />
      <Block title="Faturamento por bairro">
        {top.length ? hBar(top.map(([n]) => n), top.map(([, r]) => r.total), CHART_COLORS.brand, 'Faturamento') : <Empty />}
      </Block>
      <More title="Ver todos os bairros e a situação dos pedidos">
        <Block title="Bairros" onExport={() => downloadCsv(`delivery-bairros_${data.from}_${data.to}.csv`, ['Bairro', 'Pedidos', 'Faturamento', 'Taxas de entrega', 'Ticket médio'], hoods.map(([n, r]) => [n, r.orders, r.total, r.fees, +(r.total / r.orders).toFixed(2)]))}>
          <Table head={['Bairro', 'Pedidos', 'Faturamento', 'Taxas', 'Ticket médio']} align={['l', 'r', 'r', 'r', 'r']} rows={hoods.map(([n, r]) => [n, r.orders, formatBRL(r.total), formatBRL(r.fees), formatBRL(r.total / r.orders)])} />
        </Block>
        <Block title="Situação dos pedidos"><SplitBar parts={status} unit="count" /></Block>
      </More>
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
  const bestDay = [...weekdays].sort((a, b) => b.v - a.v)[0];
  return (
    <div className="space-y-8">
      <Block title={peak ? `Movimento por horário · pico às ${peak.h}h` : 'Movimento por horário'} onExport={() => downloadCsv(`horarios_${data.from}_${data.to}.csv`, ['Hora', 'Itens', 'Valor'], hours.map((r) => [`${r.h}h`, r.items, r.money]))}>
        {hours.length ? <Chart type="bar" height={300} series={[{ name: 'Valor vendido', data: hours.map((r) => +r.money.toFixed(2)) }]} options={baseOptions({ colors: [CHART_COLORS.brand], plotOptions: { bar: { columnWidth: '60%', borderRadius: 2 } }, xaxis: { categories: hours.map((r) => `${r.h}h`) } })} /> : <Empty />}
      </Block>
      <More title={bestDay && bestDay.v > 0 ? `Ver por dia da semana · melhor dia: ${bestDay.n}` : 'Ver por dia da semana'}>
        <Chart type="bar" height={260} series={[{ name: 'Faturamento', data: weekdays.map((w) => +w.v.toFixed(2)) }]} options={baseOptions({ colors: [CHART_COLORS.balance], plotOptions: { bar: { columnWidth: '50%', borderRadius: 2 } }, xaxis: { categories: weekdays.map((w) => w.n) } })} />
      </More>
    </div>
  );
}

function Losses({ data }: { data: FinanceDataset }) {
  const cancelled = data.items.filter((i) => i.cancelled);
  const losses = data.losses.filter((l) => l.type !== 'CANCELAMENTO_RETORNO');
  const returned = data.losses.filter((l) => l.type === 'CANCELAMENTO_RETORNO').reduce((s, l) => s + l.quantity, 0);
  const byProduct = sumBy(cancelled, (i) => i.product_name, (i) => i.total).slice(0, 10);
  const label: Record<string, string> = { PERDA: 'Perda', DESCARTE: 'Descarte' };
  const cancelledQty = cancelled.reduce((s, i) => s + i.quantity, 0);
  const lossQty = losses.reduce((s, l) => s + l.quantity, 0);

  // Sem nada para mostrar: uma frase, sem quadros zerados
  if (!cancelledQty && !lossQty && !returned) return <p className="surface-card p-8 text-center text-sm text-ink-muted">Nenhum cancelamento, perda ou descarte no período.</p>;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        {cancelledQty > 0 && <p className="notice border-rose-200 bg-rose-50 text-rose-800"><strong className="font-mono">{cancelledQty}</strong> {cancelledQty === 1 ? 'item cancelado' : 'itens cancelados'}, somando <strong className="font-mono">{formatBRL(cancelled.reduce((s, i) => s + i.total, 0))}</strong>.</p>}
        {lossQty > 0 && <p className="notice border-amber-200 bg-amber-50 text-amber-900"><strong className="font-mono">{lossQty}</strong> em perdas e descartes ({losses.length} {losses.length === 1 ? 'registro' : 'registros'}).</p>}
        {returned > 0 && <p className="text-sm text-ink-secondary"><strong className="font-mono">{returned}</strong> {returned === 1 ? 'item voltou' : 'itens voltaram'} ao estoque (cancelados antes do preparo).</p>}
      </div>
      {byProduct.length > 0 && <Block title="Cancelamentos por produto (valor)">{hBar(byProduct.map((b) => b.name), byProduct.map((b) => b.total), CHART_COLORS.outflow, 'Cancelado')}</Block>}
      {losses.length > 0 && (
        <Block title="Perdas e descartes" onExport={() => downloadCsv(`perdas_${data.from}_${data.to}.csv`, ['Data', 'Produto', 'Tipo', 'Quantidade', 'Motivo'], losses.map((l) => [fmt(l.at), l.product_name, label[l.type] ?? l.type, l.quantity, l.reason ?? '']))}>
          <Table head={['Data', 'Produto', 'Tipo', 'Qtd.', 'Motivo']} align={['l', 'l', 'l', 'r', 'l']} rows={losses.map((l) => [fmt(l.at), l.product_name, label[l.type] ?? l.type, l.quantity, l.reason ?? '—'])} />
        </Block>
      )}
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
    <Block title="Turnos e conferência do caixa" onExport={() => downloadCsv(`turnos_${data.from}_${data.to}.csv`, ['Turno', 'Abertura', 'Fechamento', 'Faturamento', 'Fundo de troco', 'Dinheiro esperado', 'Dinheiro contado', 'Diferença'], rows.map((r) => [r.s.name, fmt(r.s.opened_at), r.s.closed_at ? fmt(r.s.closed_at) : 'Aberto', r.total, r.s.cash_start, r.expected, r.s.cash_end ?? '', r.diff ?? '']))}>
      <Table head={['Turno', 'Abertura', 'Faturamento', 'Esperado na gaveta', 'Contado', 'Diferença']} align={['l', 'l', 'r', 'r', 'r', 'r']} rows={rows.map((r) => [r.s.name, fmt(r.s.opened_at), formatBRL(r.total), formatBRL(r.expected), r.s.cash_end == null ? (r.s.status === 'ABERTO' ? 'Aberto' : '—') : formatBRL(r.s.cash_end), r.diff == null ? '—' : <span className={Math.abs(r.diff) < 0.01 ? 'text-emerald-800' : 'font-medium text-rose-700'}>{r.diff > 0 ? '+' : ''}{formatBRL(r.diff)}</span>])} />
      <p className="mt-2 text-[13px] text-ink-muted">Esperado na gaveta = fundo de troco + vendas em dinheiro do turno.</p>
    </Block>
  );
}
