import { create } from 'zustand';
import { MeatDoneness } from '../types/enums';
import { Product } from '../types/domain';
import { generateId } from '../lib/utils';

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
  clearCart: (tableId: string) => void;
  getCart: (tableId: string) => CartItem[];
  getCartTotal: (tableId: string) => number;
  getCartItemsCount: (tableId: string) => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  tableCarts: {},

  addItem: (tableId, product, quantity = 1, doneness = null, notes = null) => {
    const carts = { ...get().tableCarts };
    const currentList = carts[tableId] || [];

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

    set({ tableCarts: carts });
  },

  updateQuantity: (tableId, draftItemId, delta) => {
    const carts = { ...get().tableCarts };
    const currentList = carts[tableId] || [];

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
    set({ tableCarts: carts });
  },

  removeItem: (tableId, draftItemId) => {
    const carts = { ...get().tableCarts };
    const currentList = carts[tableId] || [];
    carts[tableId] = currentList.filter((item) => item.id !== draftItemId);
    set({ tableCarts: carts });
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
