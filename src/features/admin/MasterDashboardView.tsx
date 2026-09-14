import React, { useState } from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  Users, 
  Receipt, 
  PieChart, 
  Flame, 
  PackageCheck, 
  Download, 
  Lock, 
  ShieldCheck, 
  Clock 
} from 'lucide-react';
import { useShiftStore } from '../../stores/useShiftStore';
import { useTableStore } from '../../stores/useTableStore';
import { useDeliveryStore } from '../../stores/useDeliveryStore';
import { useStockStore } from '../../stores/useStockStore';
import { formatBRL } from '../../lib/formatters';
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

  const totalPaidAll = Object.values(paymentBreakdown).reduce((a, b) => a + b, 0) || 1;

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
    <div className="min-h-screen bg-slate-950 text-slate-100 p-3 sm:p-6 space-y-6">
      
      {/* Topo do Painel Master */}
      <div className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-3xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-amber-600/20 border border-amber-500/40 text-amber-400 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wide">
                Painel Master & DRE Executivo
              </h1>
              <p className="text-xs text-slate-400">
                Gestão Estratégica, Financeira e Auditoria Noturna da Espetaria
              </p>
            </div>
          </div>
        </div>

        {/* Ações Rápidas do Master */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleExportCSV}
            disabled={!currentShift}
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 border border-slate-700 shadow-md"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Exportar CSV</span>
          </button>

          {currentShift && currentShift.status === 'ABERTO' ? (
            <button
              onClick={() => setIsCloseModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 transition active:scale-95 shadow-lg shadow-rose-950/60"
            >
              <Lock className="w-4 h-4" />
              <span>Fechar Turno (Reconciliação)</span>
            </button>
          ) : (
            <div className="px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-400 text-xs font-mono">
              Nenhum turno aberto no momento
            </div>
          )}
        </div>
      </div>

      {/* DRE DO TURNO: CARDS DE MÉTRICAS PRINCIPAIS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        
        {/* Faturamento Bruto */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Faturamento Bruto</span>
            <DollarSign className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-400 mt-2">
            {formatBRL(grossRevenue)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
            <span>Salão: {formatBRL(salonGross)}</span>
            <span>•</span>
            <span>Delivery: {formatBRL(deliveryGross)}</span>
          </div>
        </div>

        {/* Faturamento Líquido */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Faturamento Líquido</span>
            <TrendingUp className="w-5 h-5 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-white mt-2">
            {formatBRL(netRevenue)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Taxa 10%: +{formatBRL(totalServiceFee)} | Descontos: -{formatBRL(totalDiscounts)}
          </div>
        </div>

        {/* Comandas e Pessoas */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mesas & Clientes</span>
            <Users className="w-5 h-5 text-sky-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-white mt-2">
            {closedTabs.length} <span className="text-base text-slate-400 font-sans font-normal">mesas</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {totalPeople} pessoas atendidas no salão
          </div>
        </div>

        {/* Ticket Médio */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ticket Médio</span>
            <Receipt className="w-5 h-5 text-rose-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-white mt-2">
            {formatBRL(avgTicketTab)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {formatBRL(avgTicketPerson)} por pessoa
          </div>
        </div>

      </div>

      {/* SEÇÃO INTERMEDIÁRIA: FORMAS DE PAGAMENTO & CURVA ABC */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Distribuição por Meio de Pagamento */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <PieChart className="w-4 h-4 text-emerald-400" />
              <span>Meios de Pagamento Recebidos</span>
            </h2>
            <span className="text-xs font-mono text-slate-400 font-bold">
              Total: {formatBRL(totalPaidAll)}
            </span>
          </div>

          <div className="space-y-3">
            {[
              { id: 'PIX', label: 'PIX Instantâneo', color: 'bg-emerald-500', text: 'text-emerald-400' },
              { id: 'CREDITO', label: 'Cartão de Crédito', color: 'bg-indigo-500', text: 'text-indigo-400' },
              { id: 'DEBITO', label: 'Cartão de Débito', color: 'bg-sky-500', text: 'text-sky-400' },
              { id: 'DINHEIRO', label: 'Dinheiro em Espécie', color: 'bg-amber-500', text: 'text-amber-400' },
            ].map((method) => {
              const amount = paymentBreakdown[method.id] || 0;
              const percent = totalPaidAll > 0 ? (amount / totalPaidAll) * 100 : 0;

              return (
                <div key={method.id} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-300">{method.label}</span>
                    <span className={`font-mono font-bold ${method.text}`}>
                      {formatBRL(amount)} ({percent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${method.color} transition-all duration-500`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Curva ABC de Produtos Mais Vendidos */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-500" />
              <span>Curva ABC — Top Produtos Mais Vendidos</span>
            </h2>
            <span className="text-xs text-slate-400">Classificação por Faturamento</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="pb-2">#</th>
                  <th className="pb-2">Produto / Corte</th>
                  <th className="pb-2 text-center">Unidades</th>
                  <th className="pb-2 text-right">Faturamento</th>
                  <th className="pb-2 text-right">% Vendas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {topProducts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500 italic">
                      Nenhum item vendido até o momento neste turno.
                    </td>
                  </tr>
                ) : (
                  topProducts.slice(0, 7).map((prod, idx) => {
                    const pct = grossRevenue > 0 ? (prod.total / grossRevenue) * 100 : 0;
                    return (
                      <tr key={idx} className="hover:bg-slate-800/40 transition">
                        <td className="py-2.5 font-bold font-mono text-amber-400">{idx + 1}º</td>
                        <td className="py-2.5 font-semibold text-white">
                          <div>{prod.name}</div>
                          <span className="text-[10px] text-slate-400">{prod.category}</span>
                        </td>
                        <td className="py-2.5 text-center font-mono font-bold text-slate-300">
                          {prod.qty} un
                        </td>
                        <td className="py-2.5 text-right font-mono font-bold text-emerald-400">
                          {formatBRL(prod.total)}
                        </td>
                        <td className="py-2.5 text-right font-mono text-slate-400">
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
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <PackageCheck className="w-5 h-5 text-rose-400" />
            <h2 className="text-sm font-bold text-white">
              Auditoria de Quebras, Perdas & Descartes do Turno
            </h2>
          </div>
          <span className="text-xs font-mono text-rose-400 font-bold">
            {shiftLossMovements.length} ocorrências registradas
          </span>
        </div>

        {shiftLossMovements.length === 0 ? (
          <div className="p-4 rounded-2xl bg-slate-950/60 text-center text-slate-500 text-xs italic">
            Nenhuma perda ou descarte operacional registrado no turno de hoje.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {shiftLossMovements.map((m) => (
              <div
                key={m.id}
                className="p-3 rounded-2xl bg-slate-950 border border-rose-900/40 text-xs space-y-1"
              >
                <div className="flex justify-between font-semibold text-white">
                  <span>{m.product_name || m.product_id}</span>
                  <span className="font-mono text-rose-400 font-bold">{m.quantity} un</span>
                </div>
                <div className="text-[11px] text-slate-400 italic">
                  Motivo: {m.reason || 'Sem justificativa'}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {new Date(m.created_at).toLocaleTimeString('pt-BR')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* HISTÓRICO DE TURNOS ANTERIORES */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <span>Histórico de Turnos Fechados</span>
          </h2>
          <span className="text-xs text-slate-400 font-mono">
            {shiftsHistory.length} registros
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="pb-2">Turno</th>
                <th className="pb-2">Data</th>
                <th className="pb-2">Status</th>
                <th className="pb-2 text-right">Caixa Inicial</th>
                <th className="pb-2 text-right">Caixa Final</th>
                <th className="pb-2">Observações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {shiftsHistory.map((shift) => (
                <tr key={shift.id} className="hover:bg-slate-800/40 transition">
                  <td className="py-2.5 font-semibold text-white">{shift.name}</td>
                  <td className="py-2.5 font-mono text-slate-300">{shift.date}</td>
                  <td className="py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                      shift.status === 'ABERTO'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}>
                      {shift.status}
                    </span>
                  </td>
                  <td className="py-2.5 text-right font-mono text-slate-300">
                    {formatBRL(shift.cash_drawer_start)}
                  </td>
                  <td className="py-2.5 text-right font-mono font-bold text-emerald-400">
                    {shift.cash_drawer_end !== null ? formatBRL(shift.cash_drawer_end) : '—'}
                  </td>
                  <td className="py-2.5 text-slate-400 italic max-w-xs truncate">
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
