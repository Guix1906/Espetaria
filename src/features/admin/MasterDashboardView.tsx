import { StatusTag } from '../../components/ui/StatusTag';
import { VoidTabButton } from '../tables/VoidTabButton';
import { StockSnapshot } from './StockSnapshot';
import { LiveBoard } from './LiveBoard';
import { AlertCircle, AlertTriangle, ArrowRight, Bike, ChevronDown, Clock, Download, Flame, Lock, PackageCheck, PieChart, Plus, ShieldCheck, Store, TrendingUp, UtensilsCrossed } from 'lucide-react';
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
import { ALERT_LIMITS, computeDashboard, stageOf, type ActivityEvent, type DashboardAlert, type DeliveryStage } from './dashboardMetrics';
import { ShiftCloseModal } from './ShiftCloseModal';

interface MasterDashboardViewProps {
  onNavigateTab?: (tab: ActiveTab) => void;
  onOpenShiftClick?: () => void;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const STAGES: { key: DeliveryStage; label: string }[] = [
  { key: 'AWAITING_PAYMENT', label: 'Aguardando PIX' },
  { key: 'IN_PRODUCTION', label: 'Em preparo' },
  { key: 'READY', label: 'Pronto' },
  { key: 'OUT_FOR_DELIVERY', label: 'Saiu para entrega' },
];
const STAGE_LABEL: Record<DeliveryStage, string> = Object.fromEntries(STAGES.map((s) => [s.key, s.label])) as Record<DeliveryStage, string>;
const TONE: Record<ActivityEvent['tone'], string> = {
  success: 'bg-emerald-50 text-emerald-800',
  warning: 'bg-amber-50 text-amber-900',
  info: 'bg-sky-50 text-ink',
  danger: 'bg-rose-50 text-rose-800',
  neutral: 'bg-surface-muted text-ink',
};
const card = 'rounded-2xl border border-line bg-surface p-4 sm:p-5';
/** Cada forma de pagamento com uma cor própria da paleta. */
const RECEIVED = [['PIX', 'PIX', 'bg-emerald-600'], ['CREDITO', 'Cartão de crédito', 'bg-brand-500'], ['DEBITO', 'Cartão de débito', 'bg-tinta-700'], ['DINHEIRO', 'Dinheiro', 'bg-amber-500'], ['CARTAO_ENTREGA', 'Cartão na entrega', 'bg-brand-300']] as const;
/** Respostas fixas do robô (sem IA), iguais a MEDIA_REPLY/HANDOFF_FALLBACK em supabase/functions/whatsapp-bot/logic.ts. */
const BOT_CANNED_REPLIES = [
  'Ainda não consigo ouvir áudios nem ver imagens por aqui. Pode me escrever sua dúvida?',
  'Vou chamar alguém da equipe para te ajudar, só um instante.',
];
const sectionTitle ='flex items-center gap-2 text-base font-semibold text-ink';

export const MasterDashboardView: React.FC<MasterDashboardViewProps> = ({ onNavigateTab, onOpenShiftClick }) => {
  const { currentShift } = useShiftStore();
  const { tables, tabs, orders, orderItems, payments } = useTableStore();
  const { deliveryOrders } = useDeliveryStore();
  const { dailyPrepStock, stockMovements, products } = useStockStore();
  const { jobs } = usePrintStore();
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [feedFilter, setFeedFilter] = useState<'Tudo' | 'Casa' | 'Delivery'>('Tudo');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(id); }, []);

  // Última falha do robô do WhatsApp (gravada pela Edge Function whatsapp-bot)
  const [botErrorAt, setBotErrorAt] = useState<string | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    const load = async () => {
      const { data } = await supabase.from('audit_logs').select('created_at').eq('action', 'WHATSAPP_BOT_ERRO')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      let errorAt: string | null = data?.created_at ?? null;
      if (errorAt) {
        // Robô já respondeu com a IA depois da falha: o alerta some
        const { data: replies } = await supabase.from('whatsapp_bot_messages').select('body')
          .eq('direction', 'BOT').gt('created_at', errorAt).limit(20);
        if ((replies ?? []).some((r) => !BOT_CANNED_REPLIES.includes(r.body))) errorAt = null;
      }
      if (alive) setBotErrorAt(errorAt);
    };
    void load();
    const id = window.setInterval(() => void load(), 60000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  const d = computeDashboard({ shiftId: currentShift?.id ?? null, tables, tabs, orders, orderItems, payments, deliveryOrders, stockMovements, jobs, printerMonitored: isSupabaseConfigured, now, botErrorAt });
  const go = (tab: ActiveTab) => onNavigateTab?.(tab);
  const goAlert = (target: DashboardAlert['target']) => {
    if (target !== 'ready') return go(target);
    useNavFocusStore.getState().focusReady();
    go('waiter');
  };
  const goTable =(tableId: string, tab: ActiveTab) => { useNavFocusStore.getState().focusTable(tableId); go(tab); };
  const activeDeliveries = (Object.values(d.stages).flat() as DeliveryOrder[]).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const lateIds = new Set(d.lateDeliveries.map((o) => o.id));
  const feed = d.feed.filter((e) => feedFilter === 'Tudo' || (feedFilter === 'Casa' ? e.channel === 'Casa' : e.channel === 'Delivery' || e.channel === 'Retirada'));

  // Exportação do turno (Excel abre com acentos: BOM + ponto e vírgula)
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
      ['Taxa de serviço', money(d.salon.serviceFee), 'Taxas de entrega', money(d.delivery.fees), 'Descontos', money(d.salon.discounts)],
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

  const Metric = ({ label, value, hint, warn }: { label: string; value: React.ReactNode; hint?: React.ReactNode; warn?: boolean }) => (
    <div className={`rounded-md border px-3 py-2.5 ${warn ? 'border-amber-300 bg-amber-50' : 'border-line bg-surface-soft'}`}>
      <p className="text-[13px] text-ink-muted">{label}</p>
      <p className={`mt-0.5 font-mono text-xl font-bold ${warn ? 'text-amber-900' : 'text-ink'}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[13px] text-ink-muted">{hint}</p>}
    </div>
  );

  /** Bloco recolhível: o topo fica enxuto e o detalhe abre quando precisar. */
  const Block = ({ id, title, icon: Icon, summary, action, children, defaultOpen = false }: { id: string; title: string; icon: typeof Clock; summary?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) => (
    <details className={`${card} group`} open={defaultOpen} aria-labelledby={id}>
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <h2 id={id} className={sectionTitle}><Icon className="h-5 w-5 text-brand-700" aria-hidden="true" />{title}</h2>
        <span className="flex items-center gap-2 text-sm text-ink-muted">{summary}<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" /></span>
      </summary>
      <div className="mt-3 space-y-3">
        {action && <div className="flex justify-end">{action}</div>}
        {children}
      </div>
    </details>
  );
  const actionBtn = 'btn-secondary min-h-[44px] px-3.5 text-sm';

  return (
    <div className="page-layout">
      <PageHeader
        eyebrow="Gestão da espetaria"
        title="Visão geral"
        description={<>O que está acontecendo agora na casa e no delivery.<span className="mt-1 block font-medium text-ink-secondary">{currentShift ? currentShift.name : 'Turno fechado'}</span></>}
        icon={ShieldCheck}
        actions={<>
          <button type="button" onClick={handleExportCSV} disabled={!currentShift} className="btn-secondary min-h-[44px]"><Download className="h-4 w-4" aria-hidden="true" />Exportar</button>
          {currentShift?.status === 'ABERTO' && <button type="button" onClick={() => setIsCloseModalOpen(true)} className="btn-secondary min-h-[44px] text-rose-700 hover:bg-rose-50 hover:text-rose-800"><Lock className="h-4 w-4" aria-hidden="true" />Fechar turno</button>}
        </>}
      />

      {!currentShift && (
        <div className="notice flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50 text-amber-900" role="status">
          <div className="flex items-center gap-2.5"><AlertCircle className="h-5 w-5 shrink-0 text-amber-700" /><span>Turno fechado. Abra o turno para lançar pedidos e conferir o caixa no fechamento.</span></div>
          {onOpenShiftClick && <button type="button" onClick={onOpenShiftClick} className="btn-primary min-h-[44px] shrink-0 text-[15px]"><Plus className="h-4 w-4" />Abrir turno</button>}
        </div>
      )}

      {/* ALERTAS: só aparecem quando há algo para resolver */}
      {d.alerts.length > 0 && (
        <section aria-label="Alertas" className="space-y-2">
          {d.alerts.map((alert) => (
            <button key={alert.id} type="button" onClick={() => goAlert(alert.target)}
              className={`flex min-h-[44px] w-full items-center gap-3 rounded-md border px-3.5 py-2.5 text-left text-[15px] font-medium ${alert.tone === 'danger' ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-amber-300 bg-amber-50 text-amber-950'}`}>
              <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="flex-1">{alert.text}</span>
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </button>
          ))}
        </section>
      )}

      {/* 4 NÚMEROS DO TURNO */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo do turno">
        <button type="button" onClick={() => go('finance')} disabled={!onNavigateTab} className={`${card} text-left`}>
          <p className="text-sm text-ink-muted">Faturado</p>
          <p className="mt-1 font-mono text-2xl font-bold text-ink sm:text-3xl">{formatBRL(d.revenue.realized)}</p>
          <p className="mt-1 text-[13px] text-ink-muted">+ {formatBRL(d.revenue.inProgress)} em andamento</p>
        </button>
        <button type="button" onClick={() => go('tables')} disabled={!onNavigateTab} className={`${card} text-left`}>
          <p className="text-sm text-ink-muted">Mesas abertas</p>
          <p className="mt-1 font-mono text-2xl font-bold text-ink sm:text-3xl">{d.salon.openTabs.length}</p>
          <p className="mt-1 text-[13px] text-ink-muted">{d.salon.people} {d.salon.people === 1 ? 'pessoa' : 'pessoas'}{d.salon.waitingBill.length ? ` · ${d.salon.waitingBill.length} pediram a conta` : ''}</p>
        </button>
        <button type="button" onClick={() => go('kds')} disabled={!onNavigateTab} className={`${card} text-left`}>
          <p className="text-sm text-ink-muted">Na brasa</p>
          <p className="mt-1 font-mono text-2xl font-bold text-ink sm:text-3xl">{d.production.GRILL.salon + d.production.GRILL.delivery}</p>
          <p className="mt-1 text-[13px] text-ink-muted">espetos · {d.productionTotal} un em produção</p>
        </button>
        <button type="button" onClick={() => go('delivery')} disabled={!onNavigateTab} className={`${card} text-left ${lateIds.size ? 'border-rose-300 bg-rose-50' : ''}`}>
          <p className={`text-sm ${lateIds.size ? 'text-rose-800' : 'text-ink-muted'}`}>Delivery atrasado</p>
          <p className={`mt-1 font-mono text-2xl font-bold sm:text-3xl ${lateIds.size ? 'text-rose-700' : 'text-ink'}`}>{lateIds.size}</p>
          <p className="mt-1 text-[13px] text-ink-muted">{activeDeliveries.length} em andamento</p>
        </button>
      </section>

      {/* MOVIMENTO AGORA EM 3 COLUNAS */}
      <LiveBoard now={now} openTabs={d.salon.openTabs} tabInfo={d.tabInfo} readyOldest={d.salon.readyOldest} activeDeliveries={activeDeliveries} lateIds={lateIds} go={onNavigateTab ? go : undefined} goTable={onNavigateTab ? goTable : undefined} />

      {/* MESAS EM ATENDIMENTO (ações: lançar, cobrar, anular) */}
      <Block id="tabs-title" title={`Mesas em atendimento (${d.salon.openTabs.length})`} icon={UtensilsCrossed} action={onNavigateTab && <button type="button" onClick={() => go('waiter')} className={actionBtn}><Plus className="h-4 w-4" />Novo atendimento</button>}>
        {d.salon.openTabs.length === 0 ? <p className="py-6 text-center text-sm text-ink-muted">Nenhuma comanda aberta no momento.</p> : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[...d.salon.openTabs].sort((a, b) => a.opened_at.localeCompare(b.opened_at)).map((tab) => {
              const table = tables.find((t) => t.id === tab.table_id);
              const info = d.tabInfo(tab);
              const waiting = table?.status === 'AGUARDANDO_CONTA';
              return (
                <div key={tab.id} className="space-y-2.5 rounded-2xl border border-line bg-surface p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-lg font-bold text-ink">Mesa {table ? pad2(table.number) : '—'}</p>
                      <p className="truncate text-sm text-ink-secondary">{tab.customer_name && tab.customer_name !== `Mesa ${table?.number}` ? tab.customer_name : 'Sem nome'} · {tab.people_count} {tab.people_count === 1 ? 'pessoa' : 'pessoas'}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-lg font-bold text-ink">{formatBRL(tab.total || tab.subtotal)}</p>
                      <p className="flex items-center justify-end gap-1 text-[13px] text-ink-muted"><Clock className="h-3 w-3" />{formatElapsedMinutes(tab.opened_at, now)}</p>
                    </div>
                  </div>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                    {waiting && <StatusTag kind="bill">Conta pedida</StatusTag>}
                    {info.ready > 0 && <StatusTag kind="ready">{info.ready} pronto{info.ready > 1 ? 's' : ''} para servir</StatusTag>}
                    {info.preparing > 0 && <StatusTag kind="preparing">{info.preparing} em preparo</StatusTag>}
                    <span className="text-ink-muted">{info.itemCount ? `${info.itemCount} ${info.itemCount === 1 ? 'item' : 'itens'}` : 'Sem pedido'}{info.minutesSinceLastOrder !== null ? ` · último pedido há ${info.minutesSinceLastOrder} min` : ''}</span>
                  </p>
                  {onNavigateTab && table && (
                    <div className="flex items-center gap-2 border-t border-line pt-2.5">
                      <button type="button" onClick={() => goTable(table.id, 'waiter')} className="btn-secondary min-h-[44px] flex-1 justify-center px-2 text-[15px]">Lançar pedido</button>
                      <button type="button" onClick={() => goTable(table.id, 'cashier')} className="btn-primary min-h-[44px] flex-1 justify-center px-2 text-[15px]">Cobrar</button>
                      <VoidTabButton tab={tab} tableNumber={table.number} compact />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Block>

      {/* DETALHES RECOLHIDOS */}
      <Block id="now-salon" title="Casa agora" icon={UtensilsCrossed} summary={<span className="font-mono">{formatBRL(d.salon.open)}</span>} action={onNavigateTab && <button type="button" className={actionBtn} onClick={() => go('tables')}>Ver mesas</button>}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Metric label="Mesas ocupadas" value={d.salon.openTabs.length} hint={`${d.salon.people} ${d.salon.people === 1 ? 'pessoa' : 'pessoas'}`} />
          <Metric label="Pediram a conta" value={d.salon.waitingBill.length} warn={d.salon.waitingBill.length > 0} hint={d.salon.waitingBill.map((t) => pad2(t.number)).join(', ') || '—'} />
          <Metric label="Em consumo" value={formatBRL(d.salon.open)} />
          <Metric label="Prontos para servir" value={d.salon.readyCount} warn={d.salon.readyOldest >= ALERT_LIMITS.readyNotServed} hint={d.salon.readyCount ? `mais antigo: ${d.salon.readyOldest} min` : 'nada esperando'} />
          <Metric label="Na brasa (salão)" value={d.salon.grillCount} warn={d.salon.grillOldest >= ALERT_LIMITS.grillTooLong} hint={d.salon.grillCount ? `mais antigo: ${d.salon.grillOldest} min` : '—'} />
          <Metric label="Ticket médio" value={formatBRL(d.salon.avgTicket)} hint={`${formatBRL(d.salon.avgPerPerson)} por pessoa`} />
        </div>
      </Block>

      <Block id="now-delivery" title="Delivery e retirada agora" icon={Bike} summary={<span className="font-mono">{activeDeliveries.length}</span>} action={onNavigateTab && <button type="button" className={actionBtn} onClick={() => go('delivery')}>Abrir delivery</button>}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STAGES.map((s) => <Metric key={s.key} label={s.label} value={d.stages[s.key].length} warn={s.key === 'READY' && d.pickupsWaiting.length > 0} />)}
        </div>
        {activeDeliveries.length === 0 ? <p className="py-3 text-center text-sm text-ink-muted">Nenhum pedido de delivery ou retirada em andamento.</p> : (
          <ul className="divide-y divide-line rounded-md border border-line">
            {activeDeliveries.slice(0, 8).map((o) => {
              const late = lateIds.has(o.id);
              return (
                <li key={o.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="w-12 shrink-0 font-mono font-bold text-ink">#{o.order_number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{o.customer_name}</span>
                    <span className="block text-[13px] text-ink-muted">{o.order_type === 'PICKUP' ? 'Retirada' : `Entrega · ${o.address_neighborhood || 'sem bairro'}`} · {STAGE_LABEL[stageOf(o)!]}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-sm font-bold text-ink">{formatBRL(o.total)}</span>
                    <span className="flex items-center justify-end gap-1 text-[13px] text-ink-muted">{formatElapsedMinutes(o.created_at, now)}{late && <StatusTag kind="alert">Atrasado</StatusTag>}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {activeDeliveries.length > 8 && <p className="text-[13px] text-ink-muted">E mais {activeDeliveries.length - 8} na tela de delivery.</p>}
      </Block>

      <Block id="revenue-title" title="Faturamento do turno" icon={TrendingUp} summary={<span className="font-mono">{formatBRL(d.revenue.projected)}</span>}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Metric label="Realizado" value={formatBRL(d.revenue.realized)} hint="Mesas fechadas + delivery entregue ou pago" />
          <Metric label="Em andamento" value={formatBRL(d.revenue.inProgress)} hint="Mesas abertas + delivery a receber" />
          <Metric label="Projetado" value={formatBRL(d.revenue.projected)} hint="Realizado + em andamento" />
        </div>
        <div className="overflow-x-auto">
          <table className="data-table w-full text-left text-sm">
            <thead><tr><th>Canal</th><th className="text-right">Pedidos</th><th className="text-right">Realizado</th><th className="text-right">Em andamento</th><th className="text-right">Ticket médio</th></tr></thead>
            <tbody>
              <tr><td className="font-medium"><Store className="mr-1.5 inline h-4 w-4 text-ink-muted" />Salão</td><td className="text-right font-mono">{d.salon.openTabs.length + d.salon.closedTabs.length}</td><td className="text-right font-mono">{formatBRL(d.salon.closed)}</td><td className="text-right font-mono">{formatBRL(d.salon.open)}</td><td className="text-right font-mono">{formatBRL(d.salon.avgTicket)}</td></tr>
              <tr><td className="font-medium"><Bike className="mr-1.5 inline h-4 w-4 text-ink-muted" />Delivery</td><td className="text-right font-mono">{d.delivery.count}</td><td className="text-right font-mono">{formatBRL(d.delivery.realized)}</td><td className="text-right font-mono">{formatBRL(d.delivery.pending)}</td><td className="text-right font-mono">{formatBRL(d.delivery.avgTicket)}</td></tr>
              <tr><td className="font-medium"><PackageCheck className="mr-1.5 inline h-4 w-4 text-ink-muted" />Retirada</td><td className="text-right font-mono">{d.pickup.count}</td><td className="text-right font-mono">{formatBRL(d.pickup.realized)}</td><td className="text-right font-mono">{formatBRL(d.pickup.pending)}</td><td className="text-right font-mono">{formatBRL(d.pickup.avgTicket)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-[13px] text-ink-muted">Valores dos produtos, sem taxas. Taxa de serviço: <strong className="font-mono">{formatBRL(d.salon.serviceFee)}</strong> · Taxas de entrega: <strong className="font-mono">{formatBRL(d.delivery.fees)}</strong> · Descontos: <strong className="font-mono">{formatBRL(d.salon.discounts)}</strong></p>
      </Block>

      <Block id="prod-title" title={`Produção agora (${d.productionTotal} un)`} icon={Flame} action={onNavigateTab && <button type="button" className={actionBtn} onClick={() => go('kds')}>Abrir produção</button>}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          {([['GRILL', 'Churrasqueira'], ['KITCHEN', 'Cozinha'], ['BAR', 'Bar']] as const).map(([key, label]) => (
            <Metric key={key} label={label} value={d.production[key].salon + d.production[key].delivery} hint={`salão ${d.production[key].salon} · delivery ${d.production[key].delivery}`} />
          ))}
          <Metric label="Impressora da loja" value={!isSupabaseConfigured ? '—' : d.stuckJobs.length || d.failedJobs.length ? 'Atenção' : 'Ok'} warn={isSupabaseConfigured && (d.stuckJobs.length > 0 || d.failedJobs.length > 0)}
            hint={!isSupabaseConfigured ? 'demonstração' : `${jobs.filter((j) => j.status === 'PENDING' || j.status === 'PRINTING').length} na fila · ${d.failedJobs.length} com falha`} />
        </div>
      </Block>

      <Block id="pay-title" title="Recebido e mais vendidos" icon={PieChart} summary={<span className="font-mono">{formatBRL(d.receivedTotal)}</span>}>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="space-y-3">
            {RECEIVED.map(([key, label, color]) => {
              const amount = d.received[key];
              const pct = d.receivedTotal > 0 ? (amount / d.receivedTotal) * 100 : 0;
              return (
                <div key={key} className="space-y-1">
                  <div className="flex justify-between text-sm"><span className="flex items-center gap-1.5 font-medium text-ink"><span className={`h-2.5 w-2.5 rounded-sm ${color}`} aria-hidden="true" />{label}</span><span className="font-mono font-semibold text-ink">{formatBRL(amount)} <span className="text-ink-muted">({pct.toFixed(0)}%)</span></span></div>
                  <div className="h-2 w-full overflow-hidden rounded-sm bg-surface-muted"><div className={`h-full ${color}`} style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
            <p className="text-[13px] text-ink-muted">Dinheiro que já entrou: mesas pagas e delivery entregue ou com PIX confirmado (com taxas).</p>
          </div>
          <div className="overflow-x-auto xl:col-span-2">
            <table className="data-table w-full text-left text-sm">
              <thead><tr><th>#</th><th>Mais vendidos no turno</th><th className="text-right">Un</th><th className="text-right">Faturamento</th><th className="text-right">%</th></tr></thead>
              <tbody>
                {d.topProducts.length === 0 ? <tr><td colSpan={5} className="py-6 text-center text-ink-muted">Nenhum item vendido até agora.</td></tr> : d.topProducts.slice(0, 8).map((p, idx) => (
                  <tr key={p.name}>
                    <td className="font-mono text-ink-muted">{idx + 1}</td>
                    <td><span className="font-medium text-ink">{p.name}</span><span className="block text-[13px] text-ink-muted">{p.channels}</span></td>
                    <td className="text-right font-mono">{p.qty}</td>
                    <td className="text-right font-mono font-semibold">{formatBRL(p.total)}</td>
                    <td className="text-right font-mono text-ink-muted">{p.share.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Block>

      <StockSnapshot onOpenStock={onNavigateTab ? () => onNavigateTab('stock') : undefined} />

      <Block id="feed-title" title="Movimentações do turno" icon={Clock} summary={<span className="font-mono">{d.feed.length}</span>}>
        <div className="flex gap-1" role="group" aria-label="Filtrar movimentações">
          {(['Tudo', 'Casa', 'Delivery'] as const).map((f) => <button key={f} type="button" aria-pressed={feedFilter === f} onClick={() => setFeedFilter(f)} className={`h-11 rounded-md border px-3.5 text-sm font-semibold ${feedFilter === f ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink'}`}>{f}</button>)}
        </div>
        {feed.length === 0 ? <p className="py-4 text-center text-sm text-ink-muted">Nenhuma movimentação neste turno.</p> : (
          <ul className="max-h-[28rem] space-y-1.5 overflow-y-auto pr-1">
            {feed.slice(0, 40).map((ev) => (
              <li key={ev.id} className="flex items-start gap-3 rounded-md border border-line bg-surface px-3 py-2 text-sm">
                <span className="w-12 shrink-0 pt-0.5 font-mono text-[13px] text-ink-muted">{new Date(ev.time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5"><span className={`rounded-sm px-1.5 py-0.5 text-xs font-medium ${TONE[ev.tone]}`}>{ev.channel}</span><span className="font-medium text-ink">{ev.title}</span></span>
                  <span className="mt-0.5 block truncate text-[13px] text-ink-muted">{ev.description}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block id="loss-title" title="Perdas e descartes" icon={PackageCheck} summary={<span className="font-mono">{d.losses.length}</span>}>
        {d.losses.length === 0 ? <p className="py-3 text-center text-sm text-ink-muted">Nenhuma perda ou descarte neste turno.</p> : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
            {d.losses.map((m) => (
              <li key={m.id} className="space-y-1 rounded-md border border-line bg-surface p-3 text-sm">
                <div className="flex justify-between font-medium text-ink"><span>{m.product_name || 'Produto'}</span><span className="font-mono font-bold text-rose-700">{m.quantity} un</span></div>
                <p className="text-ink-muted">Motivo: {m.reason || 'Sem motivo'}</p>
                <p className="font-mono text-[13px] text-ink-muted">{new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
              </li>
            ))}
          </ul>
        )}
      </Block>

      {onNavigateTab && (
        <p className="text-sm text-ink-muted">Turnos anteriores e faturamento por período ficam em <button type="button" className="font-semibold text-brand-700 underline underline-offset-2" onClick={() => go('reports')}>Relatórios → Turnos</button>.</p>
      )}

      <ShiftCloseModal isOpen={isCloseModalOpen} onClose={() => setIsCloseModalOpen(false)} />
    </div>
  );
};
