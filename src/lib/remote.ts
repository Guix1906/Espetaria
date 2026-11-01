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

interface RpcError { message?: string; code?: string }

const NETWORK_ERROR = /fetch|network|timeout|connection|abort|load failed/i;
/** O banco desfez a transação (deadlock entre garçons, tempo esgotado, banco ocupado): repetir é seguro. */
const RETRY_CODES = new Set(['40P01', '57014', '55P03', 'PGRST000', 'PGRST001', 'PGRST002', 'PGRST003', '502', '503', '504', '520']);
/** Conflito de versão: o item mudou em outro aparelho. Só atualiza a tela, sem assustar com aviso vermelho. */
const VERSION_CONFLICT = '40001';

const isTransient = (error: RpcError) => RETRY_CODES.has(error.code ?? '') || NETWORK_ERROR.test(error.message ?? '');

/** A 1ª tentativa chegou no banco e só a resposta se perdeu: a repetição esbarra no próprio registro. */
const alreadyApplied = (error: RpcError) => error.code === '23505' || /já foi encerrada/i.test(error.message ?? '');

/** Texto para quem está atendendo, no lugar da mensagem técnica. */
export function friendlyRpcError(fn: string, error: RpcError): string {
  if (isTransient(error)) return 'Sem conexão com o servidor. Confira a internet do aparelho e tente de novo.';
  if (error.code === 'PGRST202' || /could not find the function/i.test(error.message ?? '')) return 'Esta função ainda não foi ativada no banco de dados. Avise o responsável pelo sistema.';
  return error.message || `Falha ao sincronizar (${fn}).`;
}

/**
 * Executa uma RPC no Supabase após uma atualização otimista local.
 * Inclui retry automático para falhas transitórias (Wi-Fi oscilando no salão, dois garçons baixando o mesmo estoque).
 * Se o servidor recusar por regra de negócio (estoque, validação), registra o erro,
 * avisa a interface e re-hidrata o estado a partir do banco (desfazendo a alteração).
 * Retorna null se a operação não foi confirmada.
 * Sem Supabase configurado, não faz nada (modo demonstração local).
 */
export async function callRpc<T = unknown>(
  fn: string,
  args: Record<string, unknown>,
  context: string,
  retries = 3
): Promise<T | null> {
  if (!isSupabaseConfigured) return null;

  for (let attempt = 0; ; attempt++) {
    let error: RpcError;
    try {
      const result = await supabase.rpc(fn, args);
      if (!result.error) return result.data as T;
      error = result.error;
    } catch (err: unknown) {
      error = { message: err instanceof Error ? err.message : String(err), code: 'network' };
      if (!NETWORK_ERROR.test(error.message ?? '')) error.message = `network: ${error.message}`;
    }

    if (attempt < retries && isTransient(error)) {
      logger.warn({ context, message: `Instabilidade ao chamar ${fn}. Retentativa ${attempt + 1}/${retries}...` });
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      continue;
    }
    if (attempt > 0 && alreadyApplied(error)) return { duplicate: true } as T;

    logger.error({ context, message: `Falha na operação remota ${fn}`, error });
    if (error.code !== VERSION_CONFLICT) useRemoteErrorStore.setState({ lastError: friendlyRpcError(fn, error) });
    const { syncService } = await import('./syncService');
    await syncService.hydrateAll();
    return null;
  }
}
