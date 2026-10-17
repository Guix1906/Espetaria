import { supabase, isSupabaseConfigured } from './supabase';
import { periodBounds } from './financeData';
import { useAuthStore } from '../stores/useAuthStore';
import { useStockStore } from '../stores/useStockStore';

/** Tipos mostrados na Auditoria (filtro "Tipo"). */
export type AuditKind = 'ANULACAO' | 'REABERTURA' | 'ITEM_CANCELADO' | 'ESTORNO' | 'CORRECAO_PAGAMENTO' | 'DELIVERY_CANCELADO' | 'AJUSTE_CONTAGEM' | 'OUTRO';

export const AUDIT_KIND_LABEL: Record<AuditKind, string> = {
  ANULACAO: 'Comanda anulada',
  REABERTURA: 'Comanda reaberta',
  ITEM_CANCELADO: 'Item cancelado',
  ESTORNO: 'Venda estornada',
  CORRECAO_PAGAMENTO: 'Pagamento corrigido',
  DELIVERY_CANCELADO: 'Delivery cancelado',
  AJUSTE_CONTAGEM: 'Ajuste de contagem',
  OUTRO: 'Outras ações',
};

/** Anulações, estornos e cancelamentos ganham etiqueta vermelha. */
export const AUDIT_KIND_ALERT: Record<AuditKind, boolean> = {
  ANULACAO: true, REABERTURA: false, ITEM_CANCELADO: true, ESTORNO: true,
  CORRECAO_PAGAMENTO: false, DELIVERY_CANCELADO: true, AJUSTE_CONTAGEM: false, OUTRO: false,
};

const ACTION_KIND: Record<string, AuditKind> = {
  ANULAR_COMANDA: 'ANULACAO',
  REABRIR_COMANDA: 'REABERTURA',
  CANCELAR_ITEM: 'ITEM_CANCELADO',
  ESTORNAR_VENDA: 'ESTORNO',
  CANCELAR_PAGAMENTO: 'ESTORNO',
  DELIVERY_PAGAMENTO_ESTORNADO: 'ESTORNO',
  FINANCE_ESTORNADO: 'ESTORNO',
  CORRIGIR_VENDA: 'CORRECAO_PAGAMENTO',
  AJUSTE_CONTA: 'CORRECAO_PAGAMENTO',
  CANCELAR_DELIVERY: 'DELIVERY_CANCELADO',
};

/** Ações de rotina que não entram na auditoria (já aparecem em outras telas). */
const ROUTINE = new Set(['ABRIR_COMANDA', 'CRIAR_PEDIDO', 'REGISTRAR_PAGAMENTO', 'FECHAR_COMANDA', 'DELIVERY_PAGO', 'DELIVERY_PIX_AUTOMATICO']);

const ACTION_TEXT: Record<string, string> = {
  FECHAMENTO_TURNO: 'Turno fechado', CUPONS_EXCLUIDOS: 'Cupons excluídos', PRODUTO_CRIADO: 'Produto criado',
  PRODUTO_EDITADO: 'Produto editado', PRODUTO_DESATIVADO: 'Produto desativado', CRIAR_MESA: 'Mesa criada',
  EDITAR_MESA: 'Mesa editada', DESATIVAR_MESA: 'Mesa desativada', FINANCE_PAGO: 'Conta marcada como paga',
  FINANCE_REMOVIDO: 'Lançamento removido', UPSERT_DELIVERY_ZONE: 'Bairro salvo', DEACTIVATE_DELIVERY_ZONE: 'Bairro desativado',
  DELIVERY_PAYOUT_CALCULATED: 'Pagamento de entregador calculado', PIX_PAGO_APOS_CANCELAMENTO: 'PIX pago depois do cancelamento',
};

export interface AuditEvent {
  id: string;
  at: string;
  userId: string | null;
  userName: string;
  kind: AuditKind;
  title: string;
  reason: string | null;
  detail: string | null;
}

type Json = Record<string, unknown> | null;
const pick = (data: Json, ...keys: string[]) => {
  for (const k of keys) { const v = data?.[k]; if (typeof v === 'string' && v.trim()) return v.trim(); }
  return null;
};

export function auditEventFromLog(row: { id: string; created_at: string; user_id: string | null; action: string; entity_type: string; old_data: Json; new_data: Json }, names: Map<string, string>): AuditEvent | null {
  if (ROUTINE.has(row.action)) return null;
  const kind = ACTION_KIND[row.action] ?? 'OUTRO';
  const data = { ...(row.old_data ?? {}), ...(row.new_data ?? {}) };
  const detail = pick(data, 'product_name', 'customer_name', 'name') ?? (typeof data.order_number === 'number' ? `Pedido #${data.order_number}` : null);
  return {
    id: row.id,
    at: row.created_at,
    userId: row.user_id,
    userName: (row.user_id && names.get(row.user_id)) || 'Sistema',
    kind,
    title: kind === 'OUTRO' ? ACTION_TEXT[row.action] ?? row.action.toLowerCase().replace(/_/g, ' ') : AUDIT_KIND_LABEL[kind],
    reason: pick(data, 'reason', 'p_reason', 'cancel_reason', 'motivo', 'notes'),
    detail,
  };
}

/** Auditoria do período: ações registradas em audit_logs + ajustes de contagem do estoque. */
export async function loadAuditEvents(from: string, to: string): Promise<AuditEvent[]> {
  const products = new Map(useStockStore.getState().products.map((p) => [p.id, p.name]));
  const profiles = useAuthStore.getState().availableProfiles ?? [];
  const names = new Map<string, string>(profiles.map((p) => [p.id, p.name]));

  if (!isSupabaseConfigured) {
    const { start, end } = periodBounds(from, to);
    return useStockStore.getState().stockMovements
      .filter((m) => m.movement_type === 'AJUSTE' && m.created_at >= start && m.created_at <= end)
      .map((m) => ({ id: m.id, at: m.created_at, userId: m.user_id, userName: m.user_name || names.get(m.user_id) || 'Sistema', kind: 'AJUSTE_CONTAGEM' as const, title: AUDIT_KIND_LABEL.AJUSTE_CONTAGEM, reason: m.reason, detail: `${m.product_name || products.get(m.product_id) || 'Produto'}: ${m.previous_balance} → ${m.new_balance}` }))
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  const { start, end } = periodBounds(from, to);
  const [logs, adjustments, staff] = await Promise.all([
    supabase.from('audit_logs').select('id, created_at, user_id, action, entity_type, old_data, new_data').gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false }).limit(2000),
    supabase.from('stock_movements').select('id, created_at, user_id, product_id, previous_balance, new_balance, reason').eq('movement_type', 'AJUSTE').gte('created_at', start).lte('created_at', end).limit(2000),
    supabase.from('profiles').select('id, name'),
  ]);
  if (logs.error) throw new Error(logs.error.message);
  if (adjustments.error) throw new Error(adjustments.error.message);
  (staff.data ?? []).forEach((p: { id: string; name: string }) => names.set(p.id, p.name));

  const events: AuditEvent[] = [];
  for (const row of logs.data ?? []) {
    const e = auditEventFromLog(row as Parameters<typeof auditEventFromLog>[0], names);
    if (e) events.push(e);
  }
  for (const m of (adjustments.data ?? []) as { id: string; created_at: string; user_id: string | null; product_id: string; previous_balance: number; new_balance: number; reason: string | null }[]) {
    events.push({ id: `mov-${m.id}`, at: m.created_at, userId: m.user_id, userName: (m.user_id && names.get(m.user_id)) || 'Sistema', kind: 'AJUSTE_CONTAGEM', title: AUDIT_KIND_LABEL.AJUSTE_CONTAGEM, reason: m.reason, detail: `${products.get(m.product_id) || 'Produto'}: ${m.previous_balance} → ${m.new_balance}` });
  }
  return events.sort((a, b) => b.at.localeCompare(a.at));
}
