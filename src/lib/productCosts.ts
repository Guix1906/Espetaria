import { supabase, isSupabaseConfigured } from './supabase';
import { useRemoteErrorStore } from './remote';

// ============================================================================
// Custo de cada produto (migração 00036). Tabela separada de products porque
// products é lido pelo cardápio público; product_costs só Master/Gerente leem.
// ============================================================================

const LOCAL_KEY = 'ponto_product_costs_v1';
const MISSING_MIGRATION = 'Custo salvo só neste aparelho: falta rodar a migração 00036 no Supabase.';

function loadLocal(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}') as Record<string, number>; } catch { return {}; }
}
function saveLocal(costs: Record<string, number>) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(costs)); } catch { /* sem armazenamento */ }
}

/** Custos por produto. `available` = false quando a tabela ainda não existe no banco. */
export async function loadProductCosts(): Promise<{ costs: Record<string, number>; available: boolean }> {
  if (!isSupabaseConfigured) return { costs: loadLocal(), available: true };
  const { data, error } = await supabase.from('product_costs').select('product_id, cost');
  if (error) return { costs: {}, available: false };
  return { costs: Object.fromEntries((data ?? []).map((r) => [r.product_id as string, Number(r.cost) || 0])), available: true };
}

/** Grava (ou apaga, com null) o custo de um produto. */
export async function saveProductCost(productId: string, cost: number | null): Promise<void> {
  if (!isSupabaseConfigured) {
    const costs = loadLocal();
    if (cost == null) delete costs[productId]; else costs[productId] = cost;
    saveLocal(costs);
    return;
  }
  // Produto novo é gravado no banco em segundo plano: tenta de novo enquanto ele ainda não existe (FK)
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = cost == null
      ? await supabase.from('product_costs').delete().eq('product_id', productId)
      : await supabase.from('product_costs').upsert({ product_id: productId, cost, updated_at: new Date().toISOString() });
    if (!error) return;
    if (error.code !== '23503') {
      useRemoteErrorStore.setState({ lastError: error.code === '42P01' ? MISSING_MIGRATION : `Custo do produto não salvo: ${error.message}` });
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  useRemoteErrorStore.setState({ lastError: 'Custo do produto não salvo: o produto ainda não foi gravado no banco. Edite e salve de novo.' });
}
