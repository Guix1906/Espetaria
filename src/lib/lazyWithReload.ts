import { lazy, type ComponentType } from 'react';

const FLAG = 'ponto_chunk_reload_at';

/** Erro típico de quando o app aberto é de uma versão anterior e o arquivo já não existe na Vercel. */
export function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk|error loading dynamically/i.test(msg);
}

/** Recarrega a página uma vez (no máximo a cada 30 s) para pegar a versão nova. */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(FLAG) || 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(FLAG, String(Date.now()));
  } catch { /* sem sessionStorage: recarrega mesmo assim */ }
  window.location.reload();
  return true;
}

/** lazy() que, se o arquivo sumiu depois de uma publicação, recarrega o app em vez de quebrar a tela. */
export function lazyWithReload<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() => load().catch((error: unknown) => {
    if (isChunkLoadError(error) && reloadForNewVersion()) return new Promise<{ default: T }>(() => {});
    throw error;
  }));
}
