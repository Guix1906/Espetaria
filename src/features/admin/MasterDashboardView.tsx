import {
  Clock,
  DollarSign,
  Download,
  Flame,
  Lock,
  PackageCheck,
  PieChart,
  Receipt,
  ShieldCheck,
  TrendingUp,
  Users
} from 'lucide-react';
import React, { useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatCard } from '../../components/ui/StatCard';
import { formatBRL } from '../../lib/formatters';
import { useDeliveryStore } from '../../stores/useDeliveryStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useStockStore } from '../../stores/useStockStore';
import { useTableStore } from '../../stores/useTableStore';
import { ShiftCloseModal } from './ShiftCloseModal';

export const MasterDashboardView: React.FC = () => {
  const { currentShift, shiftsHistory } = useShiftStore();
  const { tabs, payments, orderItems } = useTableStore();
  const { deliveryOrders } = useDeliveryStore();
  const { dailyPrepStock, stockMovements, products } = useStockStore();

  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);

  // 1. Filtragem dos dados pertencentes ao turno ativo
  const currentShiftId = currentShift?.id;

  // Comandas do turno atual
  const shiftTabs = currentShiftId ? tabs.filter((t) => t.shift_id === currentShiftId) : [];
  const closedTabs = shiftTabs.filter((t) => t.status === 'CLOSED');

  // Pagamentos do turno
  const shiftPayments = currentShiftId ? payments.filter((p) => p.shift_id === currentShiftId) : [];

  // Delivery do turno
  const shiftDeliveries = currentShiftId ? deliveryOrders.filter((d) => d.shift_id === currentShiftId && d.status !== 'CANCELLED') : [];
  const deliveredOrders = shiftDeliveries.filter((d) => d.status === 'DELIVERED');

  // 2. Faturamento
  const salonGross = closedTabs.reduce((sum, t) => sum + t.subtotal, 0);
  const deliveryGross = deliveredOrders.reduce((sum, d) => sum + d.subtotal, 0);
  const grossRevenue = salonGross + deliveryGross;

  const totalServiceFee = closedTabs.reduce((sum, t) => sum + t.service_fee, 0);
  const totalDiscounts = closedTabs.reduce((sum, t) => sum + t.discount, 0);
  const netRevenue = grossRevenue + totalServiceFee - totalDiscounts;

  // 3. Pessoas e Ticket Médio
  const totalPeople = closedTabs.reduce((sum, t) => sum + (t.people_count || 1), 0);
  const avgTicketTab = closedTabs.length > 0 ? (grossRevenue / closedTabs.length) : 0;
  const avgTicketPerson = totalPeople > 0 ? (grossRevenue / totalPeople) : 0;

  // 4. Breakdown de Formas de Pagamento
  const paymentBreakdown: Record<string, number> = {
    PIX: 0,
    CREDITO: 0,
    DEBITO: 0,
    DINHEIRO: 0,
  };

  shiftPayments.forEach((p) => {
    paymentBreakdown[p.method] = (paymentBreakdown[p.method] || 0) + p.amount;
  });

  deliveredOrders.forEach((d) => {
    if (d.payment_method === 'PIX') paymentBreakdown['PIX'] = (paymentBreakdown['PIX'] || 0) + d.total;
    if (d.payment_method === 'DINHEIRO') paymentBreakdown['DINHEIRO'] = (paymentBreakdown['DINHEIRO'] || 0) + d.total;
    if (d.payment_method === 'CARTAO_ENTREGA') paymentBreakdown['CREDITO'] = (paymentBreakdown['CREDITO'] || 0) + d.total;
  });

  const totalPaidAll = Object.values(paymentBreakdown).reduce((a, b) => a + b, 0);

  // 5. Curva ABC dos Produtos Mais Vendidos
  const productSalesMap: Record<string, { name: string; category: string; qty: number; total: number }> = {};

  // Itens de comandas
  const shiftOrderItems = currentShiftId
    ? orderItems.filter((i) => i.shift_id === currentShiftId && i.status !== 'CANCELLED')
    : [];

  shiftOrderItems.forEach((i) => {
    if (!productSalesMap[i.product_id]) {
      productSalesMap[i.product_id] = {
        name: i.product_name,
        category: 'Salão',
        qty: 0,
        total: 0,
      };
    }
    productSalesMap[i.product_id]!.qty += i.quantity;
    productSalesMap[i.product_id]!.total += i.unit_price * i.quantity;
  });

  // Itens de delivery
  shiftDeliveries.forEach((d) => {
    d.items.forEach((item) => {
      if (!productSalesMap[item.product_id]) {
        productSalesMap[item.product_id] = {
          name: item.product_name,
          category: 'Delivery',
          qty: 0,
          total: 0,
        };
      }
      productSalesMap[item.product_id]!.qty += item.quantity;
      productSalesMap[item.product_id]!.total += item.unit_price * item.quantity;
    });
  });

  const topProducts = Object.values(productSalesMap).sort((a, b) => b.total - a.total);

  // 6. Auditoria de Perdas e Descartes
  const shiftLossMovements = currentShiftId
    ? stockMovements.filter((m) => m.shift_id === currentShiftId && (m.movement_type === 'PERDA' || m.movement_type === 'DESCARTE'))
    : [];

  // Exportação CSV do Turno
  const handleExportCSV = () => {
    if (!currentShift) return;

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'RELATÓRIO DRE & FECHAMENTO DE TURNO - ESPETARIA SABOR DA CARNE\n';
    csvContent += `Turno;${currentShift.name};Data;${currentShift.date}\n`;
    csvContent += `Faturamento Bruto;${grossRevenue.toFixed(2)};Taxa Serviço;${totalServiceFee.toFixed(2)};Descontos;${totalDiscounts.toFixed(2)};Faturamento Líquido;${netRevenue.toFixed(2)}\n\n`;

    csvContent += 'RANKING DE PRODUTOS VENDIDOS\n';
    csvContent += 'Produto;Quantidade;Faturamento\n';
    topProducts.forEach((p) => {
      csvContent += `${p.name};${p.qty};${p.total.toFixed(2)}\n`;
    });

    csvContent += '\nMovimentações de Estoque & Divergências\n';
    csvContent += 'Produto;Qtd Inicial;Qtd Atual;Ajustes;Contagem Física;Diferença\n';
    dailyPrepStock.forEach((s) => {
      const prod = products.find((p) => p.id === s.product_id);
      csvContent += `${prod?.name || s.product_id};${s.initial_quantity};${s.current_quantity};${s.adjusted_quantity};${s.last_counted_quantity ?? '-'};${s.count_difference ?? '-'}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `DRE_Espetaria_${currentShift.date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="page-layout">

      <PageHeader eyebrow="Gestão da espetaria" title="Visão geral" description={<>Vendas, recebimentos e resultados em um só lugar.<span className="mt-1 block font-medium text-ink-secondary">{currentShift ? currentShift.name : 'Nenhum turno aberto no momento'}</span></>} icon={ShieldCheck} actions={<>
        <button type="button" onClick={handleExportCSV} disabled={!currentShift} className="btn-secondary"><Download className="h-4 w-4" aria-hidden="true" />Exportar relatório</button>
        {currentShift?.status === 'ABERTO' && <button type="button" onClick={() => setIsCloseModalOpen(true)} className="btn-secondary text-rose-700 hover:border-rose-400 hover:bg-rose-50 hover:text-rose-800"><Lock className="h-4 w-4" aria-hidden="true" />Fechar turno</button>}
      </>} />

      <div className="stat-grid">
        <StatCard label="Faturamento bruto" value={formatBRL(grossRevenue)} hint={<>Salão: {formatBRL(salonGross)}<br />Delivery: {formatBRL(deliveryGross)}</>} icon={DollarSign} tone="success" />
        <StatCard label="Faturamento líquido" value={formatBRL(netRevenue)} hint={<>Serviço: +{formatBRL(totalServiceFee)}<br />Descontos: -{formatBRL(totalDiscounts)}</>} icon={TrendingUp} />
        <StatCard label="Comandas encerradas" value={closedTabs.length} hint={<>{totalPeople} pessoas atendidas no salão</>} icon={Users} tone="info" />
        <StatCard label="Ticket médio" value={formatBRL(avgTicketTab)} hint={<>{formatBRL(avgTicketPerson)} por pessoa</>} icon={Receipt} tone="warning" />
      </div>

      {/* SEÇÃO INTERMEDIÁRIA: FORMAS DE PAGAMENTO & CURVA ABC */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Distribuição por Meio de Pagamento */}
        <div className="bg-surface-muted border border-line p-5 sm:p-6 rounded-2xl shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
            <h2 className="text-sm font-bold text-ink flex items-center gap-2 font-sans">
              <PieChart className="w-4 h-4 text-emerald-700" />
              <span>Meios de Pagamento</span>
            </h2>
            <span className="text-xs tabular-nums text-ink font-bold">
              {formatBRL(totalPaidAll)}
            </span>
          </div>

          <div className="space-y-3.5">
            {[
              { id: 'PIX', label: 'PIX Instantâneo', color: 'bg-emerald-700', text: 'text-emerald-700' },
              { id: 'CREDITO', label: 'Cartão de Crédito', color: 'bg-purple-700', text: 'text-purple-700' },
              { id: 'DEBITO', label: 'Cartão de Débito', color: 'bg-sky-700', text: 'text-sky-700' },
              { id: 'DINHEIRO', label: 'Dinheiro em Espécie', color: 'bg-amber-700', text: 'text-amber-800' },
            ].map((method) => {
              const amount = paymentBreakdown[method.id] || 0;
              const percent = totalPaidAll > 0 ? (amount / totalPaidAll) * 100 : 0;

              return (
                <div key={method.id} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-ink">{method.label}</span>
                    <span className={`tabular-nums font-bold ${method.text}`}>
                      {formatBRL(amount)} ({percent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-surface-muted h-2.5 rounded-full overflow-hidden border border-line">
                    <div
                      className={`h-full ${method.color} transition-colors duration-500 rounded-full`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Curva ABC de Produtos Mais Vendidos */}
        <div className="xl:col-span-2 bg-surface-muted border border-line p-5 sm:p-6 rounded-2xl shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
            <h2 className="text-sm font-bold text-ink flex items-center gap-2 font-sans">
              <Flame className="w-4 h-4 text-brand-700" />
              <span>Produtos mais vendidos</span>
            </h2>
            <span className="text-xs text-ink-muted">Classificação por Faturamento</span>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table w-full text-left text-xs">
              <thead className="text-ink-muted font-semibold border-b border-line font-sans">
                <tr>
                  <th className="pb-3">#</th>
                  <th className="pb-3">Produto / Corte</th>
                  <th className="pb-3 text-center">Unidades</th>
                  <th className="pb-3 text-right">Faturamento</th>
                  <th className="pb-3 text-right">% Vendas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {topProducts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-ink-muted italic">
                      Nenhum item vendido até o momento neste turno.
                    </td>
                  </tr>
                ) : (
                  topProducts.slice(0, 7).map((prod, idx) => {
                    const pct = grossRevenue > 0 ? (prod.total / grossRevenue) * 100 : 0;
                    return (
                      <tr key={idx} className="hover:bg-surface-muted transition">
                        <td className="py-3 font-bold tabular-nums text-brand-700">{idx + 1}º</td>
                        <td className="py-3 font-semibold text-ink">
                          <div>{prod.name}</div>
                          <span className="text-xs text-ink-muted">{prod.category}</span>
                        </td>
                        <td className="py-3 text-center tabular-nums font-bold text-ink">
                          {prod.qty} un
                        </td>
                        <td className="py-3 text-right tabular-nums font-bold text-ink">
                          {formatBRL(prod.total)}
                        </td>
                        <td className="py-3 text-right tabular-nums text-ink-muted">
                          {pct.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* AUDITORIA DE QUEBRAS E PERDAS */}
      <div className="bg-surface-muted border border-line p-5 sm:p-6 rounded-2xl shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <PackageCheck className="w-5 h-5 text-red-700" />
            <h2 className="text-sm font-bold text-ink font-sans">
              Perdas e descartes do turno
            </h2>
          </div>
          <span className="text-xs tabular-nums text-red-700 font-bold">
            {shiftLossMovements.length} ocorrências registradas
          </span>
        </div>

        {shiftLossMovements.length === 0 ? (
          <div className="p-5 rounded-2xl bg-surface-muted text-center text-ink-muted text-xs italic">
            Nenhuma perda ou descarte operacional registrado no turno de hoje.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {shiftLossMovements.map((m) => (
              <div
                key={m.id}
                className="p-3.5 rounded-2xl bg-surface-muted border border-red-200 text-xs space-y-1.5 shadow-sm"
              >
                <div className="flex justify-between font-semibold text-ink">
                  <span>{m.product_name || m.product_id}</span>
                  <span className="tabular-nums text-red-700 font-bold">{m.quantity} un</span>
                </div>
                <div className="text-xs text-ink-muted italic">
                  Motivo: {m.reason || 'Sem justificativa'}
                </div>
                <div className="text-xs text-ink-muted tabular-nums">
                  {new Date(m.created_at).toLocaleTimeString('pt-BR')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* HISTÓRICO DE TURNOS ANTERIORES */}
      <div className="bg-surface-muted border border-line p-5 sm:p-6 rounded-2xl shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <h2 className="text-sm font-bold text-ink flex items-center gap-2 font-sans">
            <Clock className="w-4 h-4 text-amber-800" />
            <span>Histórico de turnos</span>
          </h2>
          <span className="text-xs text-ink-muted tabular-nums">
            {shiftsHistory.length} registros
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table w-full text-left text-xs">
            <thead className="text-ink-muted font-semibold border-b border-line font-sans">
              <tr>
                <th className="pb-3">Turno</th>
                <th className="pb-3">Data</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 text-right">Caixa Inicial</th>
                <th className="pb-3 text-right">Caixa Final</th>
                <th className="pb-3">Observações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shiftsHistory.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-ink-muted">Nenhum turno registrado no histórico.</td></tr>}
              {shiftsHistory.map((shift) => (
                <tr key={shift.id} className="hover:bg-surface-muted transition">
                  <td className="py-3 font-semibold text-ink">{shift.name}</td>
                  <td className="py-3 tabular-nums text-ink-muted">{shift.date}</td>
                  <td className="py-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold tabular-nums ${shift.status === 'ABERTO'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-surface-muted text-ink-muted border border-line'
                      }`}>
                      {shift.status}
                    </span>
                  </td>
                  <td className="py-3 text-right tabular-nums text-ink-muted">
                    {formatBRL(shift.cash_drawer_start)}
                  </td>
                  <td className="py-3 text-right tabular-nums font-bold text-ink">
                    {shift.cash_drawer_end !== null ? formatBRL(shift.cash_drawer_end) : '—'}
                  </td>
                  <td className="py-3 text-ink-muted italic max-w-xs truncate">
                    {shift.closing_notes || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Fechamento de Turno */}
      <ShiftCloseModal
        isOpen={isCloseModalOpen}
        onClose={() => setIsCloseModalOpen(false)}
      />
    </div>
  );
};
