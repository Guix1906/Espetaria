import { Suspense } from 'react';
import type { ApexOptions } from 'apexcharts';

// ApexCharts é pesado: só carrega quando uma tela com gráfico abre
import { lazyWithReload } from '../../lib/lazyWithReload';
const ReactApexChart = lazyWithReload(() => import('react-apexcharts'));

/** Cores do financeiro: barras escuras = realizado, barras claras = previsto. */
export const CHART_COLORS = {
  inflow: '#3F7A4E',
  outflow: '#9B2C2C',
  inflowForecast: '#B6D2BD',
  outflowForecast: '#E3AEAE',
  balance: '#2B211C',
  brand: '#B5502E',
  brandLight: '#E08A63',
  palette: ['#B5502E', '#2B211C', '#3F7A4E', '#C98A1B', '#E08A63', '#6B5D53', '#9B2C2C', '#A89A8C'],
};

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/** Base visual comum (fonte Jost, grade discreta, moeda em reais). */
export function baseOptions(extra: ApexOptions = {}, money = true): ApexOptions {
  return {
    chart: { fontFamily: 'Jost, sans-serif', toolbar: { show: false }, zoom: { enabled: false }, animations: { speed: 300 }, background: 'transparent', ...extra.chart },
    grid: { borderColor: '#E4DACB', strokeDashArray: 3, padding: { left: 4, right: 8 } },
    dataLabels: { enabled: false },
    legend: { position: 'top', horizontalAlign: 'left', fontSize: '13px', markers: { size: 6 }, itemMargin: { horizontal: 8 } },
    tooltip: { y: { formatter: (v: number) => (money ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : String(v)) } },
    xaxis: { labels: { style: { colors: '#6B5D53', fontSize: '11px' } }, axisBorder: { color: '#E4DACB' }, axisTicks: { color: '#E4DACB' }, ...extra.xaxis },
    yaxis: { labels: { style: { colors: '#6B5D53', fontSize: '11px' }, formatter: (v: number) => (money ? brl(v) : String(Math.round(v))) }, ...(extra.yaxis as object) },
    ...Object.fromEntries(Object.entries(extra).filter(([k]) => !['chart', 'xaxis', 'yaxis'].includes(k))),
  };
}

interface ChartProps {
  type: 'bar' | 'line' | 'area' | 'donut' | 'pie';
  series: ApexOptions['series'];
  options: ApexOptions;
  height?: number;
}

export function Chart({ type, series, options, height = 300 }: ChartProps) {
  return (
    <Suspense fallback={<div className="animate-none rounded bg-surface-muted" style={{ height }} aria-label="Carregando gráfico" />}>
      <ReactApexChart type={type} series={series} options={options} height={height} width="100%" />
    </Suspense>
  );
}
