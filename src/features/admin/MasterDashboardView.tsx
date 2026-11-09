import { isDineInOrder } from '../../lib/deliveryStatus';
import { StockSnapshot } from './StockSnapshot';
import { LiveBoard } from './LiveBoard';
import {
  AlertTriangle,
  ArrowRight,
  Bike,
  CheckCircle2,
  Clock,
  Clock3,
  Flame,
  History,
  Lock,
  PackageCheck,
  PieChart,
  Plus,
  Printer,
  QrCode,
  Smartphone,
  Sparkles,
  Users,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import type { ActiveTab } from '../../components/layout/navigation';
import { PrinterDiagnosticsModal, usePrinterHealth } from '../../components/layout/PrinterStatusWidget';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { useDeliveryStore } from '../../stores/useDeliveryStore';
import { useNavFocusStore } from '../../stores/useNavFocusStore';
import { usePrintStore } from '../../stores/usePrintStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useStockStore } from '../../stores/useStockStore';
import { useTableStore } from '../../stores/useTableStore';
import type { DeliveryOrder } from '../../types/domain';
import { ALERT_LIMITS, computeDashboard, type ActivityEvent, type DashboardAlert } from './dashboardMetrics';
import { ShiftCloseModal } from './ShiftCloseModal';

interface MasterDashboardViewProps {
  onNavigateTab?: (tab: ActiveTab) => void;
  onOpenShiftClick?: () => void;
}

const TONE: Record<ActivityEvent['tone'], string> = {
  success: 'bg-emerald-50 text-emerald-800',
  warning: 'bg-amber-50 text-amber-900',
  info: 'bg-sky-50 text-ink',
  danger: 'bg-rose-50 text-rose-800',
  neutral: 'bg-surface-muted text-ink',
};

/** Respostas fixas do robô (sem IA), iguais a MEDIA_REPLY/HANDOFF_FALLBACK em supabase/functions/whatsapp-bot/logic.ts. */
const BOT_CANNED_REPLIES = [
  'Ainda não consigo ouvir áudios nem ver imagens por aqui. Pode me escrever sua dúvida?',
  'Vou chamar alguém da equipe para te ajudar, só um instante.',
];

/** Funcionamento da espetaria agora. Valores em dinheiro ficam em Financeiro e Relatórios. */
export const MasterDashboardView: React.FC<MasterDashboardViewProps> = ({ onNavigateTab, onOpenShiftClick }) => {
  const { currentShift } = useShiftStore();
  const { tables, tabs, orders, orderItems, payments } = useTableStore();
  const { deliveryOrders } = useDeliveryStore();
  const { stockMovements } = useStockStore();
  const { jobs } = usePrintStore();
  const { isBridgeAlive } = usePrinterHealth();
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
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

  // Robô ligado ao WhatsApp? (conexão + última mensagem de cliente), a cada 3 min
  const [botLinkData, setBotLinkData] = useState<{ connected: boolean | null; lastIncomingAt: string | null; botOn: boolean } | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    const load = async () => {
      const [settingsRes, lastInRes, connLogRes, statusRes] = await Promise.all([
        supabase.from('restaurant_settings').select('whatsapp_bot').limit(1).maybeSingle(),
        supabase.from('whatsapp_bot_messages').select('created_at').eq('direction', 'IN').order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('audit_logs').select('new_data').eq('action', 'WHATSAPP_CONEXAO').order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.functions.invoke('whatsapp-status', { body: {} }).catch(() => ({ data: null, error: true })),
      ]);
      const mode = String((settingsRes.data?.whatsapp_bot as { mode?: string } | null)?.mode ?? 'OFF');
      let connected: boolean | null = null;
      const status = statusRes as { data: { connected?: boolean; error?: string } | null; error: unknown };
      if (!status.error && status.data && typeof status.data.connected === 'boolean' && !status.data.error) connected = status.data.connected;
      else {
        const state = String((connLogRes.data?.new_data as { state?: string } | null)?.state ?? '');
        if (state === 'open') connected = true;
        else if (state === 'close') connected = false;
      }
      if (alive) setBotLinkData({ connected, lastIncomingAt: lastInRes.data?.created_at ?? null, botOn: mode !== 'OFF' });
    };
    void load();
    const id = window.setInterval(() => void load(), 180000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  const botLink = botLinkData ? { ...botLinkData, shiftOpenedAt: currentShift?.opened_at ?? null } : null;
  const d = computeDashboard({ shiftId: currentShift?.id ?? null, tables, tabs, orders, orderItems, payments, deliveryOrders, stockMovements, jobs, printerMonitored: isSupabaseConfigured, now, botErrorAt, botLink });
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
    <div className="page-layout space-y-4">
      {/* CABEÇALHO MODERNO E INTEGRADO */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Visão geral</h1>
          <p className="mt-0.5 text-xs text-ink-muted">
            {currentShift
              ? `Cockpit operacional em tempo real · ${currentShift.name}`
              : 'Painel de controle do salão, brasa e delivery'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {currentShift?.status === 'ABERTO' ? (
            <>
              <button
                type="button"
                onClick={() => setIsCloseModalOpen(true)}
                className="btn-secondary min-h-[40px] px-3.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 hover:border-rose-300"
              >
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                Fechar turno
              </button>
              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => go('waiter')}
                  className="btn-primary min-h-[40px] px-4 text-xs font-semibold shadow-sm"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Novo pedido
                </button>
              )}
            </>
          ) : (
            onOpenShiftClick && (
              <button
                type="button"
                onClick={onOpenShiftClick}
                className="btn-primary min-h-[40px] px-4 text-xs font-semibold shadow-sm"
              >
                <Clock3 className="h-4 w-4" aria-hidden="true" />
                Abrir turno
              </button>
            )
          )}
        </div>
      </div>

      {/* CARD DE RECEPÇÃO / INÍCIO DE TURNO */}
      {!currentShift && (
        <div className="rounded-md border border-line bg-surface p-4" role="status">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink">Turno fechado</h2>
              <p className="text-sm text-ink-secondary">Abra o turno para lançar pedidos no salão e no delivery.</p>
            </div>
            {onOpenShiftClick && (
              <button type="button" onClick={onOpenShiftClick} className="btn-primary min-h-[44px] px-5 shrink-0 self-start sm:self-auto">
                Abrir turno
              </button>
            )}
          </div>
        </div>
      )}

      {/* FAIXA COMPACTA DE ALERTAS INTELIGENTES */}
      {d.alerts.length > 0 && (
        <section aria-label="Alertas" className="space-y-1.5">
          {d.alerts.map((alert) => (
            <button
              key={alert.id}
              type="button"
              onClick={() => goAlert(alert.target)}
              className={`flex min-h-[40px] w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2 text-left text-sm font-medium transition hover:brightness-95 ${
                alert.tone === 'danger'
                  ? 'border-rose-200 bg-rose-50/90 text-rose-900'
                  : 'border-amber-200 bg-amber-50/90 text-amber-950'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <AlertTriangle className={`h-4 w-4 shrink-0 ${alert.tone === 'danger' ? 'text-rose-600' : 'text-amber-600'}`} aria-hidden="true" />
                <span className="truncate">{alert.text}</span>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-semibold shrink-0 underline underline-offset-2">
                Resolver <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </button>
          ))}
        </section>
      )}

      {/* 4 NÚMEROS DA OPERAÇÃO (COMMAND CENTER) */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo do turno">
        {/* 1. Mesas em atendimento */}
        <button
          type="button"
          onClick={() => go('waiter')}
          disabled={!onNavigateTab}
          className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-line bg-surface p-4 text-left transition-all duration-200 hover:border-emerald-400 hover:shadow-md border-t-4 border-t-emerald-500"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Mesas abertas</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 transition group-hover:scale-110">
              <Users className="h-4 w-4" />
            </span>
          </div>
          <div className="my-2">
            <span className="font-mono text-3xl font-extrabold tracking-tight text-ink">{d.salon.openTabs.length}</span>
          </div>
          <p className="truncate text-xs font-medium text-ink-muted">
            {d.salon.people > 0 ? `${d.salon.people} ${d.salon.people === 1 ? 'pessoa no salão' : 'pessoas no salão'}` : 'Nenhuma mesa aberta'}
            {d.salon.waitingBill.length > 0 && (
              <span className="ml-1.5 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                {d.salon.waitingBill.length} {d.salon.waitingBill.length === 1 ? 'pediu conta' : 'pediram conta'}
              </span>
            )}
          </p>
        </button>

        {/* 2. Produção agora */}
        <button
          type="button"
          onClick={() => go('kds')}
          disabled={!onNavigateTab}
          title="Produção agora"
          className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-line bg-surface p-4 text-left transition-all duration-200 hover:border-brand-400 hover:shadow-md border-t-4 border-t-brand-600"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Produção agora</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700 transition group-hover:scale-110">
              <Flame className="h-4 w-4" />
            </span>
          </div>
          <div className="my-2">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-3xl font-extrabold tracking-tight text-ink">
                {d.production.GRILL.salon + d.production.GRILL.delivery}
              </span>
              <span className="text-xs font-bold text-brand-800">na brasa</span>
            </div>
          </div>
          <p className="truncate text-xs font-medium text-ink-muted">
            Churrasqueira: {d.production.GRILL.salon + d.production.GRILL.delivery} · Cozinha: {d.production.KITCHEN.salon + d.production.KITCHEN.delivery}
          </p>
        </button>

        {/* 3. Prontos para levar */}
        <button
          type="button"
          onClick={() => goAlert('ready')}
          disabled={!onNavigateTab}
          className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200 hover:border-amber-400 hover:shadow-md border-t-4 border-t-amber-500 ${
            d.salon.readyOldest >= ALERT_LIMITS.readyNotServed ? 'bg-amber-50/50 border-amber-300' : 'bg-surface border-line'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Prontos para servir</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700 transition group-hover:scale-110">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <div className="my-2">
            <span className="font-mono text-3xl font-extrabold tracking-tight text-ink">{d.salon.readyCount}</span>
            <span className="ml-1.5 text-xs font-bold text-amber-800">{d.salon.readyCount === 1 ? 'item' : 'itens'}</span>
          </div>
          <p className="truncate text-xs font-medium text-ink-muted">
            {d.salon.readyCount > 0 ? `Mais antigo há ${d.salon.readyOldest} min` : 'Nada esperando'}
          </p>
        </button>

        {/* 4. Delivery e retirada agora */}
        <button
          type="button"
          onClick={() => go('delivery')}
          disabled={!onNavigateTab}
          title="Delivery e retirada agora"
          className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200 hover:border-sky-400 hover:shadow-md border-t-4 border-t-sky-500 ${
            lateIds.size > 0 ? 'bg-rose-50/40 border-rose-300' : 'bg-surface border-line'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Delivery & Retirada</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-700 transition group-hover:scale-110">
              <Bike className="h-4 w-4" />
            </span>
          </div>
          <div className="my-2">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-3xl font-extrabold tracking-tight text-ink">{deliveryCount}</span>
              <span className="text-xs font-bold text-sky-800">ativos</span>
            </div>
          </div>
          <p className="truncate text-xs font-medium text-ink-muted">
            {lateIds.size > 0 ? (
              <span className="font-bold text-rose-700">{lateIds.size} {lateIds.size === 1 ? 'atrasado' : 'atrasados'}</span>
            ) : (
              'Em preparo, rota e balcão'
            )}
          </p>
        </button>
      </section>

      {/* COCKPIT 70/30: QUADRO OPERACIONAL AO VIVO + PAINEL LATERAL INTEGRADO */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
        {/* ÁREA PRINCIPAL (8 COLUNAS NO DESKTOP): QUADRO DE PEDIDOS AO VIVO */}
        <div className="xl:col-span-8 space-y-3" aria-label="Mesas em atendimento">
          <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
              <div>
                <h2 className="text-base font-semibold text-ink">Quadro de pedidos ao vivo</h2>
                <p className="text-xs text-ink-muted">Mesas do salão e pedidos de entrega organizados pelo fluxo da cozinha</p>
              </div>
              {printerProblem && (
                <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                  <Printer className="h-3.5 w-3.5 text-amber-600" />
                  <span>Impressora: atenção na fila</span>
                </div>
              )}
            </div>
            <LiveBoard
              now={now}
              openTabs={d.salon.openTabs}
              tabInfo={d.tabInfo}
              activeDeliveries={activeDeliveries}
              lateIds={lateIds}
              go={onNavigateTab ? go : undefined}
              goTable={onNavigateTab ? goTable : undefined}
            />
          </div>
        </div>

        {/* PAINEL LATERAL (4 COLUNAS NO DESKTOP): ATALHOS + ESTOQUE + FEED */}
        <div className="xl:col-span-4 space-y-4">
          {/* ATALHOS OPERACIONAIS DA GERÊNCIA */}
          <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink border-b border-line pb-2.5">
              <Sparkles className="h-4 w-4 text-brand-600" />
              Atalhos operacionais
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <a
                href="#/garcom"
                className="flex items-center gap-2 rounded-xl border border-line bg-surface-soft/60 p-2.5 text-xs font-semibold text-ink transition hover:bg-brand-50 hover:border-brand-300 hover:text-brand-900"
              >
                <Smartphone className="h-4 w-4 shrink-0 text-brand-600" />
                <span className="truncate">Área do garçom</span>
              </a>
              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => go('menu')}
                  className="flex items-center gap-2 rounded-xl border border-line bg-surface-soft/60 p-2.5 text-xs font-semibold text-ink transition hover:bg-brand-50 hover:border-brand-300 hover:text-brand-900"
                >
                  <QrCode className="h-4 w-4 shrink-0 text-brand-600" />
                  <span className="truncate">Cardápio digital</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsDiagnosticsOpen(true)}
                className="flex items-center gap-2 rounded-xl border border-line bg-surface-soft/60 p-2.5 text-xs font-semibold text-ink transition hover:bg-brand-50 hover:border-brand-300 hover:text-brand-900"
              >
                <Printer className="h-4 w-4 shrink-0 text-brand-600" />
                <span className="truncate">Testar impressora</span>
              </button>
              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => go('stock')}
                  className="flex items-center gap-2 rounded-xl border border-line bg-surface-soft/60 p-2.5 text-xs font-semibold text-ink transition hover:bg-brand-50 hover:border-brand-300 hover:text-brand-900"
                >
                  <PackageCheck className="h-4 w-4 shrink-0 text-brand-600" />
                  <span className="truncate">Estoque diário</span>
                </button>
              )}
            </div>
          </div>

          {/* ESTOQUE DO TURNO / MISE EN PLACE */}
          {currentShift ? (
            <StockSnapshot onOpenStock={onNavigateTab ? () => onNavigateTab('stock') : undefined} />
          ) : (
            <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-line pb-2.5">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <Flame className="h-4 w-4 text-brand-600" />
                  Mise en place do dia
                </h2>
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-ink-muted">Pré-turno</span>
              </div>
              <div className="pt-3 pb-1 text-center">
                <p className="text-xs text-ink-muted leading-relaxed">
                  Ao abrir o turno, o estoque diário de espetos na brasa e bebidas é sincronizado aqui para acompanhamento contínuo.
                </p>
                {onOpenShiftClick && (
                  <button
                    type="button"
                    onClick={onOpenShiftClick}
                    className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-bold text-brand-700 hover:text-brand-900 underline underline-offset-2"
                  >
                    Iniciar contagem do turno
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 2. Mais pedidos no turno */}
          {topByQty.length > 0 && (
            <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-line pb-2.5">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <PieChart className="h-4 w-4 text-brand-600" />
                  Mais pedidos no turno
                </h2>
                <span className="font-mono text-xs font-medium text-ink-muted">{topByQty.length} itens</span>
              </div>
              <ul className="divide-y divide-line/60 pt-1">
                {topByQty.slice(0, 5).map((p, idx) => (
                  <li key={p.name} className="flex items-center justify-between py-2 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-4 font-mono font-bold text-ink-muted">{idx + 1}</span>
                      <div className="min-w-0">
                        <span className="block truncate font-medium text-ink">{p.name}</span>
                        <span className="block text-[11px] text-ink-muted">{p.channels}</span>
                      </div>
                    </div>
                    <span className="font-mono font-semibold text-ink ml-2 shrink-0">{p.qty} un</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 3. Movimentações do turno (Feed ao vivo) */}
          <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Clock className="h-4 w-4 text-brand-600" />
                Movimentações do turno
              </h2>
              <div className="flex gap-1" role="group" aria-label="Filtrar movimentações">
                {(['Tudo', 'Casa', 'Delivery'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={feedFilter === f}
                    onClick={() => setFeedFilter(f)}
                    className={`rounded-md px-2 py-0.5 text-xs font-semibold transition ${
                      feedFilter === f
                        ? 'bg-ink text-white'
                        : 'bg-surface-muted text-ink-muted hover:text-ink'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            {feed.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <History className="h-6 w-6 text-ink-muted/50 mb-1.5" />
                <p className="text-xs font-semibold text-ink">Sem movimentações recentes</p>
                <p className="text-[11px] text-ink-muted mt-0.5 max-w-[220px]">
                  {currentShift ? 'Novos pedidos e baixas de estoque aparecerão aqui.' : 'Nenhuma movimentação neste turno.'}
                </p>
              </div>
            ) : (
              <ul className="max-h-[22rem] space-y-2 overflow-y-auto pr-1 pt-2">
                {feed.slice(0, 30).map((ev) => (
                  <li key={ev.id} className="flex items-start gap-2.5 rounded-lg border border-line/60 bg-surface-soft/60 p-2 text-xs">
                    <span className="w-10 shrink-0 font-mono text-[11px] text-ink-muted pt-0.5">
                      {new Date(ev.time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`rounded px-1 py-0.2 text-[10px] font-semibold ${TONE[ev.tone]}`}>{ev.channel}</span>
                        <span className="font-medium text-ink">{ev.title}</span>
                      </div>
                      <span className="mt-0.5 block truncate text-[11px] text-ink-muted">{ev.description}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 4. Perdas e descartes (se houver) */}
          {d.losses.length > 0 && (
            <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink border-b border-line pb-2.5">
                <PackageCheck className="h-4 w-4 text-rose-600" />
                Perdas e descartes ({d.losses.length})
              </h2>
              <ul className="space-y-1.5 pt-2">
                {d.losses.map((m) => (
                  <li key={m.id} className="flex items-center justify-between rounded-lg bg-surface-muted p-2 text-xs">
                    <span className="font-medium text-ink">{m.product_name || 'Produto'}</span>
                    <span className="font-mono font-bold text-rose-700">{m.quantity} un</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {onNavigateTab && (
        <p className="text-xs text-ink-muted">
          Faturamento, formas de pagamento e resumo do turno ficam em{' '}
          <button type="button" className="font-semibold text-brand-700 underline underline-offset-2" onClick={() => go('finance')}>
            Financeiro
          </button>
          . Turnos anteriores ficam em{' '}
          <button type="button" className="font-semibold text-brand-700 underline underline-offset-2" onClick={() => go('reports')}>
            Relatórios → Turnos
          </button>
          .
        </p>
      )}

      <PrinterDiagnosticsModal isOpen={isDiagnosticsOpen} onClose={() => setIsDiagnosticsOpen(false)} />
      <ShiftCloseModal isOpen={isCloseModalOpen} onClose={() => setIsCloseModalOpen(false)} />
    </div>
  );
};
