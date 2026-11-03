declare global {
  interface Window { __menuPreload?: { menu: Promise<unknown>; categories: Promise<unknown> } }
}

/** Busca iniciada no index.html na abertura do cardápio. Vale uma vez: as próximas atualizações vão direto ao banco. */
export function takeMenuPreload() {
  if (typeof window === 'undefined') return undefined;
  const preload = window.__menuPreload;
  delete window.__menuPreload;
  return preload;
}
