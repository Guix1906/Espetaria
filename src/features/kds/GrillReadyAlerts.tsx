import { BellRing, Check, PackageCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { audioService } from '../../lib/audio';
import { useDeliveryStore } from '../../stores/useDeliveryStore';
import { useTableStore } from '../../stores/useTableStore';

interface Alert {
  key: string;
  title: string;
  action: string;
  detail: string;
  readyAt: string | null;
}

function sinceLabel(iso: string | null): string {
  if (!iso) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  return minutes < 1 ? 'agora' : `há ${minutes} min`;
}

/**
 * Avisos para a cozinha:
 *  - espetos prontos (churrasqueiro tocou "Espeto pronto") → mandar bandeja / embalar
 *  - delivery e retirada sem espetos → a cozinha marca o pedido como pronto
 * Os avisos somem sozinhos quando o garçom serve ou o pedido sai.
 */
export function GrillReadyAlerts() {
  const { orders, orderItems, tables } = useTableStore();
  const { deliveryOrders, updateDeliveryStatus } = useDeliveryStore();
  const { notify } = useFeedback();
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const seen = useRef<Set<string> | null>(null);

  // Mesa: todos os espetos do pedido prontos e ainda não servidos
  const trayAlerts: Alert[] = orders.flatMap((order) => {
    if (order.status === 'CLOSED' || order.status === 'CANCELLED') return [];
    const grill = orderItems.filter((i) => i.order_id === order.id && i.sector === 'GRILL' && i.status !== 'CANCELLED');
    const ready = grill.filter((i) => i.status === 'READY');
    if (ready.length === 0 || grill.some((i) => i.status === 'RECEIVED' || i.status === 'IN_PREPARATION')) return [];
    const table = tables.find((t) => t.id === order.table_id);
    const count = ready.reduce((sum, i) => sum + i.quantity, 0);
    const readyAt = ready.map((i) => i.prepared_at).filter(Boolean).sort().pop() ?? null;
    return [{
      key: `tray-${order.id}`,
      title: `Mesa ${table ? String(table.number).padStart(2, '0') : '??'}`,
      action: 'Mandar a bandeja com os acompanhamentos',
      detail: `${count} ${count === 1 ? 'espeto pronto' : 'espetos prontos'} · pedido #${order.order_number}`,
      readyAt,
    }];
  });

  // Delivery/retirada prontos: separar para o entregador ou para o balcão
  const remoteAlerts: Alert[] = deliveryOrders
    .filter((o) => o.status === 'READY')
    .map((o) => {
      const isPickup = o.order_type === 'PICKUP';
      const count = o.items.reduce((sum, i) => sum + i.quantity, 0);
      return {
        key: `remote-${o.id}`,
        title: `${isPickup ? 'Retirada' : 'Delivery'} #${o.order_number} · ${o.customer_name}`,
        action: isPickup ? 'Embalar e deixar no balcão (cliente já foi avisado)' : 'Embalar e separar para o entregador',
        detail: `${count} ${count === 1 ? 'item' : 'itens'}`,
        readyAt: o.ready_at ?? null,
      };
    });

  const alerts = [...trayAlerts, ...remoteAlerts].filter((a) => !dismissed.has(a.key));

  // Delivery/retirada sem espeto: ninguém da churrasqueira marca, a cozinha toca "Pedido pronto"
  const noGrillOrders = deliveryOrders.filter((o) => (o.status === 'PREPARING' || o.status === 'CONFIRMED') && !o.items.some((i) => i.sector === 'GRILL'));

  // Som quando aparece um aviso novo (não toca na primeira abertura da tela)
  const alertKeys = alerts.map((a) => a.key).join('|');
  useEffect(() => {
    const keys = new Set(alertKeys ? alertKeys.split('|') : []);
    if (seen.current && [...keys].some((k) => !seen.current!.has(k))) audioService.playOrderReadySound();
    seen.current = keys;
  }, [alertKeys]);

  if (alerts.length === 0 && noGrillOrders.length === 0) return null;

  const markReady = (orderId: string, label: string) => {
    try {
      updateDeliveryStatus(orderId, 'READY');
      notify(`${label} pronto.`, 'success');
    } catch (error: unknown) {
      notify(error instanceof Error ? error.message : 'Não foi possível marcar como pronto.', 'error');
    }
  };

  return (
    <section className="space-y-3" aria-label="Avisos da churrasqueira">
      {alerts.length > 0 && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-emerald-900"><BellRing className="h-4 w-4" aria-hidden="true" />Espetos prontos</h2>
          <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {alerts.map((alert) => (
              <li key={alert.key} className="flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-white p-3">
                <div className="min-w-0">
                  <p className="text-base font-bold text-ink">{alert.title}</p>
                  <p className="text-sm font-semibold text-emerald-800">{alert.action}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">{alert.detail}{alert.readyAt ? ` · pronto ${sinceLabel(alert.readyAt)}` : ''}</p>
                </div>
                <button type="button" className="icon-button shrink-0" onClick={() => setDismissed((current) => new Set(current).add(alert.key))} aria-label={`Ocultar aviso: ${alert.title}`} title="Ocultar aviso"><Check className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {noGrillOrders.length > 0 && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink"><PackageCheck className="h-4 w-4" aria-hidden="true" />Delivery e retirada sem espeto</h2>
          <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {noGrillOrders.map((o) => {
              const label = `${o.order_type === 'PICKUP' ? 'Retirada' : 'Delivery'} #${o.order_number}`;
              return (
                <li key={o.id} className="flex flex-col gap-2 rounded-lg border border-line bg-surface-soft p-3">
                  <p className="text-sm font-bold text-ink">{label} · {o.customer_name}</p>
                  <ul className="text-sm text-ink-secondary">{o.items.map((i) => <li key={i.id}>{i.quantity}x {i.product_name}</li>)}</ul>
                  <button type="button" className="btn-success w-full" onClick={() => markReady(o.id, label)}><PackageCheck className="h-4 w-4" aria-hidden="true" />Pedido pronto</button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
