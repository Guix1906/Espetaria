import { createClient } from '@supabase/supabase-js';
import { logger } from './logger';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  !supabaseUrl.includes('xyzcompany') && 
  supabaseAnonKey.length > 20
);

if (!isSupabaseConfigured) {
  logger.warn({
    context: 'SupabaseInit',
    message: 'Supabase não configurado com credenciais reais. O sistema funcionará com armazenamento de dados atômico local para testes e desenvolvimento inicial até que o .env seja preenchido.'
  });
}

/** Wi-Fi ruim não pode deixar uma consulta pendurada para sempre: desiste e deixa o callRpc repetir. */
const REST_TIMEOUT_MS = 15000;
const fetchWithTimeout: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes('/rest/v1/') || init?.signal) return fetch(input, init);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REST_TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
};

export const supabase = createClient(
  supabaseUrl || 'https://mock-supabase.local',
  supabaseAnonKey || 'mock-anon-key-placeholder',
  {
    global: { fetch: fetchWithTimeout },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      }
    }
  }
);
