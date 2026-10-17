import type { DailyPrepStock, Product } from '../types/domain';

/**
 * Espeto "com acompanhamento" usa o estoque do espeto base + 1 arroz
 * (mesma regra do banco, migração 00031: pelo nome do produto).
 */
const COMBO_SUFFIX = /\s+com acompanhamento\s*$/i;
const norm = (name: string) => name.trim().toLocaleLowerCase('pt-BR');

export function isComboProduct(product: Pick<Product, 'name'>) {
  return COMBO_SUFFIX.test(product.name);
}

/** Produtos cujo estoque é usado ao vender 1 unidade (o próprio + espeto base + arroz). */
export function stockUnitIds(product: Product, products: Product[]): string[] {
  if (!isComboProduct(product)) return [product.id];
  const baseName = norm(product.name.replace(COMBO_SUFFIX, ''));
  const base = products.find((p) => p.active && p.id !== product.id && norm(p.name) === baseName);
  const rice = products.find((p) => p.active && norm(p.name) === 'arroz');
  return [product.id, ...(base ? [base.id] : []), ...(rice ? [rice.id] : [])];
}

interface Line { product: Product; quantity: number }

/**
 * Quanto ainda dá para pedir do produto, já descontando o rascunho
 * (um combo no rascunho também ocupa o espeto e o arroz). `null` = sem controle de estoque.
 */
export function remainingFor(product: Product, products: Product[], stocks: DailyPrepStock[], cart: Line[]): number | null {
  let left: number | null = null;
  for (const unitId of stockUnitIds(product, products)) {
    const stock = stocks.find((s) => s.product_id === unitId);
    if (!stock) continue;
    const used = cart.filter((line) => stockUnitIds(line.product, products).includes(unitId)).reduce((sum, line) => sum + line.quantity, 0);
    const free = stock.is_exhausted ? 0 : Math.max(0, stock.current_quantity - used);
    left = left === null ? free : Math.min(left, free);
  }
  return left;
}

/** Nome da peça que está limitando (para a mensagem de erro), ex.: "Arroz". */
export function limitingName(product: Product, products: Product[], stocks: DailyPrepStock[], cart: Line[]): string {
  let worst: { name: string; free: number } | null = null;
  for (const unitId of stockUnitIds(product, products)) {
    const stock = stocks.find((s) => s.product_id === unitId);
    if (!stock) continue;
    const used = cart.filter((line) => stockUnitIds(line.product, products).includes(unitId)).reduce((sum, line) => sum + line.quantity, 0);
    const free = stock.is_exhausted ? 0 : stock.current_quantity - used;
    const name = products.find((p) => p.id === unitId)?.name ?? product.name;
    if (!worst || free < worst.free) worst = { name, free };
  }
  return worst?.name ?? product.name;
}
