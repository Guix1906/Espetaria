import { create } from 'zustand';
import { RestaurantSettings } from '../types/domain';
import { PixKeyType } from '../types/enums';
import { logger } from '../lib/logger';
import { appStorage } from '../lib/storage';

const STORAGE_KEY = 'espetaria_restaurant_settings_v1';

export const DEFAULT_SETTINGS: RestaurantSettings = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Espetaria Sabor da Carne',
  cnpj: '12.345.678/0001-90',
  phone: '(11) 98765-4321',
  address: 'Rua dos Espetos, 100 — Centro — São Paulo/SP',
  service_fee_percent: 10.0,
  allow_custom_service_fee: true,
  timezone: 'America/Sao_Paulo',
  pix_key: 'contato@espetariasabor.com.br',
  pix_key_type: 'EMAIL',
  pix_merchant_name: 'ESPETARIA SABOR DA CARNE',
  pix_merchant_city: 'SAO PAULO',
  auto_print_orders: true,
  print_paper_width: '80mm',
  printer_grill_enabled: true,
  printer_kitchen_enabled: true,
  printer_cashier_enabled: true,
  updated_at: new Date().toISOString(),
};

interface SettingsState {
  settings: RestaurantSettings;
  updateSettings: (partial: Partial<RestaurantSettings>) => void;
  updatePixConfig: (config: {
    pix_key: string;
    pix_key_type: PixKeyType;
    pix_merchant_name: string;
    pix_merchant_city: string;
  }) => void;
  updatePrinterConfig: (config: {
    auto_print_orders?: boolean;
    print_paper_width?: '80mm' | '58mm';
    printer_grill_enabled?: boolean;
    printer_kitchen_enabled?: boolean;
    printer_cashier_enabled?: boolean;
  }) => void;
  resetToDefaults: () => void;
}

const loadInitialSettings = (): RestaurantSettings => {
  try {
    const raw = appStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (error) {
    logger.error({
      context: 'SettingsStore',
      message: 'Falha ao recuperar configurações do storage',
      data: { error }
    });
  }
  return DEFAULT_SETTINGS;
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: loadInitialSettings(),

  updateSettings: (partial) => {
    const updated: RestaurantSettings = {
      ...get().settings,
      ...partial,
      updated_at: new Date().toISOString(),
    };
    try {
      appStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      logger.error({ context: 'SettingsStore', message: 'Erro ao persistir settings', data: { err } });
    }
    logger.info({
      context: 'SettingsStore',
      message: 'Configurações atualizadas com sucesso',
    });
    set({ settings: updated });
  },

  updatePixConfig: ({ pix_key, pix_key_type, pix_merchant_name, pix_merchant_city }) => {
    get().updateSettings({
      pix_key: pix_key.trim(),
      pix_key_type,
      pix_merchant_name: pix_merchant_name.trim().toUpperCase(),
      pix_merchant_city: pix_merchant_city.trim().toUpperCase(),
    });
  },

  updatePrinterConfig: (config) => {
    get().updateSettings(config);
  },

  resetToDefaults: () => {
    try {
      appStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    set({ settings: DEFAULT_SETTINGS });
  }
}));

