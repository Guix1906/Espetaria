import { AlertCircle, CheckCheck, Flame, Sparkles, Undo2, Volume2, VolumeX } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { PageHeader } from '../../components/ui/PageHeader';
import { audioService } from '../../lib/audio';
import { formatDoneness } from '../../lib/formatters';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDeliveryStore } from '../../stores/useDeliveryStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useStockStore } from '../../stores/useStockStore';
import { useTableStore } from '../../stores/useTableStore';
import type { MeatDoneness } from '../../types/enums';
import { GrillExhaustModal } from './GrillExhaustModal';
import { GrillLiveSummary } from './GrillLiveSummary';
import { KDSElapsedTimer } from './KDSElapsedTimer';

/** Tempo para desfazer um toque errado antes de avisar cozinha/cliente. */
const UNDO_MS = 4000;

type TicketKind = 'LOCAL' | 'PICKUP' | 'DELIVERY';

interface GrillTicket {
  key: string;
  kind: TicketKind;
  title: string;
  subtitle: string;
  createdAt: string;
  notes: string | null;
  items: { id: string; quantity: number; name: string; doneness: MeatDoneness | null; notes: string | null }[];
  ready: () => void;
  doneMessage: string;
}

const KIND_LABEL: Record<TicketKind, { label: string; classes: string }> = {
  LOCAL: { label: 'Local', classes: 'bg-surface-muted text-ink-secondary' },
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

  // Salão: espetos na brasa ("Recebido" é de pedidos antigos, antes do fluxo automático)
  const onGrillItems = orderItems.filter((i) => i.sector === 'GRILL' && (i.status === 'IN_PREPARATION' || i.status === 'RECEIVED'));
  const localTickets: GrillTicket[] = orders
    .filter((o) => onGrillItems.some((i) => i.order_id === o.id))
    .map((order) => {
      const table = tables.find((t) => t.id === order.table_id);
      const tableLabel = `Mesa ${table ? String(table.number).padStart(2, '0') : '??'}`;
      const customer = tabs.find((t) => t.id === order.tab_id)?.customer_name;
      const showCustomer = customer && !/^mesa\s*\d+$/i.test(customer.trim());
      return {
        key: `local-${order.id}`,
        kind: 'LOCAL' as const,
        title: tableLabel,
        subtitle: `Pedido #${order.order_number}${showCustomer ? ` · ${customer}` : ''}`,
        createdAt: order.created_at,
        notes: order.notes,
        items: onGrillItems.filter((i) => i.order_id === order.id).map((i) => ({ id: i.id, quantity: i.quantity, name: i.product_name, doneness: i.doneness, notes: i.notes })),
        ready: () => updateOrderSectorItemsStatus(order.id, 'GRILL', 'READY'),
        doneMessage: `${tableLabel}: cozinha avisada para mandar a bandeja.`,
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
        kind: isPickup ? 'PICKUP' as const : 'DELIVERY' as const,
        title: order.customer_name,
        subtitle: `Pedido #${order.order_number}`,
        createdAt: order.created_at,
        notes: order.notes,
        items: order.items.filter((i) => i.sector === 'GRILL').map((i) => ({ id: i.id, quantity: i.quantity, name: i.product_name, doneness: i.doneness, notes: i.notes })),
        ready: () => updateDeliveryStatus(order.id, 'READY'),
        doneMessage: isPickup ? `Retirada de ${firstName}: cliente avisado que pode buscar.` : `Delivery #${order.order_number} pronto: equipe avisada.`,
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

      {tickets.length === 0 ? (
        <EmptyState title="Nada na brasa agora" description="Assim que um pedido com espeto for enviado, ele aparece aqui e sai na impressora." icon={Sparkles} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Pedidos na brasa">
          {tickets.map((ticket) => {
            const kind = KIND_LABEL[ticket.kind];
            const isPending = Boolean(pending[ticket.key]);
            return (
              <li key={ticket.key} className={`flex flex-col gap-3 rounded-lg border p-4 shadow-sm transition ${isPending ? 'border-emerald-300 bg-emerald-50' : 'border-line bg-surface'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-sm px-2 py-0.5 text-xs font-semibold ${kind.classes}`}>{kind.label}</span>
                      <span className="text-xs text-ink-muted tabular-nums">{ticket.subtitle}</span>
                    </div>
                    <h2 className="mt-1 break-words text-2xl font-bold leading-tight text-ink">{ticket.title}</h2>
                  </div>
                  <KDSElapsedTimer createdAt={ticket.createdAt} warningMinutes={15} urgentMinutes={25} />
                </div>

                <ul className="space-y-1.5">
                  {ticket.items.map((item) => (
                    <li key={item.id} className="text-base">
                      <span className="font-bold tabular-nums text-ink">{item.quantity}x</span>{' '}
                      <span className="font-semibold text-ink">{item.name}</span>
                      {item.doneness && <span className="ml-2 rounded-sm bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-900">{formatDoneness(item.doneness)}</span>}
                      {item.notes && <span className="block text-sm text-amber-800">Obs: {item.notes}</span>}
                    </li>
                  ))}
                </ul>
                {ticket.notes && <p className="rounded-sm bg-amber-50 p-2 text-sm font-medium text-amber-900">Obs do pedido: {ticket.notes}</p>}

                {isPending ? (
                  <div className="mt-auto flex items-center gap-2">
                    <p className="flex flex-1 items-center gap-2 text-sm font-semibold text-emerald-800" role="status"><CheckCheck className="h-5 w-5" aria-hidden="true" />Pronto! Avisando...</p>
                    <button type="button" onClick={() => undo(ticket.key)} className="btn-secondary min-h-14 px-5 text-base"><Undo2 className="h-5 w-5" aria-hidden="true" />Desfazer</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => markReady(ticket)} className="btn-success mt-auto min-h-14 w-full text-lg font-bold">
                    <CheckCheck className="h-6 w-6" aria-hidden="true" />Espeto pronto
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <GrillLiveSummary orderItems={[...onGrillItems, ...deliveryOrders
        .filter((o) => o.status === 'PREPARING' || o.status === 'CONFIRMED')
        .flatMap((o) => o.items.map((i) => ({ ...i, status: 'IN_PREPARATION' as const })))]} />

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
                <span className={`mt-1.5 rounded-sm px-2 py-0.5 text-[10px] font-medium ${isExhausted ? 'bg-rose-200 text-rose-950' : 'bg-emerald-100 text-emerald-900'}`}>{isExhausted ? 'Esgotado' : 'Disponível'}</span>
              </button>
            );
          })}
        </div>
      </details>

      <GrillExhaustModal isOpen={isExhaustModalOpen} onClose={() => setIsExhaustModalOpen(false)} />
    </div>
  );
};
