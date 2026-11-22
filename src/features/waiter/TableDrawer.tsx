import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Clock, Plus, Printer, Receipt, Users, X } from 'lucide-react';
import { Dialog } from '../../components/ui/Dialog';
import { TableSettlementModal } from '../cashier/TableSettlementModal';
import { formatBRL, formatDoneness, getTableStatusConfig } from '../../lib/formatters';
import { STATUS_STYLES, tableStatusKind, type StatusKind } from '../../lib/statusStyles';
import { openFor } from '../../components/ui/TableCard';
import { useStockStore } from '../../stores/useStockStore';
import type { OrderItem, RestaurantTable, Tab } from '../../types/domain';

interface TableDrawerProps {
  table: RestaurantTable;
  tab?: Tab;
  items: OrderItem[];
  readyCount?: number;
  now: number;
  onClose: () => void;
  onOrder: () => void;
  onPrint: () => void;
  onTransfer: () => void;
}

const ITEM_STAGE: Record<string, { label: string; kind: StatusKind } | undefined> = {
  RECEIVED: { label: 'Recebido', kind: 'occupied' },
  IN_PREPARATION: { label: 'Na brasa', kind: 'preparing' },
  READY: { label: 'Pronto', kind: 'ready' },
};

/** Gaveta da mesa: entra pela direita e mostra a comanda inteira com um toque no cartão. */
export function TableDrawer({ table, tab, items, readyCount = 0, now, onClose, onOrder, onPrint, onTransfer }: TableDrawerProps) {
  const [closing, setClosing] = useState(false);
  const [paying, setPaying] = useState(false);
  const products = useStockStore((s) => s.products);
  const imageOf = useMemo(() => new Map(products.map((p) => [p.id, p.image_url])), [products]);
  const padNumber = String(table.number).padStart(2, '0');
  const status = getTableStatusConfig(table.status);
  const kind = tableStatusKind(table.status);
  const opened = openFor(tab?.opened_at, now);
  const visible = items.filter((i) => i.status !== 'CANCELLED').sort((a, b) => a.created_at.localeCompare(b.created_at));
  const quantity = visible.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = tab?.subtotal ?? visible.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
  const customer = tab?.customer_name && tab.customer_name !== `Mesa ${table.number}` ? tab.customer_name : null;

  // Fecha com o mesmo deslize, ao contrário
  const close = () => setClosing(true);
  // Liga a entrada só depois que a janela já está na tela; assim o deslize aparece de verdade
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setEntered(true)); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, []);
  useEffect(() => {
    if (!closing) return;
    const id = window.setTimeout(onClose, 250);
    return () => window.clearTimeout(id);
  }, [closing, onClose]);
  const then = (action: () => void) => () => { action(); onClose(); };

  return (
    <Dialog label={`Mesa ${padNumber}`} onClose={close} placement="drawer">
      {/* Cobrar: o pagamento entra ao lado (à esquerda) da lista de itens, sem repetir a descrição */}
      {paying && !closing && (
        <TableSettlementModal table={table} isOpen variant="payment" onClose={() => setPaying(false)} onFinished={onClose} />
      )}
      <div className={`dialog-panel table-drawer flex flex-col ${entered && !closing ? 'table-drawer--in' : ''} ${paying ? 'table-drawer--paying' : ''}`} onClick={(e) => e.stopPropagation()}>
        <header className="border-b border-line px-4 pb-3 pt-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="font-mono text-2xl font-bold tabular-nums leading-tight text-ink">Mesa {padNumber}</h2>
              {customer && <p className="truncate text-sm text-ink-secondary" title={customer}>{customer}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <button type="button" onClick={onPrint} className="flex h-10 w-10 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink" title="Imprimir pré-conta" aria-label="Imprimir pré-conta">
                <Printer className="h-5 w-5" />
              </button>
              <button type="button" onClick={then(onTransfer)} className="flex h-10 w-10 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink" title="Transferir mesa" aria-label="Transferir mesa">
                <ArrowLeftRight className="h-5 w-5" />
              </button>
              <button type="button" onClick={close} className="flex h-10 w-10 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink" title="Fechar" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-ink-muted">
            <span className={`status-badge ${STATUS_STYLES[kind]}`}>{status.label}</span>
            {readyCount > 0 && <span className={`status-badge ${STATUS_STYLES.ready}`}>{readyCount} pronto{readyCount > 1 ? 's' : ''}</span>}
            {opened && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{opened}</span>}
            <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden="true" />{tab?.people_count || 1}</span>
          </div>
        </header>

        <div className="px-4 pt-3">
          <button type="button" onClick={then(onOrder)} className="btn-secondary min-h-[44px] w-full">
            <Plus className="h-4 w-4" aria-hidden="true" />Adicionar itens
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-muted">Nenhum item lançado ainda.</p>
          ) : (
            <ul className="divide-y divide-line rounded-md border border-line bg-surface">
              {visible.map((item) => {
                const image = imageOf.get(item.product_id);
                const stage = ITEM_STAGE[item.status];
                const detail = [item.doneness ? formatDoneness(item.doneness) : null, item.notes].filter(Boolean).join(' · ');
                return (
                  <li key={item.id} className="flex gap-3 px-3 py-2.5">
                    {image ? (
                      <img src={image} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-md object-cover" />
                    ) : (
                      <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-surface-muted text-base font-semibold text-ink-muted">
                        {item.product_name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-snug text-ink">{item.product_name}</p>
                        {stage && <span className={`status-badge shrink-0 ${STATUS_STYLES[stage.kind]}`}>{stage.label}</span>}
                      </div>
                      {detail && <p className="mt-0.5 text-xs leading-snug text-ink-muted">{detail}</p>}
                      <div className="mt-1 flex items-baseline justify-between gap-2">
                        <span className="font-mono text-[13px] tabular-nums text-ink-muted">{item.quantity} × {formatBRL(item.unit_price)}</span>
                        <span className="font-mono text-sm font-semibold tabular-nums text-ink">{formatBRL(item.unit_price * item.quantity)}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="border-t border-line bg-surface-soft px-4 pb-4 pt-3">
          <dl className="space-y-1 text-sm text-ink-secondary">
            <div className="flex justify-between"><dt>{quantity} {quantity === 1 ? 'item' : 'itens'}</dt><dd className="font-mono tabular-nums">{formatBRL(subtotal)}</dd></div>
            {!!tab?.service_fee && <div className="flex justify-between"><dt>Taxa de serviço</dt><dd className="font-mono tabular-nums">{formatBRL(tab.service_fee)}</dd></div>}
            {!!tab?.discount && <div className="flex justify-between"><dt>Desconto</dt><dd className="font-mono tabular-nums">−{formatBRL(tab.discount)}</dd></div>}
          </dl>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-lg font-semibold text-ink">Total</span>
            <span className="font-mono text-3xl font-bold tabular-nums text-ink">{formatBRL(tab?.total ?? subtotal)}</span>
          </div>
          {!paying && (
            <button type="button" onClick={() => setPaying(true)} className="btn-primary mt-3 min-h-[52px] w-full text-base">
              <Receipt className="h-5 w-5" aria-hidden="true" />Cobrar
            </button>
          )}
        </footer>
      </div>
    </Dialog>
  );
}
