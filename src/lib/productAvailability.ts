import type { DailyPrepStock, Product } from '../types/domain';

/** A partir de quantas unidades o item aparece como "acabando" (garçom, visão geral e estoque). */
export const LOW_STOCK_THRESHOLD = 3;

export function getProductAvailability(product: Product, stock?: DailyPrepStock) {
  return {
    isAvailable: product.active && product.available && (!stock || (!stock.is_exhausted && stock.current_quantity > 0)),
    remaining: stock?.current_quantity ?? null,
  };
}

export type StockLevel = 'ok' | 'low' | 'out' | 'untracked';

/** Situação do item para o garçom: `left` já desconta o que está no rascunho do pedido. */
export function getStockLevel(isAvailable: boolean, left: number | null): StockLevel {
  if (!isAvailable || left === 0) return 'out';
  if (left === null) return 'untracked';
  return left <= LOW_STOCK_THRESHOLD ? 'low' : 'ok';
}

/** Sabores do produto, escritos na descrição do cadastro: "Sabores: Coca-Cola, Guaraná, Fanta". */
export function productFlavors(description?: string | null): string[] {
  const match = description?.match(/sabor(?:es)?\s*:\s*([^\n.]+)/i);
  return match ? match[1]!.split(/,|\se\s/).map((flavor) => flavor.trim()).filter(Boolean) : [];
}
