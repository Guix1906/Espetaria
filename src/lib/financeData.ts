import { supabase, isSupabaseConfigured } from './supabase';
import { generateId } from './utils';
import { useTableStore } from '../stores/useTableStore';
import { useDeliveryStore } from '../stores/useDeliveryStore';
import { useStockStore } from '../stores/useStockStore';
import { useShiftStore } from '../stores/useShiftStore';
import { useAuthStore } from '../stores/useAuthStore';

// ============================================================================
// Financeiro e relatórios. As vendas vêm direto de payments (salão) e
// delivery_orders (delivery); contas a pagar/receber vêm de finance_entries.
// ============================================================================

export type FinanceKind = 'PAGAR' | 'RECEBER';

export interface FinanceEntry {
  id: string;
  kind: FinanceKind;
  description: string;
  category: string;
  amount: number;
  due_date: string;          // AAAA-MM-DD
  paid_at: string | null;
  payment_method: string | null;
  supplier: string | null;
  notes: string | null;
  created_at: string;
}

export interface SaleRecord { id: string; at: string; amount: number; method: string; channel: 'SALAO' | 'DELIVERY' }
export interface ItemRecord { at: string; product_id: string | null; product_name: string; quantity: number; total: number; sector: string; cancelled: boolean; channel: 'SALAO' | 'DELIVERY'; waiter_id: string | null }
export interface DeliveryRecord { at: string; total: number; fee: number; neighborhood: string; status: string; paid: boolean; method: string }
export interface LossRecord { at: string; product_name: string; quantity: number; type: string; reason: string | null }
export interface ShiftRecord { id: string; name: string; opened_at: string; closed_at: string | null; cash_start: number; cash_end: number | null; status: string }
/** Mesa fechada com pagamento válido. total = valor efetivamente pago (estornos não contam). */
export interface TabRecord { closed_at: string; total: number; people: number; discount: number; service_fee: number }

export interface FinanceDataset {
  from: string;
  to: string;
  sales: SaleRecord[];
  items: ItemRecord[];
  deliveries: DeliveryRecord[];
  losses: LossRecord[];
  shifts: ShiftRecord[];
  tabs: TabRecord[];
  entries: FinanceEntry[];
  openTabsTotal: number;
  staff: Record<string, string>;
}

export const FINANCE_CATEGORIES: Record<FinanceKind, string[]> = {
  PAGAR: ['Carnes e insumos', 'Bebidas', 'Carvão e gás', 'Embalagens', 'Funcionários', 'Aluguel', 'Energia e água', 'Internet e sistemas', 'Impostos', 'Manutenção', 'Marketing', 'Outros'],
  RECEBER: ['Eventos e encomendas', 'Convênios', 'Fiado de cliente', 'Cartão a receber', 'Outros'],
};

export const METHOD_LABELS: Record<string, string> = {
  DINHEIRO: 'Dinheiro', PIX: 'PIX', DEBITO: 'Débito', CREDITO: 'Crédito', CARTAO_ENTREGA: 'Cartão na entrega', OUTROS: 'Outros', BOLETO: 'Boleto', TRANSFERENCIA: 'Transferência',
};

const LOCAL_KEY = 'ponto_finance_entries_v1';

/** Início e fim do período como ISO (fim inclusivo até 23:59:59). */
export function periodBounds(from: string, to: string) {
  return { start: new Date(`${from}T00:00:00`).toISOString(), end: new Date(`${to}T23:59:59.999`).toISOString() };
}

export function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString('sv-SE'); // AAAA-MM-DD no fuso local
}

/** Busca paginada (o Supabase limita 1000 linhas por consulta). */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < 50; page++) {
    const { data, error } = await build(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const num = (v: unknown) => Number(v ?? 0) || 0;

function loadLocalEntries(): FinanceEntry[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]') as FinanceEntry[]; } catch { return []; }
}
function saveLocalEntries(entries: FinanceEntry[]) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(entries)); } catch { /* sem armazenamento */ }
}

export async function loadFinanceData(from: string, to: string): Promise<FinanceDataset> {
  const { start, end } = periodBounds(from, to);
  if (!isSupabaseConfigured) return loadDemoData(from, to, start, end);

  type Row = Record<string, unknown>;
  const [payments, deliveries, items, orders, losses, shifts, tabs, entriesInRange, overdue, profiles, openTabs] = await Promise.all([
    fetchAll<Row>((a, b) => supabase.from('payments').select('id, amount, method, status, paid_at').gte('paid_at', start).lte('paid_at', end).range(a, b)),
    fetchAll<Row>((a, b) => supabase.from('delivery_orders').select('id, total, delivery_fee, payment_method, status, created_at, paid_at, address_neighborhood').gte('created_at', start).lte('created_at', end).range(a, b)),
    fetchAll<Row>((a, b) => supabase.from('order_items').select('order_id, product_id, product_name, quantity, unit_price, sector, status, created_at').gte('created_at', start).lte('created_at', end).range(a, b)),
    fetchAll<Row>((a, b) => supabase.from('orders').select('id, created_by').gte('created_at', start).lte('created_at', end).range(a, b)),
    fetchAll<Row>((a, b) => supabase.from('stock_movements').select('product_id, quantity, movement_type, reason, created_at').in('movement_type', ['PERDA', 'DESCARTE', 'CANCELAMENTO_RETORNO']).gte('created_at', start).lte('created_at', end).range(a, b)),
    fetchAll<Row>((a, b) => supabase.from('shifts').select('id, name, opened_at, closed_at, cash_drawer_start, cash_drawer_end, status').gte('opened_at', start).lte('opened_at', end).order('opened_at', { ascending: false }).range(a, b)),
    fetchAll<Row>((a, b) => supabase.from('tabs').select('id, closed_at, total, people_count, discount, service_fee').eq('status', 'CLOSED').gte('closed_at', start).lte('closed_at', end).range(a, b)),
    fetchAll<Row>((a, b) => supabase.from('finance_entries').select('*').gte('due_date', from).lte('due_date', to).range(a, b)),
    fetchAll<Row>((a, b) => supabase.from('finance_entries').select('*').lt('due_date', from).is('paid_at', null).range(a, b)),
    fetchAll<Row>((a, b) => supabase.from('profiles').select('id, name').range(a, b)),
    fetchAll<Row>((a, b) => supabase.from('tabs').select('total').eq('status', 'OPEN').range(a, b)),
  ]);

  // Itens do delivery (ligados aos pedidos do período)
  const deliveryIds = deliveries.map((d) => d.id as string);
  const deliveryItems: Row[] = [];
  for (let i = 0; i < deliveryIds.length; i += 200) {
    const chunk = deliveryIds.slice(i, i + 200);
    const { data, error } = await supabase.from('delivery_order_items').select('delivery_order_id, product_id, product_name, quantity, unit_price, sector').in('delivery_order_id', chunk);
    if (error) throw new Error(error.message);
    deliveryItems.push(...(data ?? []));
  }
  // Pagamentos válidos das mesas fechadas: estorno tira a mesa do ticket médio
  const tabIds = tabs.map((t) => t.id as string);
  const paidByTab = new Map<string, number>();
  for (let i = 0; i < tabIds.length; i += 200) {
    const { data, error } = await supabase.from('payments').select('tab_id, amount').eq('status', 'PAID').in('tab_id', tabIds.slice(i, i + 200));
    if (error) throw new Error(error.message);
    (data ?? []).forEach((p) => paidByTab.set(p.tab_id as string, (paidByTab.get(p.tab_id as string) ?? 0) + num(p.amount)));
  }
  const deliveryById = new Map(deliveries.map((d) => [d.id as string, d]));
  const waiterByOrder = new Map(orders.map((o) => [o.id as string, (o.created_by as string) ?? null]));
  const productName = new Map(useStockStore.getState().products.map((p) => [p.id, p.name]));

  return {
    from, to,
    sales: [
      ...payments.filter((p) => p.status === 'PAID').map((p) => ({ id: p.id as string, at: p.paid_at as string, amount: num(p.amount), method: String(p.method), channel: 'SALAO' as const })),
      ...deliveries.filter((d) => d.paid_at && d.status !== 'CANCELLED').map((d) => ({ id: d.id as string, at: d.paid_at as string, amount: num(d.total), method: String(d.payment_method), channel: 'DELIVERY' as const })),
    ],
    items: [
      ...items.map((i) => ({ at: i.created_at as string, product_id: (i.product_id as string) ?? null, product_name: String(i.product_name), quantity: num(i.quantity), total: num(i.unit_price) * num(i.quantity), sector: String(i.sector), cancelled: i.status === 'CANCELLED', channel: 'SALAO' as const, waiter_id: waiterByOrder.get(i.order_id as string) ?? null })),
      ...deliveryItems.map((i) => { const d = deliveryById.get(i.delivery_order_id as string); return { at: (d?.created_at as string) ?? start, product_id: (i.product_id as string) ?? null, product_name: String(i.product_name), quantity: num(i.quantity), total: num(i.unit_price) * num(i.quantity), sector: String(i.sector), cancelled: d?.status === 'CANCELLED', channel: 'DELIVERY' as const, waiter_id: null }; }),
    ],
    deliveries: deliveries.map((d) => ({ at: d.created_at as string, total: num(d.total), fee: num(d.delivery_fee), neighborhood: String(d.address_neighborhood ?? '—'), status: String(d.status), paid: !!d.paid_at, method: String(d.payment_method) })),
    losses: losses.map((l) => ({ at: l.created_at as string, product_name: productName.get(l.product_id as string) ?? 'Produto', quantity: Math.abs(num(l.quantity)), type: String(l.movement_type), reason: (l.reason as string) ?? null })),
    shifts: shifts.map((s) => ({ id: s.id as string, name: String(s.name), opened_at: s.opened_at as string, closed_at: (s.closed_at as string) ?? null, cash_start: num(s.cash_drawer_start), cash_end: s.cash_drawer_end == null ? null : num(s.cash_drawer_end), status: String(s.status) })),
    tabs: tabs.map((t) => ({ paid: paidByTab.get(t.id as string) ?? 0, t })).filter((x) => x.paid > 0.009)
      .map(({ paid, t }) => ({ closed_at: t.closed_at as string, total: paid, people: num(t.people_count), discount: num(t.discount), service_fee: num(t.service_fee) })),
    entries: [...entriesInRange, ...overdue].map((e) => ({ ...(e as unknown as FinanceEntry), amount: num(e.amount) })),
    openTabsTotal: openTabs.reduce((s, t) => s + num(t.total), 0),
    staff: Object.fromEntries(profiles.map((p) => [p.id as string, String(p.name)])),
  };
}

/** Demonstração: usa os dados que estão na memória deste aparelho. */
function loadDemoData(from: string, to: string, start: string, end: string): FinanceDataset {
  const inRange = (at?: string | null) => !!at && at >= start && at <= end;
  const { payments, orderItems, orders, tabs } = useTableStore.getState();
  const { deliveryOrders } = useDeliveryStore.getState();
  const { stockMovements } = useStockStore.getState();
  const { shiftsHistory } = useShiftStore.getState();
  const waiterByOrder = new Map(orders.map((o) => [o.id, o.created_by]));
  const entries = loadLocalEntries().filter((e) => (e.due_date >= from && e.due_date <= to) || (e.due_date < from && !e.paid_at));
  return {
    from, to,
    sales: [
      ...payments.filter((p) => p.status === 'PAID' && inRange(p.paid_at)).map((p) => ({ id: p.id, at: p.paid_at, amount: p.amount, method: p.method, channel: 'SALAO' as const })),
      ...deliveryOrders.filter((d) => d.paid_at && d.status !== 'CANCELLED' && inRange(d.paid_at)).map((d) => ({ id: d.id, at: d.paid_at!, amount: d.total, method: d.payment_method, channel: 'DELIVERY' as const })),
    ],
    items: [
      ...orderItems.filter((i) => inRange(i.created_at)).map((i) => ({ at: i.created_at, product_id: i.product_id, product_name: i.product_name, quantity: i.quantity, total: i.unit_price * i.quantity, sector: i.sector, cancelled: i.status === 'CANCELLED', channel: 'SALAO' as const, waiter_id: waiterByOrder.get(i.order_id) ?? null })),
      ...deliveryOrders.filter((d) => inRange(d.created_at)).flatMap((d) => (d.items ?? []).map((i) => ({ at: d.created_at, product_id: i.product_id, product_name: i.product_name, quantity: i.quantity, total: i.unit_price * i.quantity, sector: i.sector, cancelled: d.status === 'CANCELLED', channel: 'DELIVERY' as const, waiter_id: null }))),
    ],
    deliveries: deliveryOrders.filter((d) => inRange(d.created_at)).map((d) => ({ at: d.created_at, total: d.total, fee: d.delivery_fee, neighborhood: d.address_neighborhood, status: d.status, paid: !!d.paid_at, method: d.payment_method })),
    losses: stockMovements.filter((m) => ['PERDA', 'DESCARTE', 'CANCELAMENTO_RETORNO'].includes(m.movement_type) && inRange(m.created_at)).map((m) => ({ at: m.created_at, product_name: m.product_name ?? 'Produto', quantity: Math.abs(m.quantity), type: m.movement_type, reason: m.reason ?? null })),
    shifts: shiftsHistory.filter((s) => inRange(s.opened_at)).map((s) => ({ id: s.id, name: s.name, opened_at: s.opened_at, closed_at: s.closed_at, cash_start: s.cash_drawer_start, cash_end: s.cash_drawer_end, status: s.status })),
    tabs: tabs.filter((t) => t.status === 'CLOSED' && inRange(t.closed_at))
      .map((t) => ({ t, paid: payments.filter((p) => p.tab_id === t.id && p.status === 'PAID').reduce((s, p) => s + p.amount, 0) }))
      .filter((x) => x.paid > 0.009)
      .map(({ t, paid }) => ({ closed_at: t.closed_at!, total: paid, people: t.people_count, discount: t.discount, service_fee: t.service_fee })),
    entries,
    openTabsTotal: tabs.filter((t) => t.status === 'OPEN').reduce((s, t) => s + t.total, 0),
    staff: Object.fromEntries(useAuthStore.getState().availableProfiles.map((p) => [p.id, p.name])),
  };
}

// ---------------------------------------------------------------- lançamentos

export type FinanceEntryInput = Omit<FinanceEntry, 'id' | 'created_at'>;

export const financeEntriesApi = {
  async save(input: FinanceEntryInput, id?: string): Promise<void> {
    if (!isSupabaseConfigured) {
      const all = loadLocalEntries();
      const entry: FinanceEntry = { ...input, id: id ?? generateId(), created_at: new Date().toISOString() };
      saveLocalEntries(id ? all.map((e) => (e.id === id ? { ...e, ...input } : e)) : [entry, ...all]);
      return;
    }
    const { error } = await supabase.rpc('save_finance_entry', {
      p_kind: input.kind,
      p_description: input.description,
      p_amount: input.amount,
      p_due_date: input.due_date,
      p_category: input.category ?? 'Outros',
      p_supplier: input.supplier ?? null,
      p_notes: input.notes ?? null,
      p_id: id ?? null,
    });
    if (error) throw new Error(error.message.includes('save_finance_entry') && error.message.includes('exist') ? 'Função save_finance_entry não encontrada: rode a migração 00017 no Supabase.' : error.message);
  },
  async setPaid(id: string, paid: boolean, method?: string | null): Promise<void> {
    if (!isSupabaseConfigured) {
      const patch = { paid_at: paid ? new Date().toISOString() : null, payment_method: paid ? method ?? null : null };
      saveLocalEntries(loadLocalEntries().map((e) => (e.id === id ? { ...e, ...patch } : e)));
      return;
    }
    const { error } = await supabase.rpc('set_finance_paid', {
      p_id: id,
      p_paid: paid,
      p_method: method ?? null,
    });
    if (error) throw new Error(error.message);
  },
  async remove(id: string): Promise<void> {
    if (!isSupabaseConfigured) { saveLocalEntries(loadLocalEntries().filter((e) => e.id !== id)); return; }
    const { error } = await supabase.rpc('remove_finance_entry', { p_id: id });
    if (error) throw new Error(error.message);
  },
};

// ---------------------------------------------------------------- vendas (gerência)

export const SALE_METHODS: Record<'SALAO' | 'DELIVERY', string[]> = {
  SALAO: ['PIX', 'DINHEIRO', 'DEBITO', 'CREDITO', 'OUTROS'],
  DELIVERY: ['PIX', 'DINHEIRO', 'CARTAO_ENTREGA'],
};

/** Corrigir forma de pagamento / estornar venda já registrada (migração 00024). */
export const salesApi = {
  async adjust(sale: SaleRecord, method: string, reason: string): Promise<void> {
    if (!isSupabaseConfigured) {
      if (sale.channel === 'SALAO') useTableStore.setState({ payments: useTableStore.getState().payments.map((p) => (p.id === sale.id ? { ...p, method: method as typeof p.method } : p)) });
      else useDeliveryStore.setState({ deliveryOrders: useDeliveryStore.getState().deliveryOrders.map((d) => (d.id === sale.id ? { ...d, payment_method: method as typeof d.payment_method } : d)) });
      return;
    }
    const { error } = await supabase.rpc('adjust_sale', { p_channel: sale.channel, p_id: sale.id, p_method: method, p_reason: reason });
    if (error) throw new Error(error.message.includes('adjust_sale') ? 'Rode a migração 00024 no Supabase para corrigir vendas.' : error.message);
  },
  async void(sale: SaleRecord, reason: string): Promise<void> {
    if (!isSupabaseConfigured) {
      if (sale.channel === 'SALAO') useTableStore.setState({ payments: useTableStore.getState().payments.map((p) => (p.id === sale.id ? { ...p, status: 'CANCELLED' as const } : p)) });
      else useDeliveryStore.setState({ deliveryOrders: useDeliveryStore.getState().deliveryOrders.map((d) => (d.id === sale.id ? { ...d, paid_at: undefined } : d)) });
      return;
    }
    const { error } = await supabase.rpc('void_sale', { p_channel: sale.channel, p_id: sale.id, p_reason: reason });
    if (error) throw new Error(error.message.includes('void_sale') ? 'Rode a migração 00024 no Supabase para estornar vendas.' : error.message);
  },
};
// ---------------------------------------------------------------- cálculos

export interface CashFlowBucket { key: string; label: string; inflow: number; outflow: number; inflowForecast: number; outflowForecast: number; balance: number; projected: number }

const dayKey = (iso: string) => new Date(iso).toLocaleDateString('sv-SE');

/**
 * Fluxo de caixa por dia (ou por mês em períodos longos).
 * Realizado: vendas pagas (salão + delivery) e contas quitadas.
 * Previsto: contas em aberto pela data de vencimento e delivery ainda não pago.
 */
export type CashFlowGrouping = 'day' | 'week' | 'month' | 'year' | 'auto';

/** Segunda-feira da semana da data (AAAA-MM-DD). */
function weekStart(date: string) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toLocaleDateString('sv-SE');
}

export function buildCashFlow(data: FinanceDataset, grouping: CashFlowGrouping = 'auto'): CashFlowBucket[] {
  const days = Math.round((new Date(data.to).getTime() - new Date(data.from).getTime()) / 86_400_000) + 1;
  const mode = grouping === 'auto' ? (days > 62 ? 'month' : 'day') : grouping;
  const keyOf = (date: string) => (mode === 'month' ? date.slice(0, 7) : mode === 'year' ? date.slice(0, 4) : mode === 'week' ? weekStart(date) : date);
  const labelOf = (key: string) => {
    if (mode === 'year') return key;
    if (mode === 'month') return new Date(`${key}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    const d = new Date(`${key}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return mode === 'week' ? `Sem. ${d}` : d;
  };
  const buckets = new Map<string, CashFlowBucket>();
  const cursor = new Date(`${data.from}T12:00:00`);
  const last = new Date(`${data.to}T12:00:00`);
  while (cursor <= last) {
    const key = keyOf(cursor.toLocaleDateString('sv-SE'));
    if (!buckets.has(key)) buckets.set(key, { key, label: labelOf(key), inflow: 0, outflow: 0, inflowForecast: 0, outflowForecast: 0, balance: 0, projected: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  const add = (date: string, field: 'inflow' | 'outflow' | 'inflowForecast' | 'outflowForecast', value: number) => {
    const bucket = buckets.get(keyOf(date));
    if (bucket) bucket[field] += value;
  };
  const today = todayISO();
  data.sales.forEach((s) => add(dayKey(s.at), 'inflow', s.amount));
  data.deliveries.filter((d) => !d.paid && d.status !== 'CANCELLED').forEach((d) => add(dayKey(d.at), 'inflowForecast', d.total));
  data.entries.forEach((e) => {
    if (e.paid_at) add(dayKey(e.paid_at), e.kind === 'RECEBER' ? 'inflow' : 'outflow', e.amount);
    else add(e.due_date < data.from ? data.from : e.due_date, e.kind === 'RECEBER' ? 'inflowForecast' : 'outflowForecast', e.amount);
  });
  // Comandas abertas agora entram como entrada prevista de hoje
  if (data.openTabsTotal > 0) add(today, 'inflowForecast', data.openTabsTotal);
  // Saldo: só o realizado. Projetado: realizado + previsto (o que deve sobrar no fim de cada período)
  let running = 0;
  let projected = 0;
  return [...buckets.values()].map((b) => {
    running += b.inflow - b.outflow;
    projected += b.inflow - b.outflow + b.inflowForecast - b.outflowForecast;
    return { ...b, balance: running, projected };
  });
}

export function sumBy<T>(rows: T[], key: (row: T) => string, value: (row: T) => number) {
  const map = new Map<string, number>();
  rows.forEach((row) => map.set(key(row), (map.get(key(row)) ?? 0) + value(row)));
  return [...map.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
}

/** Exporta linhas como CSV (abre no Excel, com ; e acentos). */
export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = typeof v === 'number' ? String(v).replace('.', ',') : v;
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + [header, ...rows].map((r) => r.map(escape).join(';')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
