import { create } from 'zustand';
import { supabase, isSupabaseConfigured } from './supabase';
import { logger } from './logger';

interface RemoteErrorState {
  lastError: string | null;
  clear: () => void;
}

/** Último erro de persistência remota, exibido como aviso na interface. */
export const useRemoteErrorStore = create<RemoteErrorState>((set) => ({
  lastError: null,
  clear: () => set({ lastError: null }),
}));

/**
 * Executa uma RPC no Supabase após uma atualização otimista local.
 * Se o servidor recusar, registra o erro, avisa a interface e re-hidrata
 * o estado a partir do banco (desfazendo a alteração otimista).
 * Sem Supabase configurado, não faz nada (modo demonstração local).
 */
export async function callRpc<T = unknown>(
  fn: string,
  args: Record<string, unknown>,
  context: string
): Promise<T | null> {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    logger.error({ context, message: `Falha na operação remota ${fn}`, error });
    useRemoteErrorStore.setState({ lastError: error.message || `Falha ao sincronizar (${fn}).` });
    const { syncService } = await import('./syncService');
    await syncService.hydrateAll();
    return null;
  }
  return data as T;
}
