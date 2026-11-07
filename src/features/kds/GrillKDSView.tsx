import { AlertCircle, CheckCheck, ChevronDown, Flame, Sparkles, Undo2, Users, Volume2, VolumeX } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { PageHeader } from '../../components/ui/PageHeader';
import { audioService } from '../../lib/audio';
import { isDineInOrder } from '../../lib/deliveryStatus';
import { formatDoneness } from '../../lib/formatters';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDeliveryStore } from '../../stores/useDeliveryStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useStockStore } from '../../stores/useStockStore';
import { useTableStore } from '../../stores/useTableStore';
import type { MeatDoneness } from '../../types/enums';
import { GrillExhaustModal } from './GrillExhaustModal';
import { GrillLiveSummary } from './GrillLiveSummary';
import { KDSElapsedTimer, LEVEL_STRIP, elapsedLevel, useNow } from './KDSElapsedTimer';

/** Tempo para desfazer um toque errado antes de avisar cozinha/cliente. */
const UNDO_MS = 4000;

type TicketKind = 'LOCAL' | 'DINE_IN' | 'PICKUP' | 'DELIVERY';

interface GrillTicket {
  key: string;
  kind: TicketKind;
  title: string;
  subtitle: string;
  createdAt: string;
  people?: number;
  notes: string | null;
  items: { id: string; quantity: number; name: string; doneness: MeatDoneness | null; notes: string | null }[];
  ready: () => void;
  doneMessage: string;
}


const KIND_LABEL: Record<TicketKind, { label: string; classes: string }> = {
  LOCAL: { label: 'Local', classes: 'bg-surface-muted text-ink-secondary' },
  DINE_IN: { label: 'No local', classes: 'bg-surface-muted text-ink-secondary' },
  PICKUP: { label: 'Retirada', classes: 'bg-sky-800 text-white' },
  DELIVERY: { label: 'Delivery', classes: 'bg-brand-100 text-brand-900' },
};

/**
 * Tela do churrasqueiro: só os pedidos na brasa e um único botão por pedido.
 * O pedido já chega "Na brasa" (e impresso); "Espeto pronto" avisa quem precisa:
 * mesa → cozinha manda a bandeja; retirada → cliente no WhatsApp; delivery → equipe.
 */
export const GrillKDSView: React.FC = () => {
  const { orders, orderItems, tables, tabs, updateOrderSectorItemsStatus } = useTableStore();
  const { deliveryOrders, updateDeliveryStatus } = useDeliveryStore();
  const { currentShift } = useShiftStore();
  const { currentProfile } = useAuthStore();
  const { products, dailyPrepStock, toggleExhaustProduct } = useStockStore();
  const { notify } = useFeedback();

  const [isExhaustModalOpen, setIsExhaustModalOpen] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(audioService.getAudioEnabled());
  const [pending, setPending] = useState<Record<string, true>>({});
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});
  const toggleOpen = (key: string) => setOpenCards((current) => ({ ...current, [key]: !current[key] }));
  const now = useNow();
  const timers = useRef(new Map<string, { timer: number; commit: () => void }>());

  // Saiu da tela com um "pronto" ainda no prazo de desfazer: confirma na hora
  useEffect(() => () => {
    timers.current.forEach(({ timer, commit }) => { window.clearTimeout(timer); commit(); });
    timers.current.clear();
  }, []);

  const handleToggleAudio = () => {
    const next = !audioEnabled;
    audioService.setAudioEnabled(next);
    setAudioEnabled(next);
    if (next) audioService.playNewOrderSound();
  };

  const handleQuickToggleExhaust = (productId: string, isCurrentlyExhausted: boolean) => {
    if (!currentShift) return;
    const nextStatus = !isCurrentlyExhausted;
    toggleExhaustProduct(currentShift.id, productId, nextStatus, currentProfile.id, nextStatus ? 'Esgotado pelo churrasqueiro na brasa' : undefined);
  };

  // Salão: espetos na brasa apenas de comandas e mesas abertas (não exibe comandas encerradas/mesas livres)
  const openTabIds = new Set(tabs.filter((t) => t.status === 'OPEN').map((t) => t.id));
  const openTableIds = new Set(
    tables.filter((t) => t.status === 'OCUPADA' || t.status === 'AGUARDANDO_CONTA').map((t) => t.id)
  );

  const activeOrderIds = new Set(
    orders
      .filter((order) => {
        if (order.status === 'CLOSED' || order.status === 'CANCELLED') return false;
        if (!openTabIds.has(order.tab_id) || !openTableIds.has(order.table_id)) return false;
        return true;
      })
      .map((order) => order.id)
  );

  const onGrillItems = orderItems.filter(
    (i) => activeOrderIds.has(i.order_id) && i.sector === 'GRILL' && (i.status === 'IN_PREPARATION' || i.status === 'RECEIVED')
  );

  // Pedidos de mesa na brasa: sem necessidade de clicar botão na tela (o churrasqueiro trabalha na brasa),
  // expiram do monitor de preparo após 30 min ou assim que a conta da mesa é fechada.
  const MAX_GRILL_LOCAL_MINUTES = 30;
  const localTickets: GrillTicket[] = orders
    .filter((order) => {
      if (!activeOrderIds.has(order.id)) return false;
      if (!onGrillItems.some((i) => i.order_id === order.id)) return false;
      const ageMinutes = (now - new Date(order.created_at).getTime()) / 60000;
      return ageMinutes <= MAX_GRILL_LOCAL_MINUTES;
    })
    .map((order) => {
      const table = tables.find((t) => t.id === order.table_id);
      const tableLabel = `Mesa ${table ? String(table.number).padStart(2, '0') : '??'}`;
      const tab = tabs.find((t) => t.id === order.tab_id);
      const customer = tab?.customer_name;
      const showCustomer = customer && !/^mesa\s*\d+$/i.test(customer.trim());
      return {
        key: `local-${order.id}`,
        kind: 'LOCAL' as const,
        title: tableLabel,
        subtitle: `Pedido #${order.order_number}${showCustomer ? ` · ${customer}` : ''}`,
        createdAt: order.created_at,
        people: tab?.people_count,
        notes: order.notes,
        items: onGrillItems
          .filter((i) => i.order_id === order.id)
          .map((i) => ({ id: i.id, quantity: i.quantity, name: i.product_name, doneness: i.doneness, notes: i.notes })),
        ready: () => updateOrderSectorItemsStatus(order.id, 'GRILL', 'READY'),
        doneMessage: `${tableLabel}: espetos prontos.`,
      };
    });

  // Delivery e retirada com espetos (o pedido inteiro fica pronto)
  const remoteTickets: GrillTicket[] = deliveryOrders
    .filter((o) => (o.status === 'PREPARING' || o.status === 'CONFIRMED') && o.items.some((i) => i.sector === 'GRILL'))
    .map((order) => {
      const isPickup = order.order_type === 'PICKUP';
      const firstName = order.customer_name.trim().split(' ')[0] || order.customer_name;
      return {
        key: `remote-${order.id}`,
        kind: isDineInOrder(order) ? 'DINE_IN' as const : isPickup ? 'PICKUP' as const : 'DELIVERY' as const,
        title: order.customer_name,
        subtitle: `#${order.order_number}`,
        createdAt: order.created_at,
        notes: order.notes,
        items: order.items.filter((i) => i.sector === 'GRILL').map((i) => ({ id: i.id, quantity: i.quantity, name: i.product_name, doneness: i.doneness, notes: i.notes })),
        ready: () => updateDeliveryStatus(order.id, 'READY'),
        doneMessage: isDineInOrder(order) ? `${firstName}: pedido para consumir no local está pronto.` : isPickup ? `Retirada de ${firstName}: cliente avisado que pode buscar.` : `Delivery #${order.order_number} pronto: equipe avisada.`,
      };
    });

  // Mais antigo primeiro (ordem de chegada)
  const tickets = [...localTickets, ...remoteTickets].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const skewerCount = tickets.reduce((sum, t) => sum + t.items.reduce((s, i) => s + i.quantity, 0), 0);
  const grillProducts = products.filter((p) => p.sector === 'GRILL');
  const countExhausted = dailyPrepStock.filter((s) => s.is_exhausted || s.current_quantity <= 0).length;

  const markReady = useCallback((ticket: GrillTicket) => {
    if (timers.current.has(ticket.key)) return;
    const commit = () => {
      timers.current.delete(ticket.key);
      setPending((current) => { const next = { ...current }; delete next[ticket.key]; return next; });
      try {
        ticket.ready();
        notify(ticket.doneMessage, 'success');
      } catch (error: unknown) {
        notify(error instanceof Error ? error.message : 'Não foi possível marcar como pronto.', 'error');
      }
    };
    timers.current.set(ticket.key, { timer: window.setTimeout(commit, UNDO_MS), commit });
    setPending((current) => ({ ...current, [ticket.key]: true }));
  }, [notify]);

  const undo = (key: string) => {
    const entry = timers.current.get(key);
    if (entry) window.clearTimeout(entry.timer);
    timers.current.delete(key);
    setPending((current) => { const next = { ...current }; delete next[key]; return next; });
  };

  return (
    <div className="page-layout">
      <PageHeader
        title="Churrasqueira"
        description={tickets.length === 0 ? 'Os pedidos chegam aqui já na brasa.' : `${tickets.length} ${tickets.length === 1 ? 'pedido' : 'pedidos'} na brasa · ${skewerCount} ${skewerCount === 1 ? 'espeto' : 'espetos'}`}
        actions={<>
          <button type="button" onClick={handleToggleAudio} className="icon-button" aria-pressed={audioEnabled} aria-label={audioEnabled ? 'Desativar alertas sonoros' : 'Ativar alertas sonoros'} title={audioEnabled ? 'Som ativado' : 'Som desativado'}>{audioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</button>
          <button type="button" onClick={() => setIsExhaustModalOpen(true)} className="btn-secondary text-rose-700"><AlertCircle className="h-4 w-4" aria-hidden="true" />Estoque{countExhausted > 0 && <span className="rounded-sm bg-rose-50 px-2 py-0.5 text-xs">{countExhausted}</span>}</button>
        </>}
      />

      <GrillLiveSummary orderItems={[...onGrillItems, ...deliveryOrders
        .filter((o) => o.status === 'PREPARING' || o.status === 'CONFIRMED')
        .flatMap((o) => o.items.map((i) => ({ ...i, status: 'IN_PREPARATION' as const })))]} />

      {tickets.length === 0 ? (
        <EmptyState title="Nada na brasa agora" description="Assim que um pedido com espeto for enviado, ele aparece aqui e sai na impressora." icon={Sparkles} />
      ) : (
        <ul className="grid grid-cols-1 items-start gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Pedidos na brasa">
          {tickets.map((ticket) => {
            const kind = KIND_LABEL[ticket.kind];
            const isPending = Boolean(pending[ticket.key]);
            const level = elapsedLevel(ticket.createdAt, now, 15, 25);
            const isOpen = Boolean(openCards[ticket.key]);
            const units = ticket.items.reduce((sum, item) => sum + item.quantity, 0);
            const strip = isPending ? 'bg-emerald-600 text-white' : LEVEL_STRIP[level];
            return (
              <li key={ticket.key} className="flex flex-col rounded-xl border border-line bg-surface shadow-xs">
                {/* Mesmo formato do cartão do Salão: nome em cima, itens e faixa colorida embaixo */}
                <div className="flex min-h-14 items-center gap-2 px-3 py-1.5">
                  <button type="button" onClick={() => toggleOpen(ticket.key)} aria-expanded={isOpen} aria-label={`${isOpen ? 'Fechar' : 'Ver'} pedido de ${ticket.title}`} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    {/* Duas linhas: nome em cima, tipo e número embaixo. Nome grande corta com reticências e nunca passa por cima do botão */}
                    <span className="min-w-0 flex-1">
                      <h2 className="truncate font-sans text-base font-bold leading-tight tracking-tight text-ink tabular-nums">{ticket.title}</h2>
                      <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-ink-muted tabular-nums">
                        {ticket.kind !== 'LOCAL' && <span className={`shrink-0 rounded-sm px-1.5 py-0.5 font-semibold ${kind.classes}`}>{kind.label}</span>}
                        <span className="min-w-0 truncate">{ticket.subtitle}</span>
                      </span>
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-ink-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                  {ticket.kind !== 'LOCAL' && (isPending ? (
                    <button type="button" onClick={() => undo(ticket.key)} className="btn-secondary h-8 min-h-0 shrink-0 px-2 text-xs">
                      <Undo2 className="h-4 w-4" aria-hidden="true" />Desfazer
                    </button>
                  ) : (
                    <button type="button" onClick={() => markReady(ticket)} className="btn-success h-8 min-h-0 shrink-0 px-2 text-xs font-bold">
                      <CheckCheck className="h-4 w-4" aria-hidden="true" />Pronto
                    </button>
                  ))}
                </div>

                {/* Fechado todos têm a mesma altura; o pedido desce ao tocar */}
                <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                  <div className="overflow-hidden">
                    <ul className="space-y-0.5 border-t border-line px-3 py-1.5">
                      {ticket.items.map((item) => (
                        <li key={item.id} className="text-base leading-tight">
                          <span className="font-mono font-bold tabular-nums text-accent-700">{item.quantity}x</span>{' '}
                          <span className="font-semibold text-ink">{item.name}</span>
                          {item.doneness && <span className="ml-1.5 whitespace-nowrap rounded-sm bg-amber-100 px-1.5 text-xs font-bold text-amber-900">{formatDoneness(item.doneness)}</span>}
                          {item.notes && <span className="block text-xs text-amber-800">Obs: {item.notes}</span>}
                        </li>
                      ))}
                      {ticket.notes && <li className="rounded-sm bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-900">Obs do pedido: {ticket.notes}</li>}
                    </ul>
                  </div>
                </div>

                <div className={`flex h-7 items-center justify-between rounded-b-xl px-3 text-xs font-bold ${strip}`} role={isPending ? 'status' : undefined}>
                  {isPending ? <span>Pronto! Avisando...</span> : (
                    <span className="flex items-center gap-3">
                      <span className="flex items-center gap-1" title="Espetos na brasa"><Flame className="h-4 w-4 opacity-90" aria-hidden="true" /><span className="tabular-nums">{units}</span></span>
                      {ticket.people !== undefined && <span className="flex items-center gap-1" title="Pessoas na mesa"><Users className="h-4 w-4 opacity-90" aria-hidden="true" /><span className="tabular-nums">{ticket.people}</span></span>}
                    </span>
                  )}
                  <span className="font-mono text-sm font-black"><KDSElapsedTimer createdAt={ticket.createdAt} compact /></span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <details className="surface-card overflow-hidden">
        <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold text-ink">
          <span className="flex items-center gap-2"><Flame className="h-4 w-4 text-accent-700" aria-hidden="true" />Marcar espeto esgotado</span>
          <span className={`text-xs font-semibold ${countExhausted > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{countExhausted > 0 ? `${countExhausted} ${countExhausted === 1 ? 'esgotado' : 'esgotados'}` : 'Todos disponíveis'}</span>
        </summary>
        <div className="grid grid-cols-2 gap-2.5 border-t border-line p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {grillProducts.map((product) => {
            const stockItem = dailyPrepStock.find((s) => s.product_id === product.id);
            const isExhausted = stockItem?.is_exhausted || !product.available;
            return (
              <button key={product.id} type="button" onClick={() => handleQuickToggleExhaust(product.id, isExhausted)} className={`flex flex-col items-center justify-center rounded-lg border p-3 text-center transition ${isExhausted ? 'border-rose-200 bg-rose-100 text-rose-950' : 'border-emerald-200 bg-white text-ink hover:border-emerald-400'}`} title={isExhausted ? 'Toque para liberar' : 'Toque para marcar como esgotado'}>
                <span className="line-clamp-1 text-xs font-bold leading-tight">{product.name}</span>
                <span className={`mt-1.5 rounded-sm px-2 py-0.5 text-[13px] font-medium ${isExhausted ? 'bg-rose-200 text-rose-950' : 'bg-emerald-100 text-emerald-900'}`}>{isExhausted ? 'Esgotado' : 'Disponível'}</span>
              </button>
            );
          })}
        </div>
      </details>

      <GrillExhaustModal isOpen={isExhaustModalOpen} onClose={() => setIsExhaustModalOpen(false)} />
    </div>
  );
};
