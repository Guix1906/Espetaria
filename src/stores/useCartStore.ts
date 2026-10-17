import { create } from 'zustand';
import { MeatDoneness } from '../types/enums';
import { Product } from '../types/domain';
import { generateId } from '../lib/utils';
import { limitingName, remainingFor } from '../lib/comboStock';
import { useStockStore } from './useStockStore';

/**
 * Não deixa o garçom anotar mais do que existe preparado no turno
 * (soma o que já está no rascunho da mesa). Produto sem controle de estoque passa livre.
 */
function assertStock(product: Product, cart: CartItem[], adding: number) {
  const { dailyPrepStock, products } = useStockStore.getState();
  const stock = dailyPrepStock.find((s) => s.product_id === product.id);
  if (stock && (stock.is_exhausted || stock.current_quantity <= 0)) throw new Error(`${product.name} esgotou.`);
  // Espeto com acompanhamento também conta o espeto base e o arroz
  const left = remainingFor(product, products, dailyPrepStock, cart);
  if (left === null || adding <= left) return;
  const limit = limitingName(product, products, dailyPrepStock, cart);
  const what = limit === product.name ? product.name : `${limit} (para ${product.name})`;
  throw new Error(left === 0
    ? (limit === product.name && stock ? `Já estão no pedido todas as ${stock.current_quantity} unidades de ${product.name} disponíveis.` : `Já está no pedido tudo o que resta de ${what}.`)
    : `Só ${left === 1 ? 'resta 1 unidade' : `restam ${left} unidades`} de ${what}.`);
}

export interface CartItem {
  id: string; // unique draft item id
  product: Product;
  quantity: number;
  doneness: MeatDoneness | null;
  notes: string | null;
}

interface CartState {
  // Carrinho indexado por tableId: { [tableId]: CartItem[] }
  // Permite ao garçom trocar de mesa sem perder os espetos que já anotou!
  tableCarts: Record<string, CartItem[]>;

  addItem: (
    tableId: string,
    product: Product,
    quantity?: number,
    doneness?: MeatDoneness | null,
    notes?: string | null
  ) => void;
  updateQuantity: (tableId: string, draftItemId: string, delta: number) => void;
  removeItem: (tableId: string, draftItemId: string) => void;
  /** Troca ponto, observação e quantidade de um item do rascunho (revisão do pedido). */
  updateItem: (tableId: string, draftItemId: string, changes: { quantity: number; doneness: MeatDoneness | null; notes: string | null }) => void;
  clearCart: (tableId: string) => void;
  getCart: (tableId: string) => CartItem[];
  getCartTotal: (tableId: string) => number;
  getCartItemsCount: (tableId: string) => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  tableCarts: {},

  addItem: (tableId, product, quantity = 1, doneness = null, notes = null) => {
    set((state) => {
      const carts = { ...state.tableCarts };
      const currentList = carts[tableId] || [];
      assertStock(product, currentList, quantity);

      // Se já existe o mesmo item com mesmo ponto e mesma observação, apenas incrementa
      const existingIndex = currentList.findIndex(
        (item) =>
          item.product.id === product.id &&
          item.doneness === doneness &&
          item.notes === (notes || null)
      );

      if (existingIndex > -1) {
        const updated = [...currentList];
        const existing = updated[existingIndex]!;
        updated[existingIndex] = {
          ...existing,
          quantity: existing.quantity + quantity,
        };
        carts[tableId] = updated;
      } else {
        carts[tableId] = [
          ...currentList,
          {
            id: generateId(),
            product,
            quantity,
            doneness: doneness || null,
            notes: notes || null,
          },
        ];
      }

      return { tableCarts: carts };
    });
  },

  updateQuantity: (tableId, draftItemId, delta) => {
    set((state) => {
      const carts = { ...state.tableCarts };
      const currentList = carts[tableId] || [];
      const target = currentList.find((item) => item.id === draftItemId);
      if (target && delta > 0) assertStock(target.product, currentList, delta);

      const updated = currentList
        .map((item) => {
          if (item.id === draftItemId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null);

      carts[tableId] = updated;
      return { tableCarts: carts };
    });
  },

  removeItem: (tableId, draftItemId) => {
    const carts = { ...get().tableCarts };
    const currentList = carts[tableId] || [];
    carts[tableId] = currentList.filter((item) => item.id !== draftItemId);
    set({ tableCarts: carts });
  },

  updateItem: (tableId, draftItemId, { quantity, doneness, notes }) => {
    set((state) => {
      const carts = { ...state.tableCarts };
      const currentList = carts[tableId] || [];
      const target = currentList.find((item) => item.id === draftItemId);
      if (!target) return state;
      const others = currentList.filter((item) => item.id !== draftItemId);
      // Estoque conferido sem contar a quantidade antiga deste item; se falhar, nada muda
      assertStock(target.product, others, quantity);
      const normalizedNotes = notes?.trim() || null;
      // Se ficou igual a outro item do rascunho (mesmo ponto e observação), junta os dois
      const twin = others.find((item) => item.product.id === target.product.id && item.doneness === doneness && item.notes === normalizedNotes);
      carts[tableId] = twin
        ? others.map((item) => (item.id === twin.id ? { ...item, quantity: item.quantity + quantity } : item))
        : currentList.map((item) => (item.id === draftItemId ? { ...item, quantity, doneness, notes: normalizedNotes } : item));
      return { tableCarts: carts };
    });
  },

  clearCart: (tableId) => {
    const carts = { ...get().tableCarts };
    delete carts[tableId];
    set({ tableCarts: carts });
  },

  getCart: (tableId) => {
    return get().tableCarts[tableId] || [];
  },

  getCartTotal: (tableId) => {
    const items = get().tableCarts[tableId] || [];
    return items.reduce((acc, item) => acc + item.product.price * item.quantity, 0);
  },

  getCartItemsCount: (tableId) => {
    const items = get().tableCarts[tableId] || [];
    return items.reduce((acc, item) => acc + item.quantity, 0);
  },
}));
