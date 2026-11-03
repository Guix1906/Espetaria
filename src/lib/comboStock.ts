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
  const base = products.find((p) => p.active !== false && p.id !== product.id && norm(p.name) === baseName);
  const rice = products.find((p) => p.active !== false && /^arroz(\b|$)/i.test(norm(p.name)));
  return [product.id, ...(base ? [base.id] : []), ...(rice ? [rice.id] : [])];
}

/** Junta "X" e "X com acompanhamento" em um item só da lista (usam o mesmo estoque). */
export function pairCombos(list: Product[], allActive: Product[]): { product: Product; combo: Product | null }[] {
  const pairs: { product: Product; combo: Product | null }[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const baseName = norm(item.name.replace(COMBO_SUFFIX, ''));
    const combo = isComboProduct(item) ? item : allActive.find((p) => isComboProduct(p) && norm(p.name.replace(COMBO_SUFFIX, '')) === baseName) ?? null;
    const base = isComboProduct(item) ? allActive.find((p) => !isComboProduct(p) && norm(p.name) === baseName) ?? null : item;
    const product = base ?? item;
    if (seen.has(product.id)) continue;
    seen.add(product.id);
    pairs.push({ product, combo: base ? combo : null });
  }
  return pairs;
}

interface Line { product: Product; quantity: number }

/** Combo com espeto cadastrado, mas sem saldo (espeto não contado no turno, esgotado ou pausado): não pode ser vendido. */
export function comboBlockedByBase(product: Product, products: Product[], stocks: DailyPrepStock[]): boolean {
  if (!isComboProduct(product) || product.tracks_stock === false) return false;
  const baseName = norm(product.name.replace(COMBO_SUFFIX, ''));
  const base = products.find((p) => p.active !== false && p.id !== product.id && norm(p.name) === baseName);
  if (!base) return false;
  if (base.available === false) return true;
  const stock = stocks.find((s) => s.product_id === base.id);
  return !stock || stock.is_exhausted || stock.current_quantity <= 0;
}

/**
 * Quanto ainda dá para pedir do produto, já descontando o rascunho
 * (um combo no rascunho também ocupa o espeto e o arroz). `null` = sem controle de estoque.
 */
export function remainingFor(product: Product, products: Product[], stocks: DailyPrepStock[], cart: Line[]): number | null {
  if (product.tracks_stock === false) return null;

  if (isComboProduct(product)) {
    const baseName = norm(product.name.replace(COMBO_SUFFIX, ''));
    const base = products.find((p) => p.active !== false && p.id !== product.id && norm(p.name) === baseName);
    const rice = products.find((p) => p.active !== false && /^arroz(\b|$)/i.test(norm(p.name)));

    if (base && base.available === false) return 0;
    if (!rice || rice.available === false) return 0;

    const baseStock = base ? stocks.find((s) => s.product_id === base.id) : undefined;
    const riceStock = stocks.find((s) => s.product_id === rice.id);

    if (base && (!baseStock || baseStock.is_exhausted || baseStock.current_quantity <= 0)) return 0;
    if (!riceStock || riceStock.is_exhausted || riceStock.current_quantity <= 0) return 0;

    const riceUsed = cart.filter((line) => stockUnitIds(line.product, products).includes(rice.id)).reduce((sum, line) => sum + line.quantity, 0);
    if (!base || !baseStock) return Math.max(0, riceStock.current_quantity - riceUsed);
    const baseUsed = cart.filter((line) => stockUnitIds(line.product, products).includes(base.id)).reduce((sum, line) => sum + line.quantity, 0);

    const baseFree = Math.max(0, baseStock.current_quantity - baseUsed);
    const riceFree = Math.max(0, riceStock.current_quantity - riceUsed);

    return Math.min(baseFree, riceFree);
  }

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
  if (isComboProduct(product)) {
    const baseName = norm(product.name.replace(COMBO_SUFFIX, ''));
    const base = products.find((p) => p.active !== false && p.id !== product.id && norm(p.name) === baseName);
    const rice = products.find((p) => p.active !== false && /^arroz(\b|$)/i.test(norm(p.name)));

    if (!base || base.available === false) return base?.name ?? 'Espeto base';
    if (!rice || rice.available === false) return rice?.name ?? 'Arroz';

    const baseStock = stocks.find((s) => s.product_id === base.id);
    const riceStock = stocks.find((s) => s.product_id === rice.id);

    if (!baseStock || baseStock.is_exhausted || baseStock.current_quantity <= 0) return base.name;
    if (!riceStock || riceStock.is_exhausted || riceStock.current_quantity <= 0) return rice.name;

    const baseUsed = cart.filter((line) => stockUnitIds(line.product, products).includes(base.id)).reduce((sum, line) => sum + line.quantity, 0);
    const riceUsed = cart.filter((line) => stockUnitIds(line.product, products).includes(rice.id)).reduce((sum, line) => sum + line.quantity, 0);

    const baseFree = baseStock.current_quantity - baseUsed;
    const riceFree = riceStock.current_quantity - riceUsed;

    return baseFree <= riceFree ? base.name : rice.name;
  }

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
