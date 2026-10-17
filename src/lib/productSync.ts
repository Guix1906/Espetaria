import type { Product } from '../types/domain';
import { logger } from './logger';
import { useRemoteErrorStore } from './remote';
import { supabase, isSupabaseConfigured } from './supabase';

/** Colunas da tabela products (o restante é só da interface). */
const PRODUCT_COLUMNS = [
  'id', 'category_id', 'name', 'description', 'price', 'image_url', 'active', 'available', 'sector', 'type',
  'tracks_stock', 'is_cubas', 'portions_per_cuba', 'allows_doneness', 'allows_notes', 'display_order',
] as const;

function toRow(product: Partial<Product>) {
  return Object.fromEntries(
    Object.entries(product).filter(([key, value]) => (PRODUCT_COLUMNS as readonly string[]).includes(key) && value !== undefined)
  );
}

async function failed(action: string, message: string) {
  logger.error({ context: 'ProductSync', message: `Falha ao ${action} produto`, data: { message } });
  useRemoteErrorStore.setState({ lastError: `Produto não salvo no servidor (${action}): ${message}` });
  // Desfaz a alteração local recarregando o cardápio oficial
  const { syncService } = await import('./syncService');
  await syncService.hydrateAll();
}

/**
 * Grava no banco as mudanças do cadastro de produtos, para todos os aparelhos
 * (celulares dos garçons, caixa, cardápio digital) receberem o cardápio atualizado.
 * Sem Supabase (demonstração), não faz nada.
 */
export const productSync = {
  async insert(product: Product) {
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.rpc('create_product', {
      p_name: product.name,
      p_price: product.price,
      p_category_id: product.category_id,
      p_sector: product.sector ?? 'NONE',
      p_type: product.type ?? 'OUTROS',
      p_description: product.description ?? null,
      p_image_url: product.image_url ?? null,
      p_tracks_stock: product.tracks_stock ?? false,
      p_is_cubas: product.is_cubas ?? false,
      p_portions_per_cuba: product.portions_per_cuba ?? null,
      p_allows_doneness: product.allows_doneness ?? false,
      p_allows_notes: product.allows_notes ?? true,
      p_display_order: product.display_order ?? 0,
      // Mesmo ID do aparelho: edição logo após o cadastro e o Realtime acham o produto
      p_id: product.id,
    });
    if (error) await failed('cadastrar', error.message);
  },

  async update(id: string, updates: Partial<Product>) {
    if (!isSupabaseConfigured) return;
    const row = toRow(updates);
    delete (row as Record<string, unknown>).id;
    if (Object.keys(row).length === 0) return;
    const { error } = await supabase.rpc('update_product', { p_id: id, p_updates: row });
    if (error) await failed('atualizar', error.message);
  },

  /** Produto já vendido não pode sumir do histórico: nesse caso ele é só desativado. */
  async remove(id: string): Promise<'deleted' | 'deactivated' | 'local'> {
    if (!isSupabaseConfigured) return 'local';
    const { error } = await supabase.rpc('deactivate_product', { p_id: id });
    if (!error) return 'deactivated';
    await failed('desativar', error.message);
    return 'deactivated';
  },
};
