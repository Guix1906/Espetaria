import { useMemo } from 'react';
import { AlertCircle, Download } from 'lucide-react';
import { Chart, CHART_COLORS, baseOptions } from '../../components/charts/Chart';
import { formatBRL } from '../../lib/formatters';
import { MERCHANDISE_CATEGORIES, buildProfit, downloadCsv, type FinanceDataset } from '../../lib/financeData';
import { GroupingPicker, useGrouping, Empty } from './FinanceView';

/** Faturamento bruto → líquido → lucro do período, no total e por dia/semana/mês/ano. */
export function ProfitPanel({ data }: { data: FinanceDataset }) {
  const [grouping, setGrouping] = useGrouping(data);
  const { total, buckets, missingCost } = useMemo(() => buildProfit(data, grouping), [data, grouping]);
  const rows = buckets.filter((b) => b.gross || b.drivers || b.productCost || b.expenses);
  const exportCsv = () => downloadCsv(
    `resultado_${data.from}_${data.to}.csv`,
    ['Período', 'Bruto', 'Entregadores', 'Líquido', 'Custo dos produtos', 'Despesas', 'Lucro'],
    rows.map((b) => [b.label, b.gross, b.drivers, b.net, b.productCost, b.expenses, b.profit]),
  );

  const lines: { label: string; value: number; hint?: string; strong?: boolean; minus?: boolean }[] = [
    { label: 'Faturamento bruto', value: total.gross, hint: 'Tudo que os clientes pagaram: salão e delivery, com taxa de serviço e de entrega', strong: true },
    { label: 'Pagamento dos entregadores', value: total.drivers, hint: 'Calculado em Delivery → Pagamentos dos entregadores', minus: true },
    { label: 'Faturamento líquido', value: total.net, hint: 'O que fica para a casa', strong: true },
    { label: 'Custo dos produtos vendidos', value: total.productCost, hint: 'Custo cadastrado em cada produto × quantidade vendida', minus: true },
    { label: 'Despesas pagas', value: total.expenses, hint: `Contas a pagar quitadas (fora ${MERCHANDISE_CATEGORIES.join(' e ')})`, minus: true },
    { label: 'Lucro do período', value: total.profit, strong: true },
  ];

  return (
    <div className="space-y-6">
      {data.costsAvailable === false && (
        <p role="alert" className="notice border-amber-200 bg-amber-50 text-amber-900"><AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />O custo dos produtos ainda não está disponível: falta rodar a migração 00036 no Supabase. O lucro abaixo está sem o custo dos produtos.</p>
      )}

      <section aria-label="Resultado do período" className="surface-card divide-y divide-line">
        {lines.map((line) => (
          <div key={line.label} className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-5 ${line.strong ? 'bg-surface-muted/50' : ''}`}>
            <div className="min-w-0">
              <p className={line.strong ? 'font-semibold text-ink' : 'text-ink-secondary'}>{line.minus ? '− ' : line.label === 'Faturamento bruto' ? '' : '= '}{line.label}</p>
              {line.hint && <p className="text-[13px] text-ink-muted">{line.hint}</p>}
            </div>
            <p className={`font-mono ${line.strong ? 'text-xl font-bold' : 'text-base'} ${line.value < 0 ? 'text-rose-700' : line.minus ? 'text-ink-secondary' : 'text-ink'}`}>{formatBRL(line.value)}</p>
          </div>
        ))}
        <p className="px-4 py-3 text-[13px] text-ink-muted sm:px-5">
          Descontos dados nas mesas: <strong className="font-mono text-ink">{formatBRL(total.discounts)}</strong> (já fora do bruto).
          {total.merchandise > 0 && <> Compras de {MERCHANDISE_CATEGORIES.join(' e ').toLowerCase()} pagas: <strong className="font-mono text-ink">{formatBRL(total.merchandise)}</strong> (não descontadas de novo: entram pelo custo dos produtos).</>}
        </p>
      </section>

      {missingCost.length > 0 && (
        <p className="notice border-amber-200 bg-amber-50 text-amber-900">
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{missingCost.length} {missingCost.length === 1 ? 'produto vendido está' : 'produtos vendidos estão'} sem custo cadastrado e entraram com custo zero: {missingCost.slice(0, 8).join(', ')}{missingCost.length > 8 ? '…' : ''}. Cadastre em Cadastro de produtos → Editar → Custo.</span>
        </p>
      )}

      <section className="surface-card p-4 sm:p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Bruto, líquido e lucro</h2>
          <div className="flex flex-wrap items-center gap-2">
            <GroupingPicker value={grouping} onChange={setGrouping} />
            <button type="button" className="btn-secondary min-h-[44px]" onClick={exportCsv}><Download className="h-4 w-4" aria-hidden="true" />Exportar planilha</button>
          </div>
        </div>
        <Chart
          type="bar"
          height={300}
          series={[
            { name: 'Bruto', data: buckets.map((b) => +b.gross.toFixed(2)) },
            { name: 'Líquido', data: buckets.map((b) => +b.net.toFixed(2)) },
            { name: 'Lucro', data: buckets.map((b) => +b.profit.toFixed(2)) },
          ]}
          options={baseOptions({
            colors: [CHART_COLORS.palette[0], CHART_COLORS.balance, CHART_COLORS.inflow],
            plotOptions: { bar: { columnWidth: buckets.length > 20 ? '85%' : '60%', borderRadius: 2 } },
            xaxis: { categories: buckets.map((b) => b.label), tickAmount: Math.min(buckets.length, 12) },
          })}
        />
      </section>

      <section className="surface-card overflow-x-auto p-0">
        <table className="data-table">
          <thead><tr><th className="pl-4">Período</th><th className="text-right">Bruto</th><th className="text-right">Entregadores</th><th className="text-right">Líquido</th><th className="text-right">Custo produtos</th><th className="text-right">Despesas</th><th className="pr-4 text-right">Lucro</th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.key}>
                <td className="pl-4">{b.label}</td>
                <td className="text-right tabular-nums">{formatBRL(b.gross)}</td>
                <td className="text-right tabular-nums text-ink-muted">{b.drivers ? formatBRL(b.drivers) : '—'}</td>
                <td className="text-right font-medium tabular-nums">{formatBRL(b.net)}</td>
                <td className="text-right tabular-nums text-ink-muted">{b.productCost ? formatBRL(b.productCost) : '—'}</td>
                <td className="text-right tabular-nums text-ink-muted">{b.expenses ? formatBRL(b.expenses) : '—'}</td>
                <td className={`pr-4 text-right font-semibold tabular-nums ${b.profit < 0 ? 'text-rose-700' : 'text-emerald-800'}`}>{formatBRL(b.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty text="Nenhuma venda ou despesa no período." />}
      </section>
    </div>
  );
}
