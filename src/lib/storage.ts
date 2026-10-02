const memoryStorage = new Map<string, string>();

export const appStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(key);
      }
    } catch {
      // fallback
    }
    return memoryStorage.get(key) ?? null;
  },

  setItem: (key: string, value: string): void => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
      }
    } catch {
      // fallback
    }
    memoryStorage.set(key, value);
  },

  removeItem: (key: string): void => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch {
      // fallback
    }
    memoryStorage.delete(key);
  },

  clear: (): void => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.clear();
      }
    } catch {
      // fallback
    }
    memoryStorage.clear();
  },
};

export const STORAGE_KEY_TABS = 'espetaria_tabs_v1';
export const STORAGE_KEY_ORDERS = 'espetaria_orders_v1';
export const STORAGE_KEY_ORDER_ITEMS = 'espetaria_order_items_v1';
export const STORAGE_KEY_PAYMENTS = 'espetaria_payments_v1';

export const loadPersistedTabs = <T>(): T[] => {
  try {
    const raw = appStorage.getItem(STORAGE_KEY_TABS);
    if (raw) return JSON.parse(raw) as T[];
  } catch {
    // ignore
  }
  return [];
};

export const savePersistedTabs = <T>(data: T[]): void => {
  try {
    appStorage.setItem(STORAGE_KEY_TABS, JSON.stringify(data));
  } catch {
    // ignore
  }
};

export const loadPersistedOrders = <T>(): T[] => {
  try {
    const raw = appStorage.getItem(STORAGE_KEY_ORDERS);
    if (raw) return JSON.parse(raw) as T[];
  } catch {
    // ignore
  }
  return [];
};

export const savePersistedOrders = <T>(data: T[]): void => {
  try {
    appStorage.setItem(STORAGE_KEY_ORDERS, JSON.stringify(data));
  } catch {
    // ignore
  }
};

export const loadPersistedOrderItems = <T>(): T[] => {
  try {
    const raw = appStorage.getItem(STORAGE_KEY_ORDER_ITEMS);
    if (raw) return JSON.parse(raw) as T[];
  } catch {
    // ignore
  }
  return [];
};

export const savePersistedOrderItems = <T>(data: T[]): void => {
  try {
    appStorage.setItem(STORAGE_KEY_ORDER_ITEMS, JSON.stringify(data));
  } catch {
    // ignore
  }
};

export const loadPersistedPayments = <T>(): T[] => {
  try {
    const raw = appStorage.getItem(STORAGE_KEY_PAYMENTS);
    if (raw) return JSON.parse(raw) as T[];
  } catch {
    // ignore
  }
  return [];
};

export const savePersistedPayments = <T>(data: T[]): void => {
  try {
    appStorage.setItem(STORAGE_KEY_PAYMENTS, JSON.stringify(data));
  } catch {
    // ignore
  }
};
