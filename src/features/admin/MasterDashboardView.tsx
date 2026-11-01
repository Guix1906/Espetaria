import { VoidTabButton } from '../tables/VoidTabButton';
import { StockSnapshot } from './StockSnapshot';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bike,
  ChevronDown,
  Clock,
  Download,
  Flame,
  Lock,
  MessageSquare,
  PackageCheck,
  PieChart,
  Plus,
  ShieldCheck,
  Store,
  TrendingUp,
  UtensilsCrossed,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import type { ActiveTab } from '../../components/layout/navigation';
import { PageHeader } from '../../components/ui/PageHeader';
import { formatBRL, formatElapsedMinutes } from '../../lib/formatters';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { useDeliveryStore } from '../../stores/useDeliveryStore';
import { useNavFocusStore } from '../../stores/useNavFocusStore';
import { usePrintStore } from '../../stores/usePrintStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useStockStore } from '../../stores/useStockStore';
import { useTableStore } from '../../stores/useTableStore';
import type { DeliveryOrder } from '../../types/domain';
import { computeDashboard, stageOf, type DashboardAlert, type DeliveryStage } from './dashboardMetrics';
import { ShiftCloseModal } from './ShiftCloseModal';

interface MasterDashboardViewProps {
  onNavigateTab?: (tab: ActiveTab) => void;
  onOpenShiftClick?: () => void;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const STAGES: { key: DeliveryStage; label: string }[] = [
  { key: 'AWAITING_PAYMENT', label: 'Aguardando PIX' },
  { key: 'IN_PRODUCTION', label: 'Na brasa' },
  { key: 'READY', label: 'Pronto' },
  { key: 'OUT_FOR_DELIVERY', label: 'Saiu para entrega' },
];
const STAGE_LABEL: Record<DeliveryStage, string> = Object.fromEntries(STAGES.map((s) => [s.key, s.label])) as Record<DeliveryStage, string>;
const card = 'rounded-2xl border border-line bg-surface p-4 sm:p-5';
const RECEIVED = [
  ['PIX', 'PIX', 'bg-emerald-600'],
  ['CREDITO', 'Cartão de crédito', 'bg-brand-500'],
  ['DEBITO', 'Cartão de débito', 'bg-tinta-700'],
  ['DINHEIRO', 'Dinheiro', 'bg-amber-500'],
  ['CARTAO_ENTREGA', 'Cartão na entrega', 'bg-brand-300'],
] as const;

const BOT_CANNED_REPLIES = [
  'Ainda não consigo ouvir áudios nem ver imagens por aqui. Pode me escrever sua dúvida?',
  'Vou chamar alguém da equipe para te ajudar, só um instante.',
];

export const MasterDashboardView: React.FC<MasterDashboardViewProps> = ({ onNavigateTab, onOpenShiftClick }) => {
  const { currentShift } = useShiftStore();
  const { tables, tabs, orders, orderItems, payments } = useTableStore();
  const { deliveryOrders } = useDeliveryStore();
  const { dailyPrepStock, stockMovements, products } = useStockStore();
  const { jobs } = usePrintStore();

  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [feedFilter, setFeedFilter] = useState<'Tudo' | 'Casa' | 'Delivery'>('Tudo');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  // Última falha do robô do WhatsApp (gravada pela Edge Function whatsapp-bot)
  const [botErrorAt, setBotErrorAt] = useState<string | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    const load = async () => {
      const { data } = await supabase
        .from('audit_logs')
        .select('created_at')
        .eq('action', 'WHATSAPP_BOT_ERRO')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      let errorAt: string | null = data?.created_at ?? null;
      if (errorAt) {
        const { data: replies } = await supabase
          .from('whatsapp_bot_messages')
          .select('body')
          .eq('direction', 'BOT')
          .gt('created_at', errorAt)
          .limit(20);
        if ((replies ?? []).some((r) => !BOT_CANNED_REPLIES.includes(r.body))) errorAt = null;
      }
      if (alive) setBotErrorAt(errorAt);
    };
    void load();
    const id = window.setInterval(() => void load(), 60000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const d = computeDashboard({
    shiftId: currentShift?.id ?? null,
    tables,
    tabs,
    orders,
    orderItems,
    payments,
    deliveryOrders,
    stockMovements,
    jobs,
    printerMonitored: isSupabaseConfigured,
    now,
    botErrorAt,
  });

  const go = (tab: ActiveTab) => onNavigateTab?.(tab);
  const goAlert = (target: DashboardAlert['target']) => {
    if (target !== 'ready') return go(target);
    useNavFocusStore.getState().focusReady();
    go('waiter');
  };
  const goTable = (tableId: string, tab: ActiveTab) => {
    useNavFocusStore.getState().focusTable(tableId);
    go(tab);
  };

  const activeDeliveries = (Object.values(d.stages).flat() as DeliveryOrder[]).sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );
  const lateIds = new Set(d.lateDeliveries.map((o) => o.id));
  const feed = d.feed.filter(
    (e) =>
      feedFilter === 'Tudo' ||
      (feedFilter === 'Casa' ? e.channel === 'Casa' : e.channel === 'Delivery' || e.channel === 'Retirada')
  );

  // Compartilhar Resumo do Turno no WhatsApp do Dono
  const handleShareWhatsApp = () => {
    if (!currentShift) return;
    const text = `*Espetaria Sabor da Carne - Resumo do Turno*\n` +
      `📅 Turno: ${currentShift.name} (${currentShift.date})\n\n` +
      `💰 *Faturamento Total:* ${formatBRL(d.revenue.realized)}\n` +
      `⏳ *Em Andamento:* ${formatBRL(d.revenue.inProgress)}\n` +
      `🎯 *Projetado:* ${formatBRL(d.revenue.projected)}\n\n` +
      `💳 *Formas de Pagamento Recebidas:*\n` +
      `• PIX: ${formatBRL(d.received.PIX)}\n` +
      `• Crédito: ${formatBRL(d.received.CREDITO)}\n` +
      `• Débito: ${formatBRL(d.received.DEBITO)}\n` +
      `• Dinheiro: ${formatBRL(d.received.DINHEIRO)}\n\n` +
      `🍽️ *Salão:* ${d.salon.openTabs.length} mesas abertas · ${d.salon.closedTabs.length} fechadas\n` +
      `🛵 *Delivery:* ${d.delivery.count} pedidos`;

    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  };

  // Exportação CSV do turno
  const handleExportCSV = () => {
    if (!currentShift) return;
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
      [
        '',
        money(d.received.PIX),
        money(d.received.CREDITO),
        money(d.received.DEBITO),
        money(d.received.DINHEIRO),
        money(d.received.CARTAO_ENTREGA),
        money(d.receivedTotal),
      ],
      [],
      ['Produto', 'Canais', 'Quantidade', 'Faturamento'],
      ...d.topProducts.map((p) => [p.name, p.channels, p.qty, money(p.total)]),
      [],
      ['Estoque', 'Inicial', 'Atual', 'Ajustes', 'Contagem física', 'Diferença'],
      ...dailyPrepStock.map((s) => [
        products.find((p) => p.id === s.product_id)?.name || s.product_id,
        s.initial_quantity,
        s.current_quantity,
        s.adjusted_quantity,
        s.last_counted_quantity ?? '-',
        s.count_difference ?? '-',
      ]),
    ];
    const csv =
      '﻿' +
      rows
        .map((r) =>
          r
            .map((c) => {
              const v = String(c);
              return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
            })
            .join(';')
        )
        .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `Turno_${currentShift.date}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const actionBtn = 'btn-secondary min-h-[40px] px-3 text-xs font-semibold';

  // Mesas ordenadas com as que pediram conta no topo
  const sortedTabs = [...d.salon.openTabs].sort((a, b) => {
    const tableA = tables.find((t) => t.id === a.table_id);
    const tableB = tables.find((t) => t.id === b.table_id);
    const waitingA = tableA?.status === 'AGUARDANDO_CONTA' ? 1 : 0;
    const waitingB = tableB?.status === 'AGUARDANDO_CONTA' ? 1 : 0;
    if (waitingA !== waitingB) return waitingB - waitingA;
    return a.opened_at.localeCompare(b.opened_at);
  });

  return (
    <div className="page-layout space-y-5">
      {/* CABEÇALHO DO GESTOR */}
      <PageHeader
        eyebrow="Painel do Gestor"
        title="Visão geral"
        description={
          <>
            Centro de controle operacional e financeiro da espetaria.
            <span className="mt-1 block font-medium text-ink-secondary">
              {currentShift ? `Turno: ${currentShift.name} (${currentShift.date})` : 'Turno fechado'}
            </span>
          </>
        }
        icon={ShieldCheck}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleShareWhatsApp}
              disabled={!currentShift}
              className="btn-secondary min-h-[40px] text-xs font-bold text-emerald-800 hover:bg-emerald-50"
              title="Compartilhar fechamento do turno no WhatsApp"
            >
              <MessageSquare className="h-4 w-4 text-emerald-600" />
              <span>Resumo WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={!currentShift}
              className="btn-secondary min-h-[40px] text-xs font-semibold"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>Exportar</span>
            </button>
            {currentShift?.status === 'ABERTO' && (
              <button
                type="button"
                onClick={() => setIsCloseModalOpen(true)}
                className="btn-secondary min-h-[40px] text-xs font-bold text-rose-700 hover:bg-rose-50 hover:text-rose-800"
              >
                <Lock className="h-4 w-4" aria-hidden="true" />
                <span>Fechar turno</span>
              </button>
            )}
          </div>
        }
      />

      {/* AVISO QUANDO O TURNO ESTÁ FECHADO */}
      {!currentShift && (
        <div className="notice flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50 text-amber-900" role="status">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-700" />
            <span className="text-sm font-medium">Turno fechado. Abra o turno para lançar pedidos no salão e delivery.</span>
          </div>
          {onOpenShiftClick && (
            <button type="button" onClick={onOpenShiftClick} className="btn-primary min-h-[40px] shrink-0 text-xs font-bold">
              <Plus className="h-4 w-4" />
              <span>Abrir turno</span>
            </button>
          )}
        </div>
      )}

      {/* ALERTAS OPERACIONAIS EM DESTAQUE */}
      {d.alerts.length > 0 && (
        <section aria-label="Alertas" className="space-y-2">
          {d.alerts.map((alert) => (
            <button
              key={alert.id}
              type="button"
              onClick={() => goAlert(alert.target)}
              className={`flex min-h-[42px] w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-left text-sm font-semibold transition ${
                alert.tone === 'danger'
                  ? 'border-rose-300 bg-rose-50 text-rose-950 hover:bg-rose-100/80'
                  : 'border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100/80'
              }`}
            >
              <AlertTriangle className={`h-5 w-5 shrink-0 ${alert.tone === 'danger' ? 'text-rose-600' : 'text-amber-600'}`} aria-hidden="true" />
              <span className="flex-1">{alert.text}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
            </button>
          ))}
        </section>
      )}

      {/* 4 CARDS SUPERIORES EXECUTIVOS */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo do turno">
        <button
          type="button"
          onClick={() => go('finance')}
          disabled={!onNavigateTab}
          className={`${card} text-left transition hover:border-brand-500`}
        >
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Faturado Hoje</p>
          <p className="mt-1 font-mono text-2xl font-bold text-ink sm:text-3xl">{formatBRL(d.revenue.realized)}</p>
          <p className="mt-1 text-xs text-ink-muted">+ {formatBRL(d.revenue.inProgress)} em aberto</p>
        </button>

        <button
          type="button"
          onClick={() => go('tables')}
          disabled={!onNavigateTab}
          className={`${card} text-left transition hover:border-brand-500`}
        >
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Mesas Ativas</p>
          <p className="mt-1 font-mono text-2xl font-bold text-ink sm:text-3xl">{d.salon.openTabs.length}</p>
          <p className="mt-1 text-xs text-ink-muted">
            {d.salon.people} {d.salon.people === 1 ? 'pessoa' : 'pessoas'}
            {d.salon.waitingBill.length ? ` · ${d.salon.waitingBill.length} pediram a conta` : ''}
          </p>
        </button>

        <button
          type="button"
          onClick={() => go('kds')}
          disabled={!onNavigateTab}
          className={`${card} text-left transition hover:border-brand-500`}
        >
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Na Brasa</p>
          <p className="mt-1 font-mono text-2xl font-bold text-ink sm:text-3xl">
            {d.production.GRILL.salon + d.production.GRILL.delivery}
          </p>
          <p className="mt-1 text-xs text-ink-muted">espetos no fogo · {d.productionTotal} un em preparo</p>
        </button>

        <button
          type="button"
          onClick={() => go('delivery')}
          disabled={!onNavigateTab}
          className={`${card} text-left transition ${
            lateIds.size ? 'border-rose-300 bg-rose-50/70' : 'hover:border-brand-500'
          }`}
        >
          <p className={`text-xs font-semibold uppercase tracking-wider ${lateIds.size ? 'text-rose-800' : 'text-ink-muted'}`}>
            Delivery & Retirada
          </p>
          <p className={`mt-1 font-mono text-2xl font-bold sm:text-3xl ${lateIds.size ? 'text-rose-700' : 'text-ink'}`}>
            {activeDeliveries.length}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {lateIds.size > 0 ? `${lateIds.size} atrasado(s)` : 'todos no prazo previsto'}
          </p>
        </button>
      </section>

      {/* PAINEL PRINCIPAL: GRADE EM 2 COLUNAS EXECUTIVAS */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* COLUNA ESQUERDA (7 colunas): OPERAÇÃO EM TEMPO REAL */}
        <div className="space-y-5 lg:col-span-7">
          {/* BLOCO 1: CASA AGORA - MESAS EM ATENDIMENTO */}
          <div id="now-salon" className={card}>
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <UtensilsCrossed className="h-5 w-5 text-brand-700" />
                <h3 className="font-bold text-ink text-base">Casa agora — Mesas ativas ({sortedTabs.length})</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-ink-muted">Total: {formatBRL(d.salon.open)}</span>
                {onNavigateTab && (
                  <button type="button" onClick={() => go('waiter')} className={actionBtn}>
                    <Plus className="h-3.5 w-3.5" />
                    <span>Nova mesa</span>
                  </button>
                )}
              </div>
            </div>

            {sortedTabs.length === 0 ? (
              <div className="py-8 text-center text-sm text-ink-muted">
                Nenhuma mesa em atendimento no momento.
              </div>
            ) : (
              <div className="divide-y divide-line pt-1">
                {sortedTabs.map((tab) => {
                  const table = tables.find((t) => t.id === tab.table_id);
                  const info = d.tabInfo(tab);
                  const waiting = table?.status === 'AGUARDANDO_CONTA';
                  const tabTotal = tab.total || tab.subtotal;

                  return (
                    <div
                      key={tab.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 transition ${
                        waiting ? 'bg-amber-50/60 -mx-3 px-3 rounded-xl border border-amber-200 my-1' : ''
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-base font-bold text-ink">
                            Mesa {table ? pad2(table.number) : '01'}
                          </span>
                          {waiting ? (
                            <span className="status-badge bg-rose-600 text-white font-bold text-[11px] animate-pulse">
                              Conta pedida
                            </span>
                          ) : (
                            <span className="status-badge bg-emerald-100 text-emerald-800 text-[11px]">
                              Em consumo
                            </span>
                          )}
                          <span className="text-xs text-ink-muted truncate">
                            {tab.customer_name && tab.customer_name !== `Mesa ${table?.number}` ? tab.customer_name : 'Cliente'}
                            {tab.people_count > 1 ? ` · ${tab.people_count} pessoas` : ''}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-ink-muted">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatElapsedMinutes(tab.opened_at, now)}
                          </span>
                          <span>·</span>
                          <span>{info.itemCount ? `${info.itemCount} itens` : 'Sem pedidos'}</span>
                          {info.ready > 0 && (
                            <span className="font-semibold text-emerald-700">· {info.ready} pronto(s)</span>
                          )}
                          {info.preparing > 0 && (
                            <span className="text-amber-800">· {info.preparing} na brasa</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono text-base font-bold text-ink">{formatBRL(tabTotal)}</span>
                        {onNavigateTab && table && (
                          <div className="flex items-center gap-1.5">
                            {waiting ? (
                              <button
                                type="button"
                                onClick={() => goTable(table.id, 'cashier')}
                                className="btn-primary min-h-[36px] py-1 px-3 text-xs font-bold bg-brand-700 hover:bg-brand-800"
                              >
                                Cobrar
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => goTable(table.id, 'waiter')}
                                className="btn-secondary min-h-[36px] py-1 px-2.5 text-xs font-semibold"
                              >
                                Pedidos
                              </button>
                            )}
                            <VoidTabButton tab={tab} tableNumber={table.number} compact />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* BLOCO 2: DELIVERY E RETIRADA AGORA */}
          <div id="now-delivery" className={card}>
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <Bike className="h-5 w-5 text-brand-700" />
                <h3 className="font-bold text-ink text-base">Delivery e retirada agora ({activeDeliveries.length})</h3>
              </div>
              {onNavigateTab && (
                <button type="button" onClick={() => go('delivery')} className={actionBtn}>
                  Abrir delivery
                </button>
              )}
            </div>

            {/* Pílulas de etapas */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 pt-3 pb-2 text-xs">
              {STAGES.map((s) => (
                <div key={s.key} className="rounded-xl border border-line bg-surface-soft p-2.5 text-center">
                  <p className="text-[11px] text-ink-muted">{s.label}</p>
                  <p className="font-mono text-lg font-bold text-ink mt-0.5">{d.stages[s.key].length}</p>
                </div>
              ))}
            </div>

            {activeDeliveries.length === 0 ? (
              <p className="py-4 text-center text-xs text-ink-muted">Nenhum pedido de delivery ou retirada em andamento.</p>
            ) : (
              <ul className="divide-y divide-line pt-2">
                {activeDeliveries.slice(0, 6).map((o) => {
                  const late = lateIds.has(o.id);
                  const stage = stageOf(o);
                  return (
                    <li key={o.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-ink">#{o.order_number}</span>
                          <span className="font-semibold text-ink truncate">{o.customer_name}</span>
                          {late && <span className="status-badge bg-rose-600 text-white text-[10px]">Atrasado</span>}
                        </div>
                        <p className="text-ink-muted text-[11px] mt-0.5 truncate">
                          {o.order_type === 'PICKUP' ? 'Retirada no balcão' : `Entrega: ${o.address_neighborhood || 'Sem bairro'}`} ·{' '}
                          {stage ? STAGE_LABEL[stage] : 'Em preparo'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono font-bold text-ink">{formatBRL(o.total)}</p>
                        <p className="text-[11px] text-ink-muted">{formatElapsedMinutes(o.created_at, now)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* BLOCO 3: PRODUÇÃO AGORA */}
          <div id="prod-title" className={card}>
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-brand-700" />
                <h3 className="font-bold text-ink text-base">Produção agora ({d.productionTotal} un)</h3>
              </div>
              {onNavigateTab && (
                <button type="button" onClick={() => go('kds')} className={actionBtn}>
                  Abrir KDS
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 pt-3 text-xs">
              <div className="rounded-xl border border-line bg-surface-soft p-2.5">
                <p className="text-[11px] text-ink-muted">Churrasqueira</p>
                <p className="font-mono text-xl font-bold text-ink mt-0.5">
                  {d.production.GRILL.salon + d.production.GRILL.delivery}
                </p>
                <p className="text-[10px] text-ink-muted mt-0.5">
                  {d.production.GRILL.salon} salão · {d.production.GRILL.delivery} delivery
                </p>
              </div>

              <div className="rounded-xl border border-line bg-surface-soft p-2.5">
                <p className="text-[11px] text-ink-muted">Cozinha & Cubas</p>
                <p className="font-mono text-xl font-bold text-ink mt-0.5">
                  {d.production.KITCHEN.salon + d.production.KITCHEN.delivery}
                </p>
                <p className="text-[10px] text-ink-muted mt-0.5">acompanhamentos</p>
              </div>

              <div className="rounded-xl border border-line bg-surface-soft p-2.5">
                <p className="text-[11px] text-ink-muted">Bar (Bebidas)</p>
                <p className="font-mono text-xl font-bold text-ink mt-0.5">
                  {d.production.BAR.salon + d.production.BAR.delivery}
                </p>
                <p className="text-[10px] text-ink-muted mt-0.5">frias / drinks</p>
              </div>

              <div className="rounded-xl border border-line bg-surface-soft p-2.5">
                <p className="text-[11px] text-ink-muted">Impressão Térmica</p>
                <p className="font-mono text-base font-bold text-ink mt-1 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-600" />
                  Operacional
                </p>
                <p className="text-[10px] text-ink-muted mt-0.5">PC da Loja conectado</p>
              </div>
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA (5 colunas): FINANÇAS & CONTROLE DE CARNES */}
        <div className="space-y-5 lg:col-span-5">
          {/* BLOCO 4: FATURAMENTO DO TURNO */}
          <div id="revenue-title" className={card}>
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-brand-700" />
                <h3 className="font-bold text-ink text-base">Faturamento do turno</h3>
              </div>
              <span className="font-mono text-xs font-bold text-ink-muted">
                Projetado: {formatBRL(d.revenue.projected)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-3 text-xs">
              <div className="rounded-xl border border-line bg-surface-soft p-3">
                <p className="text-ink-muted text-[11px]">Realizado (Recebido)</p>
                <p className="font-mono text-xl font-bold text-emerald-800 mt-0.5">{formatBRL(d.revenue.realized)}</p>
                <p className="text-[10px] text-ink-muted mt-0.5">mesas fechadas e entregas</p>
              </div>
              <div className="rounded-xl border border-line bg-surface-soft p-3">
                <p className="text-ink-muted text-[11px]">Em Andamento</p>
                <p className="font-mono text-xl font-bold text-ink mt-0.5">{formatBRL(d.revenue.inProgress)}</p>
                <p className="text-[10px] text-ink-muted mt-0.5">mesas abertas no salão</p>
              </div>
            </div>

            {/* Tabela de canais resumida */}
            <div className="pt-3">
              <table className="data-table w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>Canal</th>
                    <th className="text-right">Pedidos</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="font-medium flex items-center gap-1.5">
                      <Store className="h-3.5 w-3.5 text-ink-muted" /> Salão
                    </td>
                    <td className="text-right font-mono">{d.salon.openTabs.length + d.salon.closedTabs.length}</td>
                    <td className="text-right font-mono font-semibold">{formatBRL(d.salon.closed + d.salon.open)}</td>
                  </tr>
                  <tr>
                    <td className="font-medium flex items-center gap-1.5">
                      <Bike className="h-3.5 w-3.5 text-ink-muted" /> Delivery
                    </td>
                    <td className="text-right font-mono">{d.delivery.count}</td>
                    <td className="text-right font-mono font-semibold">{formatBRL(d.delivery.gross)}</td>
                  </tr>
                  <tr>
                    <td className="font-medium flex items-center gap-1.5">
                      <PackageCheck className="h-3.5 w-3.5 text-ink-muted" /> Retirada
                    </td>
                    <td className="text-right font-mono">{d.pickup.count}</td>
                    <td className="text-right font-mono font-semibold">{formatBRL(d.pickup.gross)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Distribuição por forma de pagamento */}
            <div className="pt-4 border-t border-line space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Entradas por forma de pagamento</p>
              {RECEIVED.map(([key, label, color]) => {
                const amount = d.received[key];
                const pct = d.receivedTotal > 0 ? (amount / d.receivedTotal) * 100 : 0;
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-ink">
                        <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
                        {label}
                      </span>
                      <span className="font-mono font-bold text-ink">
                        {formatBRL(amount)} <span className="text-[10px] text-ink-muted font-normal">({pct.toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* BLOCO 5: ESTOQUE CRÍTICO / ESPETOS DISPONÍVEIS */}
          <StockSnapshot onOpenStock={onNavigateTab ? () => onNavigateTab('stock') : undefined} />

          {/* BLOCO 6: MAIS VENDIDOS NO TURNO */}
          <div id="pay-title" className={card}>
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <PieChart className="h-5 w-5 text-brand-700" />
                <h3 className="font-bold text-ink text-base">Mais vendidos da noite</h3>
              </div>
            </div>

            {d.topProducts.length === 0 ? (
              <p className="py-6 text-center text-xs text-ink-muted">Nenhum espeto vendido ainda no turno.</p>
            ) : (
              <ul className="divide-y divide-line pt-2">
                {d.topProducts.slice(0, 5).map((p, idx) => (
                  <li key={p.name} className="flex items-center justify-between py-2 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-mono font-bold text-ink-muted text-sm">{idx + 1}.</span>
                      <span className="font-semibold text-ink truncate">{p.name}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono font-bold text-ink">{p.qty} un</span>
                      <span className="text-ink-muted text-[11px] ml-2">({formatBRL(p.total)})</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* BLOCO 7: PERDAS E DESCARTES (SE HOUVER) */}
          {d.losses.length > 0 && (
            <div id="loss-title" className={`${card} border-rose-200 bg-rose-50/40`}>
              <div className="flex items-center justify-between border-b border-rose-200 pb-2">
                <div className="flex items-center gap-2">
                  <PackageCheck className="h-4 w-4 text-rose-700" />
                  <h4 className="font-bold text-rose-950 text-sm">Perdas e descartes ({d.losses.length})</h4>
                </div>
              </div>
              <ul className="divide-y divide-rose-200/60 pt-1 text-xs">
                {d.losses.map((m) => (
                  <li key={m.id} className="flex justify-between py-1.5 text-rose-950">
                    <span>{m.product_name || 'Espeto'} ({m.reason || 'Descarte'})</span>
                    <span className="font-mono font-bold text-rose-700">{m.quantity} un</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* BLOCO 8: MOVIMENTAÇÕES DO TURNO (RECOLHÍVEL PARA NÃO POLUIR) */}
          <details id="feed-title" className={`${card} group`}>
            <summary className="flex cursor-pointer items-center justify-between text-xs font-semibold text-ink-muted list-none">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-ink-muted" />
                Movimentações do turno ({feed.length})
              </span>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-3 pt-3 border-t border-line space-y-2">
              <div className="flex gap-1" role="group">
                {(['Tudo', 'Casa', 'Delivery'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFeedFilter(f)}
                    className={`px-2.5 py-1 rounded text-xs font-semibold border ${
                      feedFilter === f ? 'bg-ink text-white border-ink' : 'bg-surface text-ink border-line'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <ul className="max-h-56 space-y-1 overflow-y-auto text-xs">
                {feed.slice(0, 15).map((ev) => (
                  <li key={ev.id} className="flex items-start gap-2 py-1 text-ink-muted">
                    <span className="font-mono text-[11px]">{new Date(ev.time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="text-ink truncate">{ev.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </div>
      </div>

      <ShiftCloseModal isOpen={isCloseModalOpen} onClose={() => setIsCloseModalOpen(false)} />
    </div>
  );
};
