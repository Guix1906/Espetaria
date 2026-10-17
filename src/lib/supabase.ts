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

export const supabase = createClient(
  supabaseUrl || 'https://mock-supabase.local',
  supabaseAnonKey || 'mock-anon-key-placeholder',
  {
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
