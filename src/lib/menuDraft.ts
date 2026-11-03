import { appStorage } from './storage';

/** Sacola guardada no aparelho: sobrevive a recarregar a página, mas não fica de um dia para o outro. */
const CART_KEY = 'ponto.cardapio.sacola.v1';
const FORM_KEY = 'ponto.cardapio.etapas.v1';
export const CART_DRAFT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export interface CartDraft<T> {
  cart: T[];
  checkoutKey: string;
  savedAt: number;
}

export function parseCartDraft<T>(raw: string | null, now: number): CartDraft<T> | null {
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as CartDraft<T>;
    if (!Array.isArray(draft.cart) || !draft.cart.length || !draft.checkoutKey) return null;
    return now - Number(draft.savedAt) < CART_DRAFT_MAX_AGE_MS ? draft : null;
  } catch {
    return null;
  }
}

export function loadCartDraft<T>(): CartDraft<T> | null {
  try {
    return parseCartDraft<T>(appStorage.getItem(CART_KEY), Date.now());
  } catch {
    return null;
  }
}

export function saveCartDraft<T>(cart: T[], checkoutKey: string) {
  try {
    if (cart.length) appStorage.setItem(CART_KEY, JSON.stringify({ cart, checkoutKey, savedAt: Date.now() }));
    else appStorage.removeItem(CART_KEY);
  } catch {
    // armazenamento indisponível (aba anônima): a sacola segue só em memória
  }
}

/** Sacola depois de atualizar o cardápio: preço atual, sem o que saiu do cardápio. */
export function reconcileCart<T extends { productId: string; product: unknown }, P extends { id: string }>(cart: T[], products: P[]): T[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  return cart.flatMap((item) => {
    const product = byId.get(item.productId);
    return product ? [{ ...item, product }] : [];
  });
}

/** Escolhas das etapas (entrega, pagamento, troco): valem só para esta aba. */
export function loadMenuForm<T>(): Partial<T> {
  try {
    return JSON.parse(sessionStorage.getItem(FORM_KEY) || '{}') as Partial<T>;
  } catch {
    return {};
  }
}

export function saveMenuForm<T>(form: T) {
  try {
    sessionStorage.setItem(FORM_KEY, JSON.stringify(form));
  } catch {
    // sem armazenamento: segue só em memória
  }
}
