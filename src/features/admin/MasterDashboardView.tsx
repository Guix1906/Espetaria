import { isLocalTable } from '../../lib/localTables';
import { isDineInOrder } from '../../lib/deliveryStatus';
import { StockSnapshot } from './StockSnapshot';
import { LiveBoard } from './LiveBoard';
import {
  AlertTriangle,
  ArrowRight,
  Bike,
  CheckCircle2,
  Flame,
  Lock,
  PackageCheck,
  PauseCircle,
  PieChart,
  PlayCircle,
  Plus,
  Users,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ActiveTab } from '../../components/layout/navigation';
import { PrinterDiagnosticsModal } from '../../components/layout/PrinterStatusWidget';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { useDeliveryStore } from '../../stores/useDeliveryStore';
import { useNavFocusStore } from '../../stores/useNavFocusStore';
import { usePrintStore } from '../../stores/usePrintStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useStockStore } from '../../stores/useStockStore';
import { useTableStore } from '../../stores/useTableStore';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { isDeliveryManuallyClosed } from '../../lib/storeHours';
import type { DeliveryOrder } from '../../types/domain';
import { ALERT_LIMITS, computeDashboard, type DashboardAlert } from './dashboardMetrics';
import { ShiftCloseModal } from './ShiftCloseModal';

interface MasterDashboardViewProps {
  onNavigateTab?: (tab: ActiveTab) => void;
  onOpenShiftClick?: () => void;
}

/** Respostas fixas do robô (sem IA), iguais a MEDIA_REPLY/HANDOFF_FALLBACK em supabase/functions/whatsapp-bot/logic.ts. */
const BOT_CANNED_REPLIES = [
  'Ainda não consigo ouvir áudios nem ver imagens por aqui. Pode me escrever sua dúvida?',
  'Vou chamar alguém da equipe para te ajudar, só um instante.',
];

/** Funcionamento da espetaria agora. Valores em dinheiro ficam em Financeiro e Relatórios. */
export const MasterDashboardView: React.FC<MasterDashboardViewProps> = ({ onNavigateTab, onOpenShiftClick }) => {
  const { currentShift } = useShiftStore();
  const { tables, tabs, orders, orderItems, payments } = useTableStore();
  // Consumo local (mesas internas 900+) não conta no total de mesas do salão
  const salonTableCount = tables.filter((t) => !isLocalTable(t)).length;
  const { deliveryOrders } = useDeliveryStore();
  const { stockMovements } = useStockStore();
  const { jobs } = usePrintStore();
  const { notify } = useFeedback();
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(id); }, []);
  // Lugar das ações na barra do topo (criado pelo Header só na Visão geral)
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setHeaderSlot(document.getElementById('overview-header-actions')); }, []);

  const isDeliveryClosed = isDeliveryManuallyClosed(new Date(now), settings.delivery_cutoff_time, settings.updated_at);

  const handleToggleDelivery = () => {
    if (isDeliveryClosed) {
      updateSettings({ delivery_cutoff_time: null });
      notify('Delivery reaberto com sucesso. Novos pedidos liberados no cardápio.', 'success');
    } else {
      updateSettings({ delivery_cutoff_time: '00:00:00' });
      notify('Delivery encerrado para novos pedidos. O salão continua aberto normalmente.', 'success');
    }
  };

  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);

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
  const topByQty = [...d.topProducts].sort((a, b) => b.qty - a.qty).slice(0, 8);

  // Ações do topo: Fechar turno (discreto) · Pausar delivery · Novo pedido
  const headerActions = currentShift?.status === 'ABERTO' ? (
    <>
      <button type="button" onClick={() => setIsCloseModalOpen(true)} className="btn-ghost h-[46px] gap-2.5 px-4 text-base font-medium text-ink-secondary hover:text-rose-700">
        <Lock className="h-[18px] w-[18px]" aria-hidden="true" />
        Fechar turno
      </button>
      <span className="hidden h-[30px] w-px bg-line sm:block" aria-hidden="true" />
      <button
        type="button"
        onClick={handleToggleDelivery}
        className={`btn-secondary h-[46px] px-[18px] text-base font-medium ${isDeliveryClosed ? 'border-amber-400 bg-amber-50 text-amber-900' : 'text-ink'}`}
        title={!isDeliveryClosed ? 'Pausa o delivery para novos pedidos sem fechar o salão' : 'Volta a aceitar pedidos de delivery'}
      >
        {isDeliveryClosed ? <PlayCircle className="h-4 w-4" aria-hidden="true" /> : <PauseCircle className="h-4 w-4" aria-hidden="true" />}
        {isDeliveryClosed ? 'Retomar delivery' : 'Pausar delivery'}
      </button>
      {onNavigateTab && (
        <button type="button" onClick={() => go('waiter')} className="btn-primary order-first col-span-2 h-[46px] px-[22px] text-base font-semibold sm:order-none sm:col-span-1">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Novo pedido
        </button>
      )}
    </>
  ) : null;

  return (
    <div className="page-layout space-y-4">
      {/* Cabeçalho (layout "Visão Geral Header v3"): no computador as ações sobem para a barra do topo;
          em tela menor ficam aqui, quebrando linha quando faltar espaço */}
      <h1 className="sr-only">Visão geral</h1>
      {headerActions && headerSlot && createPortal(headerActions, headerSlot)}
      {headerActions && (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:gap-2.5 lg:hidden">{headerActions}</div>
      )}

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
        <section aria-label="Precisa de você agora" className="flex flex-wrap items-center gap-2 rounded-md bg-rose-50 px-3 py-2.5">
          <span className="flex items-center gap-1.5 pr-1 text-sm font-semibold text-rose-900">
            <AlertTriangle className="h-4 w-4 text-rose-600" aria-hidden="true" />
            Precisa de você agora
          </span>
          {d.alerts.map((alert) => (
            <button
              key={alert.id}
              type="button"
              onClick={() => goAlert(alert.target)}
              className={`flex min-h-[36px] max-w-full items-center gap-1.5 rounded-sm bg-surface px-3 text-left text-[13px] font-medium hover:bg-surface-muted ${alert.tone === 'danger' ? 'text-rose-800' : 'text-ink'}`}
            >
              <span className="truncate">{alert.text}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
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
          className="group relative flex flex-col justify-between overflow-hidden rounded-md border border-line bg-surface p-4 text-left shadow-card transition-all duration-200 hover:border-line-strong hover:shadow-md"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-ink-secondary">Mesas abertas</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-muted text-ink-secondary">
              <Users className="h-4 w-4" />
            </span>
          </div>
          <div className="my-2">
            <span className="font-mono text-3xl font-bold tracking-tight text-ink">{d.salon.openTabs.length}</span>
            {salonTableCount > 0 && <span className="ml-1.5 text-sm text-ink-muted">de {salonTableCount}</span>}
          </div>
          <p className="truncate text-xs font-medium text-ink-muted">
            {d.salon.people > 0 ? `${d.salon.people} ${d.salon.people === 1 ? 'pessoa no salão' : 'pessoas no salão'}` : 'Nenhuma mesa aberta'}
            {d.salon.waitingBill.length > 0 && (
              <span className="ml-1.5 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-900">
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
          className="group relative flex flex-col justify-between overflow-hidden rounded-md border border-line bg-surface p-4 text-left shadow-card transition-all duration-200 hover:border-line-strong hover:shadow-md"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-ink-secondary">Produção agora</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-muted text-ink-secondary">
              <Flame className="h-4 w-4" />
            </span>
          </div>
          <div className="my-2">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-3xl font-bold tracking-tight text-ink">
                {d.production.GRILL.salon + d.production.GRILL.delivery}
              </span>
              <span className="text-sm text-ink-muted">na brasa</span>
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
          className={`group relative flex flex-col justify-between overflow-hidden rounded-md border p-4 text-left shadow-card transition-all duration-200 hover:border-line-strong hover:shadow-md ${
            d.salon.readyOldest >= ALERT_LIMITS.readyNotServed ? 'bg-amber-50/50 border-amber-300' : 'bg-surface border-line'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-ink-secondary">Prontos para servir</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-muted text-ink-secondary">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <div className="my-2">
            <span className="font-mono text-3xl font-bold tracking-tight text-ink">{d.salon.readyCount}</span>
            <span className="ml-1.5 text-sm text-ink-muted">{d.salon.readyCount === 1 ? 'item' : 'itens'}</span>
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
          className={`group relative flex flex-col justify-between overflow-hidden rounded-md border p-4 text-left shadow-card transition-all duration-200 hover:border-line-strong hover:shadow-md ${
            lateIds.size > 0 ? 'bg-rose-50/40 border-rose-300' : 'bg-surface border-line'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-ink-secondary">Delivery e retirada</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-muted text-ink-secondary">
              <Bike className="h-4 w-4" />
            </span>
          </div>
          <div className="my-2">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-3xl font-bold tracking-tight text-ink">{deliveryCount}</span>
              <span className="text-sm text-ink-muted">ativos</span>
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
                <h2 className="text-base font-semibold text-ink">Quadro ao vivo</h2>
                <p className="text-xs text-ink-muted">O que espera há mais tempo fica em cima. A cor do relógio muda com a espera.</p>
              </div>
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
          {/* Os atalhos (garçom, cardápio, estoque) saíram: já estão no menu e no topo. Testar impressora fica no aviso de impressora. */}

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
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-ink-muted">Pré-turno</span>
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
                <span className="font-mono text-xs font-medium text-ink-muted">{topByQty.length} {topByQty.length === 1 ? 'item' : 'itens'}</span>
              </div>
              <ul className="space-y-2.5 pt-3">
                {topByQty.slice(0, 5).map((p) => (
                  <li key={p.name} className="text-[13px]">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate font-medium text-ink">{p.name}</span>
                      <span className="shrink-0 font-mono font-semibold text-ink">{p.qty}</span>
                    </div>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-sm bg-surface-muted" aria-hidden="true">
                      <span className="block h-full rounded-sm bg-brand-600" style={{ width: `${Math.max(6, (p.qty / (topByQty[0]?.qty || 1)) * 100)}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

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
