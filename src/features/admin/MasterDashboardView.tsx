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
    <div className="min-h-screen bg-obsidian-950 text-obsidian-100 p-3 sm:p-6 space-y-6">
      
      {/* Topo do Painel Master */}
      <div className="bg-carbon-900 border border-carbon-800 p-4 sm:p-6 rounded-3xl shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gold-600 to-amber-600 text-obsidian-950 flex items-center justify-center shadow-lg shadow-gold-950/50">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wide font-serif">
                Painel Master & DRE Executivo
              </h1>
              <p className="text-xs text-obsidian-400 mt-0.5">
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
            className="btn-carbon px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-md"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Exportar DRE (CSV)</span>
          </button>

          {currentShift && currentShift.status === 'ABERTO' ? (
            <button
              onClick={() => setIsCloseModalOpen(true)}
              className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-ruby-600 to-red-600 hover:from-ruby-500 hover:to-red-500 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 transition active:scale-95 shadow-lg shadow-ruby-950/60"
            >
              <Lock className="w-4 h-4" />
              <span>Fechar Turno (Reconciliação)</span>
            </button>
          ) : (
            <div className="px-3.5 py-2 rounded-2xl bg-carbon-800 border border-carbon-700 text-obsidian-400 text-xs font-mono">
              Nenhum turno aberto no momento
            </div>
          )}
        </div>
      </div>

      {/* DRE DO TURNO: CARDS DE MÉTRICAS PRINCIPAIS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        
        {/* Faturamento Bruto */}
        <div className="card-carbon border border-carbon-800 p-5 rounded-3xl shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-obsidian-400 uppercase tracking-wider font-serif">Faturamento Bruto</span>
            <DollarSign className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-400 mt-2.5 drop-shadow-md">
            {formatBRL(grossRevenue)}
          </div>
          <div className="text-[11px] text-obsidian-400 mt-1.5 flex items-center gap-1 font-mono">
            <span>Salão: {formatBRL(salonGross)}</span>
            <span>•</span>
            <span>Delivery: {formatBRL(deliveryGross)}</span>
          </div>
        </div>

        {/* Faturamento Líquido */}
        <div className="card-carbon border border-carbon-800 p-5 rounded-3xl shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-obsidian-400 uppercase tracking-wider font-serif">Faturamento Líquido</span>
            <TrendingUp className="w-5 h-5 text-gold-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-gold-400 mt-2.5 drop-shadow-md">
            {formatBRL(netRevenue)}
          </div>
          <div className="text-[11px] text-obsidian-400 mt-1.5 font-mono">
            Taxa 10%: +{formatBRL(totalServiceFee)} | Desc: -{formatBRL(totalDiscounts)}
          </div>
        </div>

        {/* Comandas e Pessoas */}
        <div className="card-carbon border border-carbon-800 p-5 rounded-3xl shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-obsidian-400 uppercase tracking-wider font-serif">Mesas & Clientes</span>
            <Users className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-white mt-2.5">
            {closedTabs.length} <span className="text-base text-obsidian-400 font-sans font-normal">mesas</span>
          </div>
          <div className="text-[11px] text-obsidian-400 mt-1.5">
            {totalPeople} clientes atendidos no salão
          </div>
        </div>

        {/* Ticket Médio */}
        <div className="card-carbon border border-carbon-800 p-5 rounded-3xl shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-obsidian-400 uppercase tracking-wider font-serif">Ticket Médio</span>
            <Receipt className="w-5 h-5 text-ember-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-white mt-2.5">
            {formatBRL(avgTicketTab)}
          </div>
          <div className="text-[11px] text-obsidian-400 mt-1.5 font-mono">
            {formatBRL(avgTicketPerson)} por pessoa
          </div>
        </div>

      </div>

      {/* SEÇÃO INTERMEDIÁRIA: FORMAS DE PAGAMENTO & CURVA ABC */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Distribuição por Meio de Pagamento */}
        <div className="card-carbon border border-carbon-800 p-5 sm:p-6 rounded-3xl shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-carbon-800 pb-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2 font-serif">
              <PieChart className="w-4 h-4 text-emerald-400" />
              <span>Meios de Pagamento</span>
            </h2>
            <span className="text-xs font-mono text-gold-400 font-bold">
              {formatBRL(totalPaidAll)}
            </span>
          </div>

          <div className="space-y-3.5">
            {[
              { id: 'PIX', label: 'PIX Instantâneo', color: 'bg-emerald-500', text: 'text-emerald-400' },
              { id: 'CREDITO', label: 'Cartão de Crédito', color: 'bg-purple-500', text: 'text-purple-400' },
              { id: 'DEBITO', label: 'Cartão de Débito', color: 'bg-cyan-500', text: 'text-cyan-400' },
              { id: 'DINHEIRO', label: 'Dinheiro em Espécie', color: 'bg-gold-500', text: 'text-gold-400' },
            ].map((method) => {
              const amount = paymentBreakdown[method.id] || 0;
              const percent = totalPaidAll > 0 ? (amount / totalPaidAll) * 100 : 0;

              return (
                <div key={method.id} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-obsidian-300">{method.label}</span>
                    <span className={`font-mono font-bold ${method.text}`}>
                      {formatBRL(amount)} ({percent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-obsidian-950 h-2.5 rounded-full overflow-hidden border border-carbon-800">
                    <div
                      className={`h-full ${method.color} transition-all duration-500 rounded-full`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Curva ABC de Produtos Mais Vendidos */}
        <div className="lg:col-span-2 card-carbon border border-carbon-800 p-5 sm:p-6 rounded-3xl shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-carbon-800 pb-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2 font-serif">
              <Flame className="w-4 h-4 text-ember-500" />
              <span>Curva ABC — Top Produtos Mais Vendidos</span>
            </h2>
            <span className="text-xs text-obsidian-400">Classificação por Faturamento</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-obsidian-400 font-semibold border-b border-carbon-800 font-serif">
                <tr>
                  <th className="pb-3">#</th>
                  <th className="pb-3">Produto / Corte</th>
                  <th className="pb-3 text-center">Unidades</th>
                  <th className="pb-3 text-right">Faturamento</th>
                  <th className="pb-3 text-right">% Vendas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-carbon-800/80">
                {topProducts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-obsidian-500 italic">
                      Nenhum item vendido até o momento neste turno.
                    </td>
                  </tr>
                ) : (
                  topProducts.slice(0, 7).map((prod, idx) => {
                    const pct = grossRevenue > 0 ? (prod.total / grossRevenue) * 100 : 0;
                    return (
                      <tr key={idx} className="hover:bg-carbon-800/40 transition">
                        <td className="py-3 font-bold font-mono text-gold-400">{idx + 1}º</td>
                        <td className="py-3 font-semibold text-white">
                          <div>{prod.name}</div>
                          <span className="text-[10px] text-obsidian-400">{prod.category}</span>
                        </td>
                        <td className="py-3 text-center font-mono font-bold text-obsidian-300">
                          {prod.qty} un
                        </td>
                        <td className="py-3 text-right font-mono font-bold text-gold-400">
                          {formatBRL(prod.total)}
                        </td>
                        <td className="py-3 text-right font-mono text-obsidian-400">
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
      <div className="card-carbon border border-carbon-800 p-5 sm:p-6 rounded-3xl shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-carbon-800 pb-3">
          <div className="flex items-center gap-2">
            <PackageCheck className="w-5 h-5 text-ruby-400" />
            <h2 className="text-sm font-bold text-white font-serif">
              Auditoria de Quebras, Perdas & Descartes do Turno
            </h2>
          </div>
          <span className="text-xs font-mono text-ruby-400 font-bold">
            {shiftLossMovements.length} ocorrências registradas
          </span>
        </div>

        {shiftLossMovements.length === 0 ? (
          <div className="p-5 rounded-2xl bg-obsidian-900/60 text-center text-obsidian-500 text-xs italic">
            Nenhuma perda ou descarte operacional registrado no turno de hoje.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {shiftLossMovements.map((m) => (
              <div
                key={m.id}
                className="p-3.5 rounded-2xl bg-obsidian-900 border border-ruby-900/40 text-xs space-y-1.5 shadow-md"
              >
                <div className="flex justify-between font-semibold text-white">
                  <span>{m.product_name || m.product_id}</span>
                  <span className="font-mono text-ruby-400 font-bold">{m.quantity} un</span>
                </div>
                <div className="text-[11px] text-obsidian-400 italic">
                  Motivo: {m.reason || 'Sem justificativa'}
                </div>
                <div className="text-[10px] text-obsidian-500 font-mono">
                  {new Date(m.created_at).toLocaleTimeString('pt-BR')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* HISTÓRICO DE TURNOS ANTERIORES */}
      <div className="card-carbon border border-carbon-800 p-5 sm:p-6 rounded-3xl shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-carbon-800 pb-3">
          <h2 className="text-sm font-bold text-white flex items-center gap-2 font-serif">
            <Clock className="w-4 h-4 text-gold-400" />
            <span>Histórico de Turnos Fechados</span>
          </h2>
          <span className="text-xs text-obsidian-400 font-mono">
            {shiftsHistory.length} registros
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-obsidian-400 font-semibold border-b border-carbon-800 font-serif">
              <tr>
                <th className="pb-3">Turno</th>
                <th className="pb-3">Data</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 text-right">Caixa Inicial</th>
                <th className="pb-3 text-right">Caixa Final</th>
                <th className="pb-3">Observações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-800/80">
              {shiftsHistory.map((shift) => (
                <tr key={shift.id} className="hover:bg-carbon-800/40 transition">
                  <td className="py-3 font-semibold text-white">{shift.name}</td>
                  <td className="py-3 font-mono text-obsidian-300">{shift.date}</td>
                  <td className="py-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                      shift.status === 'ABERTO'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-carbon-800 text-obsidian-400 border border-carbon-700'
                    }`}>
                      {shift.status}
                    </span>
                  </td>
                  <td className="py-3 text-right font-mono text-obsidian-300">
                    {formatBRL(shift.cash_drawer_start)}
                  </td>
                  <td className="py-3 text-right font-mono font-bold text-gold-400">
                    {shift.cash_drawer_end !== null ? formatBRL(shift.cash_drawer_end) : '—'}
                  </td>
                  <td className="py-3 text-obsidian-400 italic max-w-xs truncate">
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
