import { supabase, isSupabaseConfigured } from './supabase';
import { useShiftStore } from '../stores/useShiftStore';
import { useStockStore } from '../stores/useStockStore';

export interface LastShiftPrep {
  shiftName: string;
  cashStart: number;
  items: { productId: string; quantity: number; cubas: number; portions: number }[];
}

/** Quantidades iniciais e fundo de troco do último turno fechado (só leitura, para "Repetir último turno"). */
export async function loadLastClosedShiftPrep(): Promise<LastShiftPrep | null> {
  type Row = { product_id: string; initial_quantity: number; cubas_count: number; portions_per_cuba: number };
  const toItems = (rows: Row[]) => rows.map((r) => ({
    productId: r.product_id,
    quantity: Number(r.initial_quantity) || 0,
    cubas: Number(r.cubas_count) || 0,
    portions: Number(r.portions_per_cuba) || 0,
  }));

  if (!isSupabaseConfigured) {
    const last = [...useShiftStore.getState().shiftsHistory]
      .filter((s) => s.status === 'FECHADO')
      .sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''))[0];
    if (!last) return null;
    const rows = useStockStore.getState().dailyPrepStock.filter((s) => s.shift_id === last.id);
    return { shiftName: last.name, cashStart: last.cash_drawer_start, items: toItems(rows) };
  }

  const { data: shift, error } = await supabase
    .from('shifts')
    .select('id, name, cash_drawer_start')
    .eq('status', 'FECHADO')
    .order('closed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!shift) return null;

  const { data: rows, error: stockError } = await supabase
    .from('daily_prep_stock')
    .select('product_id, initial_quantity, cubas_count, portions_per_cuba')
    .eq('shift_id', shift.id);
  if (stockError) throw new Error(stockError.message);

  return { shiftName: String(shift.name), cashStart: Number(shift.cash_drawer_start) || 0, items: toItems((rows || []) as Row[]) };
}
