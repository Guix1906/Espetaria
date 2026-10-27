import type { TableStatus } from '../types/enums';

/**
 * Mapa único de status (painel, garçom, caixa e delivery).
 * Regra: cor sólida só para o que pede ação agora; rotina fica neutra.
 */
export type StatusKind = 'free' | 'occupied' | 'preparing' | 'ready' | 'bill' | 'reserved' | 'alert';

export const STATUS_STYLES: Record<StatusKind, string> = {
  free: 'border border-emerald-600 text-emerald-800',
  occupied: 'bg-surface-muted text-ink',
  preparing: 'bg-amber-50 text-amber-800',
  ready: 'bg-emerald-600 text-white',
  bill: 'bg-brand-500 text-white',
  reserved: 'border border-dashed border-line-strong text-ink-secondary',
  alert: 'bg-rose-600 text-white',
};

/**
 * Um nome por etapa, igual para cliente, painel e garçom.
 * Retirada só troca "Entregue" por "Retirado".
 */
export const STAGE_LABELS = {
  received: 'Recebido',
  onGrill: 'Na brasa',
  ready: 'Pronto',
  out: 'Saiu para entrega',
  delivered: 'Entregue',
  pickedUp: 'Retirado',
} as const;

/** Faixa no topo do cartão da mesa. */
export const STATUS_TOP_BORDER: Record<StatusKind, string> = {
  free: 'border-t-emerald-600',
  occupied: 'border-t-line-strong',
  preparing: 'border-t-amber-500',
  ready: 'border-t-emerald-600',
  bill: 'border-t-brand-500',
  reserved: 'border-t-line-strong [border-top-style:dashed]',
  alert: 'border-t-rose-600',
};

export function tableStatusKind(status: TableStatus): StatusKind {
  switch (status) {
    case 'LIVRE': return 'free';
    case 'AGUARDANDO_CONTA': return 'bill';
    case 'RESERVADA': return 'reserved';
    default: return 'occupied';
  }
}
