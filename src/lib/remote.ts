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
 * Inclui retry automático para falhas transitórias de conexão (Wi-Fi oscilando no salão).
 * Se o servidor recusar por regra de negócio (estoque, validação), registra o erro,
 * avisa a interface e re-hidrata o estado a partir do banco (desfazendo a alteração).
 * Sem Supabase configurado, não faz nada (modo demonstração local).
 */
export async function callRpc<T = unknown>(
  fn: string,
  args: Record<string, unknown>,
  context: string,
  retries = 2
): Promise<T | null> {
  if (!isSupabaseConfigured) return null;

  let attempt = 0;
  while (true) {
    try {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) {
        // Erros de rede/transporte transitórios: retenta suavemente antes de abortar
        const isTransientNetworkError =
          /fetch|network|timeout|connection|failed to fetch/i.test(error.message || '') ||
          error.code === 'PGRST000' ||
          error.code === '503';

        if (isTransientNetworkError && attempt < retries) {
          attempt++;
          logger.warn({ context, message: `Instabilidade de rede ao chamar ${fn}. Retentativa ${attempt}/${retries}...` });
          await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
          continue;
        }

        logger.error({ context, message: `Falha na operação remota ${fn}`, error });
        useRemoteErrorStore.setState({ lastError: error.message || `Falha ao sincronizar (${fn}).` });
        const { syncService } = await import('./syncService');
        await syncService.hydrateAll();
        return null;
      }
      return data as T;
    } catch (err: unknown) {
      if (attempt < retries) {
        attempt++;
        await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
        continue;
      }
      logger.error({ context, message: `Exceção na chamada remota ${fn}`, error: err });
      return null;
    }
  }
}
