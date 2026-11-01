import { Download, MessageSquare, TrendingUp } from 'lucide-react';
import { formatBRL } from '../../lib/formatters';
import { isSupabaseConfigured } from '../../lib/supabase';
import { useDeliveryStore } from '../../stores/useDeliveryStore';
import { usePrintStore } from '../../stores/usePrintStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useStockStore } from '../../stores/useStockStore';
import { useTableStore } from '../../stores/useTableStore';
import { computeDashboard } from '../admin/dashboardMetrics';

/** Faturamento do turno aberto, com resumo no WhatsApp e planilha. Saiu da Visão geral, que mostra só a operação. */
export function ShiftSummaryCard() {
  const { currentShift } = useShiftStore();
  const { tables, tabs, orders, orderItems, payments } = useTableStore();
  const { deliveryOrders } = useDeliveryStore();
  const { dailyPrepStock, stockMovements, products } = useStockStore();
  const { jobs } = usePrintStore();
  if (!currentShift) return null;

  const d = computeDashboard({ shiftId: currentShift.id, tables, tabs, orders, orderItems, payments, deliveryOrders, stockMovements, jobs, printerMonitored: isSupabaseConfigured, now: Date.now() });

  const shareWhatsApp = () => {
    const text = `*Espetaria Sabor da Carne - Resumo do turno*\n` +
      `Turno: ${currentShift.name}\n\n` +
      `*Faturado:* ${formatBRL(d.revenue.realized)}\n` +
      `*Em andamento:* ${formatBRL(d.revenue.inProgress)}\n` +
      `*Projetado:* ${formatBRL(d.revenue.projected)}\n\n` +
      `*Recebido:*\n` +
      `PIX: ${formatBRL(d.received.PIX)}\n` +
      `Crédito: ${formatBRL(d.received.CREDITO)}\n` +
      `Débito: ${formatBRL(d.received.DEBITO)}\n` +
      `Dinheiro: ${formatBRL(d.received.DINHEIRO)}\n\n` +
      `*Salão:* ${d.salon.openTabs.length} mesas abertas · ${d.salon.closedTabs.length} fechadas\n` +
      `*Delivery:* ${d.delivery.count} pedidos`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  // Excel abre com acentos: BOM + ponto e vírgula
  const exportCsv = () => {
    const money = (n: number) => n.toFixed(2).replace('.', ',');
    const rows: (string | number)[][] = [
      ['Fechamento do turno', currentShift.name, 'Data', currentShift.date],
      [],
      ['Faturamento (produtos)', 'Realizado', 'Em andamento', 'Projetado'],
      ['Total', money(d.revenue.realized), money(d.revenue.inProgress), money(d.revenue.projected)],
      ['Salão', money(d.salon.closed), money(d.salon.open), money(d.salon.closed + d.salon.open)],
      ['Delivery', money(d.delivery.realized), money(d.delivery.pending), money(d.delivery.gross)],
      ['Retirada', money(d.pickup.realized), money(d.pickup.pending), money(d.pickup.gross)],
      [],
      ['Taxas de entrega', money(d.delivery.fees), 'Descontos', money(d.salon.discounts)],
      [],
      ['Recebido', 'PIX', 'Crédito', 'Débito', 'Dinheiro', 'Cartão na entrega', 'Total'],
      ['', money(d.received.PIX), money(d.received.CREDITO), money(d.received.DEBITO), money(d.received.DINHEIRO), money(d.received.CARTAO_ENTREGA), money(d.receivedTotal)],
      [],
      ['Produto', 'Canais', 'Quantidade', 'Faturamento'],
      ...d.topProducts.map((p) => [p.name, p.channels, p.qty, money(p.total)]),
      [],
      ['Estoque', 'Inicial', 'Atual', 'Ajustes', 'Contagem física', 'Diferença'],
      ...dailyPrepStock.map((s) => [products.find((p) => p.id === s.product_id)?.name || s.product_id, s.initial_quantity, s.current_quantity, s.adjusted_quantity, s.last_counted_quantity ?? '-', s.count_difference ?? '-']),
    ];
    const csv = '﻿' + rows.map((r) => r.map((c) => { const v = String(c); return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `Turno_${currentShift.date}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="surface-card p-4 sm:p-5" aria-labelledby="shift-summary-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="shift-summary-title" className="flex items-center gap-2 text-base font-semibold"><TrendingUp className="h-5 w-5 text-brand-700" aria-hidden="true" />Turno aberto · {currentShift.name}</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary min-h-[44px]" onClick={shareWhatsApp}><MessageSquare className="h-4 w-4" aria-hidden="true" />Resumo no WhatsApp</button>
          <button type="button" className="btn-secondary min-h-[44px]" onClick={exportCsv}><Download className="h-4 w-4" aria-hidden="true" />Exportar planilha</button>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div><dt className="text-sm text-ink-muted">Faturado</dt><dd className="font-mono text-xl font-bold text-ink">{formatBRL(d.revenue.realized)}</dd></div>
        <div><dt className="text-sm text-ink-muted">Em andamento</dt><dd className="font-mono text-xl font-bold text-ink">{formatBRL(d.revenue.inProgress)}</dd></div>
        <div><dt className="text-sm text-ink-muted">Recebido no caixa</dt><dd className="font-mono text-xl font-bold text-ink">{formatBRL(d.receivedTotal)}</dd></div>
      </dl>
    </section>
  );
}
