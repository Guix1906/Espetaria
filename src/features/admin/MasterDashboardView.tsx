import {
  AlertCircle,
  Clock,
  DollarSign,
  Download,
  Flame,
  Lock,
  PackageCheck,
  PieChart,
  Plus,
  Printer,
  ShieldCheck,
  ShoppingBag,
  TrendingUp,
  Users,
  UtensilsCrossed
} from 'lucide-react';
import React, { useState } from 'react';
import type { ActiveTab } from '../../components/layout/navigation';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatCard } from '../../components/ui/StatCard';
import { formatBRL, formatDoneness, formatElapsedMinutes } from '../../lib/formatters';
import { useDeliveryStore } from '../../stores/useDeliveryStore';
import { usePrintStore } from '../../stores/usePrintStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useStockStore } from '../../stores/useStockStore';
import { useTableStore } from '../../stores/useTableStore';
import { ShiftCloseModal } from './ShiftCloseModal';

interface MasterDashboardViewProps {
  onNavigateTab?: (tab: ActiveTab) => void;
  onOpenShiftClick?: () => void;
}

export const MasterDashboardView: React.FC<MasterDashboardViewProps> = ({
  onNavigateTab,
  onOpenShiftClick,
}) => {
  const { currentShift, shiftsHistory } = useShiftStore();
  const { tables, tabs, orders, orderItems, payments } = useTableStore();
  const { deliveryOrders } = useDeliveryStore();
  const { dailyPrepStock, stockMovements, products } = useStockStore();
  const { jobs } = usePrintStore();

  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);

  // 1. Filtragem e Coesão de Dados do Turno
  const currentShiftId = currentShift?.id;

  // Comandas: se houver turno ativo, filtra pelo turno; se não, pega todas as comandas ativas no salão (tolerância a falhas)
  const shiftTabs = currentShiftId
    ? tabs.filter((t) => t.shift_id === currentShiftId || t.status === 'OPEN')
    : tabs;

  const openTabs = shiftTabs.filter((t) => t.status === 'OPEN');
  const closedTabs = shiftTabs.filter((t) => t.status === 'CLOSED');

  // Pagamentos do turno
  const shiftPayments = currentShiftId
    ? payments.filter((p) => p.shift_id === currentShiftId || !p.shift_id)
    : payments;

  // Delivery do turno
  const shiftDeliveries = currentShiftId
    ? deliveryOrders.filter((d) => (d.shift_id === currentShiftId || !d.shift_id) && d.status !== 'CANCELLED')
    : deliveryOrders.filter((d) => d.status !== 'CANCELLED');
  const deliveredOrders = shiftDeliveries.filter((d) => d.status === 'DELIVERED');

  // 2. Faturamento: Realizado vs Em Aberto vs Projetado
  const salonClosedGross = closedTabs.reduce((sum, t) => sum + t.subtotal, 0);
  const salonOpenGross = openTabs.reduce((sum, t) => sum + t.subtotal, 0);
  const deliveryGross = deliveredOrders.reduce((sum, d) => sum + d.subtotal, 0);

  // Faturamento já fechado/recebido
  const realizedGrossRevenue = salonClosedGross + deliveryGross;
  // Faturamento total projetado (fechado + consumo em andamento no salão)
  const projectedGrossRevenue = realizedGrossRevenue + salonOpenGross;

  const totalClosedServiceFee = closedTabs.reduce((sum, t) => sum + t.service_fee, 0);
  const totalOpenServiceFee = openTabs.reduce((sum, t) => sum + (t.service_fee || 0), 0);
  const totalDiscounts = closedTabs.reduce((sum, t) => sum + t.discount, 0) + openTabs.reduce((sum, t) => sum + (t.discount || 0), 0);

  const projectedNetRevenue = projectedGrossRevenue + totalClosedServiceFee + totalOpenServiceFee - totalDiscounts;

  // 3. Clientes Presentes e Ticket Médio
  const currentPeopleInSalon = openTabs.reduce((sum, t) => sum + (t.people_count || 1), 0);
  const totalPeopleServed = closedTabs.reduce((sum, t) => sum + (t.people_count || 1), 0);
  const allPeopleTotal = currentPeopleInSalon + totalPeopleServed;

  const avgTicketPerTab = (closedTabs.length + openTabs.length) > 0
    ? projectedGrossRevenue / (closedTabs.length + openTabs.length)
    : 0;
  const avgTicketPerPerson = allPeopleTotal > 0
    ? projectedGrossRevenue / allPeopleTotal
    : 0;

  // Mesas aguardando conta
  const waitingBillTables = tables.filter((t) => t.status === 'AGUARDANDO_CONTA');

  // Fila de Produção e Impressoras Térmicas
  const pendingItems = orderItems.filter((i) => i.status === 'RECEIVED' || i.status === 'IN_PREPARATION');
  const pendingGrillCount = pendingItems.filter((i) => i.sector === 'GRILL').length;
  const pendingKitchenCount = pendingItems.filter((i) => i.sector === 'KITCHEN').length;
  const pendingPrintJobs = jobs.filter((j) => j.status === 'PENDING' || j.status === 'PRINTING').length;
  const printedJobsCount = jobs.filter((j) => j.status === 'PRINTED').length;

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

  // 5. Curva ABC dos Produtos Mais Vendidos (itens fechados + itens abertos do turno)
  const productSalesMap: Record<string, { name: string; category: string; qty: number; total: number }> = {};

  const activeOrderItems = currentShiftId
    ? orderItems.filter((i) => (i.shift_id === currentShiftId || !i.shift_id) && i.status !== 'CANCELLED')
    : orderItems.filter((i) => i.status !== 'CANCELLED');

  activeOrderItems.forEach((i) => {
    if (!productSalesMap[i.product_id]) {
      productSalesMap[i.product_id] = {
        name: i.product_name,
        category: i.sector === 'GRILL' ? 'Churrasqueira' : 'Cozinha/Salão',
        qty: 0,
        total: 0,
      };
    }
    productSalesMap[i.product_id]!.qty += i.quantity;
    productSalesMap[i.product_id]!.total += i.unit_price * i.quantity;
  });

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
    : stockMovements.filter((m) => m.movement_type === 'PERDA' || m.movement_type === 'DESCARTE');

  // 7. Feed de Movimentações em Tempo Real do Sistema
  type SystemEvent = {
    id: string;
    type: 'TAB_OPEN' | 'ORDER' | 'PRINT' | 'PAYMENT' | 'TAB_CLOSED' | 'STOCK_ALERT';
    time: string;
    title: string;
    description: string;
    tone: 'emerald' | 'amber' | 'sky' | 'purple' | 'rose';
  };

  const activityFeed: SystemEvent[] = [];

  // Eventos de Comandas Abertas
  tabs.forEach((tab) => {
    const table = tables.find((t) => t.id === tab.table_id);
    activityFeed.push({
      id: `tab-open-${tab.id}`,
      type: 'TAB_OPEN',
      time: tab.opened_at,
      title: `Comanda Aberta — Mesa ${table ? String(table.number).padStart(2, '0') : 'Balcão'}`,
      description: `${tab.customer_name || 'Sem nome'} (${tab.people_count} ${tab.people_count === 1 ? 'pessoa' : 'pessoas'})`,
      tone: 'emerald',
    });

    if (tab.status === 'CLOSED' && tab.closed_at) {
      activityFeed.push({
        id: `tab-close-${tab.id}`,
        type: 'TAB_CLOSED',
        time: tab.closed_at,
        title: `Comanda Encerrada — Mesa ${table ? String(table.number).padStart(2, '0') : 'Balcão'}`,
        description: `Total pago: ${formatBRL(tab.total)}`,
        tone: 'purple',
      });
    }
  });

  // Eventos de Pedidos Lançados
  orders.forEach((order) => {
    const table = tables.find((t) => t.id === order.table_id);
    const itemsSummary = (order.items || [])
      .map((item) => `${item.quantity}x ${item.product_name}${item.doneness ? ` (${formatDoneness(item.doneness)})` : ''}`)
      .join(', ');

    activityFeed.push({
      id: `order-${order.id}`,
      type: 'ORDER',
      time: order.created_at,
      title: `Pedido #${order.order_number} — Mesa ${table ? String(table.number).padStart(2, '0') : 'Balcão'}`,
      description: itemsSummary || 'Itens lançados',
      tone: 'amber',
    });
  });

  // Eventos de Impressão Térmica
  jobs.slice(0, 10).forEach((job) => {
    activityFeed.push({
      id: `print-${job.id}`,
      type: 'PRINT',
      time: job.created_at,
      title: `Impressão Térmica (${job.sector === 'GRILL' ? 'Churrasqueira' : 'Cozinha'})`,
      description: `Pedido #${job.order_number}${job.table_number ? ` (Mesa ${String(job.table_number).padStart(2, '0')})` : ''} • Status: ${job.status === 'PRINTED' ? 'Impresso' : 'Na fila'}${job.is_reprint ? ' [2ª VIA]' : ''}`,
      tone: 'sky',
    });
  });

  // Eventos de Pagamentos
  payments.forEach((payment) => {
    activityFeed.push({
      id: `pay-${payment.id}`,
      type: 'PAYMENT',
      time: payment.paid_at || new Date().toISOString(),
      title: `Pagamento Recebido (${payment.method})`,
      description: `${formatBRL(payment.amount)} registrado no Caixa`,
      tone: 'emerald',
    });
  });

  // Eventos de Estoque / Alertas
  shiftLossMovements.forEach((movement) => {
    activityFeed.push({
      id: `loss-${movement.id}`,
      type: 'STOCK_ALERT',
      time: movement.created_at,
      title: `${movement.movement_type === 'PERDA' ? 'Perda' : 'Descarte'}: ${movement.product_name || movement.product_id}`,
      description: `${movement.quantity} un • Motivo: ${movement.reason || 'Sem justificativa'}`,
      tone: 'rose',
    });
  });

  // Ordena feed por mais recente
  activityFeed.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  // Exportação CSV do Turno
  const handleExportCSV = () => {
    if (!currentShift) return;

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'RELATÓRIO DRE & FECHAMENTO DE TURNO - ESPETARIA SABOR DA CARNE\n';
    csvContent += `Turno;${currentShift.name};Data;${currentShift.date}\n`;
    csvContent += `Faturamento Realizado;${realizedGrossRevenue.toFixed(2)};Faturamento em Aberto;${salonOpenGross.toFixed(2)};Faturamento Projetado;${projectedGrossRevenue.toFixed(2)}\n`;
    csvContent += `Taxa Serviço;${(totalClosedServiceFee + totalOpenServiceFee).toFixed(2)};Descontos;${totalDiscounts.toFixed(2)};Faturamento Líquido;${projectedNetRevenue.toFixed(2)}\n\n`;

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
      <PageHeader
        eyebrow="Gestão da espetaria"
        title="Visão geral"
        description={
          <>
            Vendas, salão ao vivo, recebimentos e resultados em um só lugar.
            <span className="mt-1 block font-medium text-ink-secondary">
              {currentShift ? currentShift.name : 'Nenhum turno aberto no momento'}
            </span>
          </>
        }
        icon={ShieldCheck}
        actions={
          <>
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={!currentShift}
              className="btn-secondary"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Exportar relatório
            </button>
            {currentShift?.status === 'ABERTO' && (
              <button
                type="button"
                onClick={() => setIsCloseModalOpen(true)}
                className="btn-secondary text-rose-700 hover:border-rose-400 hover:bg-rose-50 hover:text-rose-800"
              >
                <Lock className="h-4 w-4" aria-hidden="true" />
                Fechar turno
              </button>
            )}
          </>
        }
      />

      {/* AVISO QUANDO O TURNO NÃO ESTÁ FORMALMENTE ABERTO */}
      {!currentShift && (
        <div className="notice border-amber-200 bg-amber-50 text-amber-900 flex flex-wrap items-center justify-between gap-3" role="status">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-700" />
            <span>
              O turno formal ainda não foi aberto. Você pode visualizar as comandas em andamento abaixo ou abrir o turno para conciliação do caixa.
            </span>
          </div>
          {onOpenShiftClick && (
            <button
              type="button"
              onClick={onOpenShiftClick}
              className="btn-primary py-1.5 px-3.5 text-xs font-bold shrink-0"
            >
              <Plus className="h-4 w-4" />
              Abrir Turno Agora
            </button>
          )}
        </div>
      )}

      {/* STAT CARDS: VISÃO INTEGRADA SALÃO + FATURAMENTO */}
      <div className="stat-grid">
        <StatCard
          label="Salão em atendimento"
          value={formatBRL(salonOpenGross)}
          hint={
            <>
              {openTabs.length} {openTabs.length === 1 ? 'comanda aberta' : 'comandas abertas'} • {currentPeopleInSalon} pessoas presentes
              {waitingBillTables.length > 0 && <span className="text-amber-800 font-bold block mt-0.5">⚠️ {waitingBillTables.length} aguardando conta</span>}
            </>
          }
          icon={ShoppingBag}
          tone="warning"
        />

        <StatCard
          label="Faturamento realizado"
          value={formatBRL(realizedGrossRevenue)}
          hint={
            <>
              Salão fechado: {formatBRL(salonClosedGross)}<br />
              Delivery concluído: {formatBRL(deliveryGross)}
            </>
          }
          icon={DollarSign}
          tone="success"
        />

        <StatCard
          label="Faturamento projetado"
          value={formatBRL(projectedGrossRevenue)}
          hint={
            <>
              Realizado ({formatBRL(realizedGrossRevenue)}) + Em aberto ({formatBRL(salonOpenGross)})<br />
              Ticket médio: {formatBRL(avgTicketPerTab)} / comanda • {formatBRL(avgTicketPerPerson)} / pessoa
            </>
          }
          icon={TrendingUp}
          tone="info"
        />

        <StatCard
          label="Produção & Impressão"
          value={`${pendingItems.length} itens`}
          hint={
            <>
              Churrasqueira: {pendingGrillCount} • Cozinha: {pendingKitchenCount}<br />
              Fila térmica: {pendingPrintJobs} pendentes / {printedJobsCount} impressos
            </>
          }
          icon={Printer}
        />
      </div>

      {/* SEÇÃO PRINCIPAL: COMANDAS ABERTAS NO SALÃO (INTERLIGAÇÃO AO VIVO) */}
      <div className="bg-surface-muted border border-line p-5 sm:p-6 rounded-2xl shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="w-5 h-5 text-brand-700" />
            <h2 className="text-base font-bold text-ink font-sans">
              Salão em atendimento ao vivo ({openTabs.length} {openTabs.length === 1 ? 'comanda' : 'comandas'})
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('waiter')}
                className="btn-secondary py-1 px-2.5 text-xs text-brand-800 font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                Novo Atendimento
              </button>
            )}
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('tables')}
                className="btn-secondary py-1 px-2.5 text-xs font-semibold"
              >
                Ver Mapa de Mesas
              </button>
            )}
          </div>
        </div>

        {openTabs.length === 0 ? (
          <div className="p-8 rounded-2xl bg-surface-muted text-center text-ink-muted text-sm space-y-3">
            <p>Nenhuma comanda aberta no momento. Todas as mesas estão livres ou as contas foram encerradas.</p>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('waiter')}
                className="btn-primary py-2 px-4 text-xs inline-flex items-center gap-2 mx-auto"
              >
                <Plus className="w-4 h-4" />
                Abrir Comanda no Módulo do Garçom
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {openTabs.map((tab) => {
              const table = tables.find((t) => t.id === tab.table_id);
              const isWaitingBill = table?.status === 'AGUARDANDO_CONTA';
              const tabOrders = orders.filter((o) => o.tab_id === tab.id);
              const itemCount = tabOrders.reduce((sum, o) => sum + (o.items || []).length, 0);

              return (
                <div
                  key={tab.id}
                  className={`p-4 rounded-2xl border transition shadow-sm space-y-3 ${
                    isWaitingBill
                      ? 'border-amber-300 bg-amber-50/40'
                      : 'border-line bg-surface-card hover:border-brand-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-ink tabular-nums">
                          Mesa {table ? String(table.number).padStart(2, '0') : 'Balcão'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            isWaitingBill
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {isWaitingBill ? 'Conta Solicitada' : 'Em Consumo'}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-ink-secondary mt-0.5">
                        {tab.customer_name || 'Cliente não identificado'}
                      </p>
                    </div>

                    <div className="text-right">
                      <div className="text-lg font-bold text-brand-800 tabular-nums">
                        {formatBRL(tab.total || tab.subtotal)}
                      </div>
                      <span className="text-xs text-ink-muted flex items-center justify-end gap-1">
                        <Clock className="w-3 h-3" />
                        {formatElapsedMinutes(tab.opened_at)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-ink-muted border-t border-line pt-2">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {tab.people_count || 1} {tab.people_count === 1 ? 'pessoa' : 'pessoas'}
                    </span>
                    <span>
                      {itemCount} {itemCount === 1 ? 'item lançado' : 'itens lançados'}
                    </span>
                  </div>

                  {/* Ações de Interligação Direta entre Telas */}
                  <div className="flex items-center gap-2 pt-1 border-t border-line">
                    {onNavigateTab && (
                      <button
                        type="button"
                        onClick={() => onNavigateTab('waiter')}
                        className="btn-secondary flex-1 py-1.5 px-2 text-xs font-semibold text-brand-800 justify-center"
                        title="Ir para o atendimento e lançar pedidos"
                      >
                        Lançar Pedido
                      </button>
                    )}
                    {onNavigateTab && (
                      <button
                        type="button"
                        onClick={() => onNavigateTab('cashier')}
                        className="btn-primary flex-1 py-1.5 px-2 text-xs font-semibold justify-center"
                        title="Ir para o Caixa para encerrar e receber"
                      >
                        Cobrar no Caixa
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SEÇÃO INTERMEDIÁRIA: FORMAS DE PAGAMENTO & CURVA ABC */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Distribuição por Meio de Pagamento */}
        <div className="bg-surface-muted border border-line p-5 sm:p-6 rounded-2xl shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
            <h2 className="text-sm font-bold text-ink flex items-center gap-2 font-sans">
              <PieChart className="w-4 h-4 text-emerald-700" />
              <span>Meios de Pagamento Recebidos</span>
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
              <span>Produtos mais pedidos no turno</span>
            </h2>
            <span className="text-xs text-ink-muted">Ranking por Faturamento Total</span>
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
                      Nenhum item lançado até o momento.
                    </td>
                  </tr>
                ) : (
                  topProducts.slice(0, 7).map((prod, idx) => {
                    const pct = projectedGrossRevenue > 0 ? (prod.total / projectedGrossRevenue) * 100 : 0;
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

      {/* FEED DE MOVIMENTAÇÕES EM TEMPO REAL DO SISTEMA */}
      <div className="bg-surface-muted border border-line p-5 sm:p-6 rounded-2xl shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-brand-700" />
            <h2 className="text-base font-bold text-ink font-sans">
              Feed de movimentações em tempo real
            </h2>
          </div>
          <span className="text-xs text-ink-muted">
            {activityFeed.length} {activityFeed.length === 1 ? 'evento registrado' : 'eventos registrados'}
          </span>
        </div>

        {activityFeed.length === 0 ? (
          <div className="p-6 rounded-2xl bg-surface-muted text-center text-ink-muted text-xs italic">
            Nenhuma atividade registrada até o momento no sistema.
          </div>
        ) : (
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {activityFeed.slice(0, 15).map((ev) => {
              const toneClass = {
                emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
                amber: 'border-amber-200 bg-amber-50 text-amber-800',
                sky: 'border-sky-200 bg-sky-50 text-sky-800',
                purple: 'border-purple-200 bg-purple-50 text-purple-800',
                rose: 'border-rose-200 bg-rose-50 text-rose-800',
              }[ev.tone];

              return (
                <div
                  key={ev.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl border border-line bg-surface hover:bg-surface-soft transition text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`px-2 py-1 rounded-lg border text-xs font-bold shrink-0 ${toneClass}`}>
                      {ev.title}
                    </span>
                    <p className="text-ink truncate font-medium">
                      {ev.description}
                    </p>
                  </div>
                  <span className="text-ink-muted tabular-nums shrink-0 text-xs">
                    {new Date(ev.time).toLocaleTimeString('pt-BR')}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* AUDITORIA DE QUEBRAS E PERDAS */}
      <div className="bg-surface-muted border border-line p-5 sm:p-6 rounded-2xl shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <PackageCheck className="w-5 h-5 text-red-700" />
            <h2 className="text-sm font-bold text-ink font-sans">
              Perdas e descartes operacionais
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
              {shiftsHistory.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-ink-muted">
                    Nenhum turno registrado no histórico.
                  </td>
                </tr>
              )}
              {shiftsHistory.map((shift) => (
                <tr key={shift.id} className="hover:bg-surface-muted transition">
                  <td className="py-3 font-semibold text-ink">{shift.name}</td>
                  <td className="py-3 tabular-nums text-ink-muted">{shift.date}</td>
                  <td className="py-3">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold tabular-nums ${
                        shift.status === 'ABERTO'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-surface-muted text-ink-muted border border-line'
                      }`}
                    >
                      {shift.status}
                    </span>
                  </td>
                  <td className="py-3 text-right tabular-nums text-ink-muted">
                    {formatBRL(shift.cash_drawer_start)}
                  </td>
                  <td className="py-3 text-right tabular-nums font-bold text-ink">
                    {shift.cash_drawer_end !== null ? formatBRL(shift.cash_drawer_end) : '—'}
                  </td>
                  <td className="py-3 text-right tabular-nums text-ink-muted italic max-w-xs truncate">
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
