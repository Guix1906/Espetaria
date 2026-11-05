import { isDineInOrder, localOrderLabel } from '../../lib/deliveryStatus';
import { StatusTag } from '../../components/ui/StatusTag';
import { VoidTabButton } from '../tables/VoidTabButton';
import { StockSnapshot } from './StockSnapshot';
import { LiveBoard } from './LiveBoard';
import { SystemHealthCard } from './SystemHealthCard';
import { AlertCircle, AlertTriangle, ArrowRight, Bike, ChevronDown, Clock, Flame, Lock, PackageCheck, PieChart, Plus, UtensilsCrossed } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import type { ActiveTab } from '../../components/layout/navigation';
import { usePrinterHealth } from '../../components/layout/PrinterStatusWidget';
import { formatElapsedMinutes } from '../../lib/formatters';
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
  { key: 'IN_PRODUCTION', label: 'Na brasa' },
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
/** Respostas fixas do robô (sem IA), iguais a MEDIA_REPLY/HANDOFF_FALLBACK em supabase/functions/whatsapp-bot/logic.ts. */
const BOT_CANNED_REPLIES = [
  'Ainda não consigo ouvir áudios nem ver imagens por aqui. Pode me escrever sua dúvida?',
  'Vou chamar alguém da equipe para te ajudar, só um instante.',
];
const sectionTitle = 'flex items-center gap-2 text-base font-semibold text-ink';
const actionBtn = 'btn-secondary min-h-[44px] px-3.5 text-sm';

function Metric({ label, value, hint, warn }: { label: string; value: React.ReactNode; hint?: React.ReactNode; warn?: boolean }) {
  return (
    <div className={`rounded-md border px-3 py-2.5 ${warn ? 'border-amber-300 bg-amber-50' : 'border-line bg-surface-soft'}`}>
      <p className="text-[13px] text-ink-muted">{label}</p>
      <p className={`mt-0.5 font-mono text-xl font-bold ${warn ? 'text-amber-900' : 'text-ink'}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[13px] text-ink-muted">{hint}</p>}
    </div>
  );
}

/** Bloco recolhível: o topo fica enxuto e o detalhe abre quando precisar. Fica fora da tela para não fechar sozinho a cada atualização. */
function Block({ id, title, icon: Icon, summary, action, children, defaultOpen = false }: { id: string; title: string; icon: typeof Clock; summary?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
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
}

/** Funcionamento da espetaria agora. Valores em dinheiro ficam em Financeiro e Relatórios. */
export const MasterDashboardView: React.FC<MasterDashboardViewProps> = ({ onNavigateTab, onOpenShiftClick }) => {
  const { currentShift } = useShiftStore();
  const { tables, tabs, orders, orderItems, payments } = useTableStore();
  const { deliveryOrders } = useDeliveryStore();
  const { stockMovements } = useStockStore();
  const { jobs } = usePrintStore();
  const { isBridgeAlive } = usePrinterHealth();
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
  const goTable = (tableId: string, tab: ActiveTab) => { useNavFocusStore.getState().focusTable(tableId); go(tab); };
  const activeDeliveries = (Object.values(d.stages).flat() as DeliveryOrder[]).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const deliveryCount = activeDeliveries.filter((o) => !isDineInOrder(o)).length;
  const lateIds = new Set(d.lateDeliveries.map((o) => o.id));
  const feed = d.feed.filter((e) => feedFilter === 'Tudo' || (feedFilter === 'Casa' ? e.channel === 'Casa' : e.channel === 'Delivery' || e.channel === 'Consumir no local' || e.channel === 'Retirada'));
  const printerProblem = isSupabaseConfigured && (!isBridgeAlive || d.stuckJobs.length > 0 || d.failedJobs.length > 0);
  const topByQty = [...d.topProducts].sort((a, b) => b.qty - a.qty).slice(0, 8);

  return (
    <div className="page-layout">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[12rem] flex-1">
          <p className="text-[13px] text-ink-muted first-letter:uppercase">{new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p>
          <h1 className="text-[30px] font-semibold leading-tight text-ink">Visão geral</h1>
        </div>
        <span title={currentShift?.name} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${currentShift ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
          <span className={`h-2 w-2 rounded-full ${currentShift ? 'bg-emerald-600' : 'bg-amber-600'}`} aria-hidden="true" />{currentShift ? 'Turno aberto' : 'Turno fechado'}
        </span>
        {currentShift?.status === 'ABERTO' && <button type="button" onClick={() => setIsCloseModalOpen(true)} className="btn-secondary min-h-[44px] text-rose-700 hover:bg-rose-50 hover:text-rose-800"><Lock className="h-4 w-4" aria-hidden="true" />Fechar turno</button>}
        {onNavigateTab && <button type="button" onClick={() => go('waiter')} className="btn-primary min-h-[44px]"><Plus className="h-4 w-4" aria-hidden="true" />Novo pedido</button>}
      </div>

      {!currentShift && (
        <div className="notice flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50 text-amber-900" role="status">
          <div className="flex items-center gap-2.5"><AlertCircle className="h-5 w-5 shrink-0 text-amber-700" /><span>Turno fechado. Abra o turno para lançar pedidos no salão e no delivery.</span></div>
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

      {/* 4 NÚMEROS DA OPERAÇÃO */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo do turno">
        <button type="button" onClick={() => go('tables')} disabled={!onNavigateTab} className={`${card} text-left`}>
          <p className="text-sm text-ink-muted">Mesas abertas</p>
          <p className="mt-1 font-mono text-2xl font-bold text-ink sm:text-3xl">{d.salon.openTabs.length}</p>
          <p className="mt-1 text-[13px] text-ink-muted">{d.salon.people} {d.salon.people === 1 ? 'pessoa' : 'pessoas'}{d.salon.waitingBill.length ? ` · ${d.salon.waitingBill.length} ${d.salon.waitingBill.length === 1 ? 'pediu' : 'pediram'} a conta` : ''}</p>
        </button>
        <button type="button" onClick={() => go('kds')} disabled={!onNavigateTab} className={`${card} text-left`}>
          <p className="text-sm text-ink-muted">Na brasa</p>
          <p className="mt-1 font-mono text-2xl font-bold text-ink sm:text-3xl">{d.production.GRILL.salon + d.production.GRILL.delivery}</p>
          <p className="mt-1 text-[13px] text-ink-muted">espetos · {d.productionTotal} itens em produção no total</p>
        </button>
        <button type="button" onClick={() => goAlert('ready')} disabled={!onNavigateTab} className={`${card} text-left ${d.salon.readyOldest >= ALERT_LIMITS.readyNotServed ? 'border-amber-300 bg-amber-50' : ''}`}>
          <p className="text-sm text-ink-muted">Prontos para levar</p>
          <p className="mt-1 font-mono text-2xl font-bold text-ink sm:text-3xl">{d.salon.readyCount}</p>
          <p className="mt-1 text-[13px] text-ink-muted">{d.salon.readyCount ? `mais antigo há ${d.salon.readyOldest} min` : 'nada esperando'}</p>
        </button>
        <button type="button" onClick={() => go('delivery')} disabled={!onNavigateTab} className={`${card} text-left ${lateIds.size ? 'border-rose-300 bg-rose-50' : ''}`}>
          <p className={`text-sm ${lateIds.size ? 'text-rose-800' : 'text-ink-muted'}`}>Delivery e retirada</p>
          <p className={`mt-1 font-mono text-2xl font-bold sm:text-3xl ${lateIds.size ? 'text-rose-700' : 'text-ink'}`}>{deliveryCount}</p>
          <p className="mt-1 text-[13px] text-ink-muted">{lateIds.size ? `${lateIds.size} ${lateIds.size === 1 ? 'atrasado' : 'atrasados'}` : 'nenhum atrasado'}</p>
        </button>
      </section>

      {/* MOVIMENTO AGORA EM 3 COLUNAS */}
      <LiveBoard now={now} openTabs={d.salon.openTabs} tabInfo={d.tabInfo} activeDeliveries={activeDeliveries} lateIds={lateIds} go={onNavigateTab ? go : undefined} goTable={onNavigateTab ? goTable : undefined} />

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
                    <p className="flex shrink-0 items-center gap-1 text-[13px] text-ink-muted"><Clock className="h-3 w-3" />{formatElapsedMinutes(tab.opened_at, now)}</p>
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
                    <span className="block text-[13px] text-ink-muted">{o.order_type === 'PICKUP' ? localOrderLabel(o) : `Entrega · ${o.address_neighborhood || 'sem bairro'}`} · {STAGE_LABEL[stageOf(o)!]}</span>
                  </span>
                  <span className="flex shrink-0 items-center justify-end gap-1 text-[13px] text-ink-muted">{formatElapsedMinutes(o.created_at, now)}{late && <StatusTag kind="alert">Atrasado</StatusTag>}</span>
                </li>
              );
            })}
          </ul>
        )}
        {activeDeliveries.length > 8 && <p className="text-[13px] text-ink-muted">E mais {activeDeliveries.length - 8} na tela de delivery.</p>}
      </Block>

      <Block id="prod-title" title={`Produção agora (${d.productionTotal} un)`} icon={Flame} action={onNavigateTab && <button type="button" className={actionBtn} onClick={() => go('kds')}>Abrir produção</button>}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {([['GRILL', 'Churrasqueira'], ['KITCHEN', 'Cozinha']] as const).map(([key, label]) => (
            <Metric key={key} label={label} value={d.production[key].salon + d.production[key].delivery} hint={`salão ${d.production[key].salon} · delivery ${d.production[key].delivery}`} />
          ))}
          <Metric label="Impressão da loja" value={!isSupabaseConfigured ? '—' : !isBridgeAlive ? 'PC sem sinal' : printerProblem ? 'Atenção' : 'Ok'} warn={printerProblem}
            hint={!isSupabaseConfigured ? 'demonstração' : `${jobs.filter((j) => j.status === 'PENDING' || j.status === 'PRINTING').length} na fila · ${d.failedJobs.length} com falha`} />
        </div>
      </Block>

      <StockSnapshot onOpenStock={onNavigateTab ? () => onNavigateTab('stock') : undefined} />

      <SystemHealthCard />

      <Block id="top-title" title="Mais pedidos no turno" icon={PieChart} summary={<span className="font-mono">{topByQty.length}</span>}>
        {topByQty.length === 0 ? <p className="py-3 text-center text-sm text-ink-muted">Nenhum item pedido até agora.</p> : (
          <ul className="divide-y divide-line">
            {topByQty.map((p, idx) => (
              <li key={p.name} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-6 shrink-0 font-mono text-ink-muted">{idx + 1}</span>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium text-ink">{p.name}</span><span className="block text-[13px] text-ink-muted">{p.channels}</span></span>
                <span className="shrink-0 font-mono font-semibold text-ink">{p.qty} un</span>
              </li>
            ))}
          </ul>
        )}
      </Block>

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

      {d.losses.length > 0 && (
        <Block id="loss-title" title="Perdas e descartes" icon={PackageCheck} summary={<span className="font-mono">{d.losses.length}</span>}>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
            {d.losses.map((m) => (
              <li key={m.id} className="space-y-1 rounded-md border border-line bg-surface p-3 text-sm">
                <div className="flex justify-between font-medium text-ink"><span>{m.product_name || 'Produto'}</span><span className="font-mono font-bold text-rose-700">{m.quantity} un</span></div>
                <p className="text-ink-muted">Motivo: {m.reason || 'Sem motivo'}</p>
                <p className="font-mono text-[13px] text-ink-muted">{new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {onNavigateTab && (
        <p className="text-sm text-ink-muted">Faturamento, formas de pagamento e resumo do turno ficam em <button type="button" className="font-semibold text-brand-700 underline underline-offset-2" onClick={() => go('finance')}>Financeiro</button>. Turnos anteriores ficam em <button type="button" className="font-semibold text-brand-700 underline underline-offset-2" onClick={() => go('reports')}>Relatórios → Turnos</button>.</p>
      )}

      <ShiftCloseModal isOpen={isCloseModalOpen} onClose={() => setIsCloseModalOpen(false)} />
    </div>
  );
};
