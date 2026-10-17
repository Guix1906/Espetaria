import { create } from 'zustand';
import { RestaurantSettings } from '../types/domain';
import { PixKeyType } from '../types/enums';
import { logger } from '../lib/logger';
import { appStorage } from '../lib/storage';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useRemoteErrorStore } from '../lib/remote';

const STORAGE_KEY = 'espetaria_restaurant_settings_v1';

export const DEFAULT_SETTINGS: RestaurantSettings = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Espetaria Sabor da Carne',
  // Dados reais vêm do banco (Configurações → Dados da loja); nunca usar valores de exemplo
  cnpj: '',
  phone: '',
  address: '',
  service_fee_percent: 10.0,
  allow_custom_service_fee: true,
  timezone: 'America/Sao_Paulo',
  pix_key: '',
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
  /** Carrega as configurações compartilhadas do banco (todos os aparelhos e o cardápio público). */
  loadRemoteSettings: () => Promise<void>;
}

/** Colunas que existem na tabela restaurant_settings (o restante é preferência local do aparelho). */
const REMOTE_COLUMNS = [
  'name', 'cnpj', 'phone', 'address', 'service_fee_percent', 'allow_custom_service_fee', 'timezone',
  'pix_key', 'pix_key_type', 'pix_merchant_name', 'pix_merchant_city', 'auto_print_orders', 'print_paper_width',
  'whatsapp_auto_enabled', 'whatsapp_dispatch_url', 'whatsapp_dispatch_token', 'whatsapp_templates', 'print_templates',
  'whatsapp_bot', 'pix_auto_enabled', 'pix_auto_minutes',
] as const;

/** Colunas da migração 00033: gravadas à parte para não travar o resto se o SQL ainda não rodou. */
const ETA_COLUMNS = ['delivery_eta', 'pickup_eta'] as const;

let remoteSettingsId: string | null = null;

async function persistEta(partial: Partial<RestaurantSettings>) {
  const changes = Object.fromEntries(Object.entries(partial).filter(([key]) => (ETA_COLUMNS as readonly string[]).includes(key)));
  if (Object.keys(changes).length === 0) return;
  const { error } = await supabase.from('restaurant_settings').update(changes).eq('id', remoteSettingsId!);
  if (error) {
    logger.warn({ context: 'SettingsStore', message: 'Tempo de entrega não salvo', error });
    useRemoteErrorStore.setState({ lastError: 'Tempo de entrega/retirada salvo só neste aparelho: falta rodar a migração 00033 no Supabase.' });
  }
}

async function persistRemote(partial: Partial<RestaurantSettings>) {
  if (!isSupabaseConfigured || !remoteSettingsId) return;
  await persistEta(partial);
  const changes = Object.fromEntries(
    Object.entries(partial).filter(([key]) => (REMOTE_COLUMNS as readonly string[]).includes(key))
  );
  if (Object.keys(changes).length === 0) return;
  const { error } = await supabase
    .from('restaurant_settings')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', remoteSettingsId);
  if (error) {
    logger.error({ context: 'SettingsStore', message: 'Falha ao salvar configurações no banco', error });
    useRemoteErrorStore.setState({
      lastError: 'Configurações salvas só neste aparelho: somente o Master pode alterar as configurações do restaurante.',
    });
  }
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
    void persistRemote(partial);
  },

  loadRemoteSettings: async () => {
    if (!isSupabaseConfigured) return;
    // Cliente do cardápio digital (sem login) lê a visão pública, sem dados internos
    // (migração 00018). Equipe logada lê a tabela completa.
    const { data: session } = await supabase.auth.getSession();
    let { data, error } = session.session
      ? await supabase.from('restaurant_settings').select('*').limit(1).maybeSingle()
      : await supabase.from('restaurant_settings_public').select('*').limit(1).maybeSingle();
    if (!session.session && (error || !data)) {
      // Visão pública ainda não criada (00018 não aplicada): tenta a tabela
      ({ data, error } = await supabase.from('restaurant_settings').select('*').limit(1).maybeSingle());
    }
    if (error || !data) {
      logger.warn({ context: 'SettingsStore', message: 'Configurações remotas indisponíveis', error });
      return;
    }
    remoteSettingsId = data.id as string;
    const merged: RestaurantSettings = {
      ...get().settings,
      ...data,
      service_fee_percent: Number(data.service_fee_percent ?? get().settings.service_fee_percent),
    };
    try {
      appStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // armazenamento local indisponível: segue só em memória
    }
    set({ settings: merged });
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

