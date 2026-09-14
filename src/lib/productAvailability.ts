import type { DailyPrepStock, Product } from '../types/domain';

export function getProductAvailability(product: Product, stock?: DailyPrepStock) {
  return {
    isAvailable: product.active && product.available && (!stock || (!stock.is_exhausted && stock.current_quantity > 0)),
    remaining: stock?.current_quantity ?? null,
  };
}
