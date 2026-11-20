import { registerSW } from 'virtual:pwa-register';

let isReloading = false;

function isUserInteracting(): boolean {
  if (typeof document === 'undefined') return false;
  // Modal ou gaveta aberta (diálogo na tela)
  const hasModal = Boolean(document.querySelector('dialog[open], [role="dialog"], .dialog-panel'));
  // Usuário digitando em formulário ou observação de pedido
  const activeEl = document.activeElement;
  const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
  return Boolean(hasModal || isTyping);
}

function showUpdateToast(waiting = false) {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('ponto-update-toast');
  if (existing) {
    if (waiting) {
      existing.innerHTML = '<span>Nova versão pronta. Atualizando em instantes...</span>';
    }
    return;
  }

  const toast = document.createElement('div');
  toast.id = 'ponto-update-toast';
  toast.className = 'fixed top-3 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 bg-ink text-white text-sm font-medium rounded-md shadow-floating flex items-center gap-2';
  toast.innerHTML = waiting
    ? '<span>Nova versão pronta. Atualizando em instantes...</span>'
    : '<span>Atualizando o sistema para a versão mais recente...</span>';
  document.body.appendChild(toast);
}

/** Telas do cliente (cardápio, QR da mesa, acompanhamento): abrem pelo link, sem instalar o sistema no celular dele. */
export function isPublicRoute(pathname: string, hash: string): boolean {
  return pathname.replace(/\/+$/, '') === '/cardapio' || /^#\/(cardapio|mesa\/|pedido\/)/.test(hash);
}

/** Celular de cliente que instalou numa versão antiga: para de baixar o sistema inteiro a cada atualização. */
export function removeServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.getRegistrations().then((list) => list.forEach((registration) => void registration.unregister())).catch(() => {});
}

export function initAutoUpdate() {
  if (typeof window === 'undefined') return;

  const currentBuildTime = typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : '';
  let registrationRef: ServiceWorkerRegistration | undefined;

  const RELOAD_COOLDOWN_MS = 60000;
  const MAX_RELOADS_IN_A_ROW = 3;
  const RELOAD_COUNT_RESET_MS = 10 * 60000;

  const doReload = () => {
    try {
      // O limite só freia recarga em sequência: o programa da loja fica aberto por dias
      const previous = Number(sessionStorage.getItem('ponto_last_pwa_reload') || '0');
      const count = Date.now() - previous > RELOAD_COUNT_RESET_MS ? 0 : Number(sessionStorage.getItem('ponto_pwa_reload_count') || '0');
      sessionStorage.setItem('ponto_pwa_reload_count', String(count + 1));
      sessionStorage.setItem('ponto_last_pwa_reload', String(Date.now()));
    } catch {}
    window.location.reload();
  };

  /**
   * Plano B: a versão nova está no ar há mais de 90 s e a tela continua na antiga (o service worker
   * não conseguiu baixar a versão nova, por exemplo por queda de internet no meio). Apaga o que está
   * guardado e recarrega direto do site. No máximo 1 vez a cada 5 min, para nunca virar recarga sem fim.
   */
  const hardReload = async () => {
    try {
      const last = Number(sessionStorage.getItem('ponto_hard_reload_at') || '0');
      if (Date.now() - last < 5 * 60000) return false;
      sessionStorage.setItem('ponto_hard_reload_at', String(Date.now()));
    } catch {}
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      await Promise.all((regs || []).map((reg) => reg.unregister()));
    } catch {}
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    } catch {}
    return true;
  };

  const triggerReload = (hard = false) => {
    if (isReloading) return;
    if (hard) {
      isReloading = true;
      const go = () => void hardReload().then((ok) => { if (ok) window.location.reload(); else isReloading = false; });
      if (!isUserInteracting()) { showUpdateToast(false); go(); return; }
      showUpdateToast(true);
      let waited = 0;
      const wait = window.setInterval(() => {
        waited += 1;
        if (!isUserInteracting() || waited >= 180) { window.clearInterval(wait); go(); }
      }, 1000);
      return;
    }

    // Proteção contra tela "piscando": se o aparelho não pegar a versão nova, para de insistir
    try {
      const lastReload = Number(sessionStorage.getItem('ponto_last_pwa_reload') || '0');
      const count = Number(sessionStorage.getItem('ponto_pwa_reload_count') || '0');
      const elapsed = Date.now() - lastReload;
      if (elapsed < RELOAD_COOLDOWN_MS || (count >= MAX_RELOADS_IN_A_ROW && elapsed < RELOAD_COUNT_RESET_MS)) {
        return;
      }
    } catch {}

    isReloading = true;

    // No meio de uma digitação ou com janela aberta: espera terminar (limite de 3 min, nunca corta o garçom no meio)
    if (isUserInteracting()) {
      showUpdateToast(true);
      let attempts = 0;
      const interval = window.setInterval(() => {
        attempts += 1;
        if (!isUserInteracting() || attempts >= 180) {
          window.clearInterval(interval);
          doReload();
        }
      }, 1000);
      return;
    }

    showUpdateToast(false);
    setTimeout(doReload, 400);
  };

  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, r) {
      registrationRef = r;
      // Checagem inicial após 3s
      setTimeout(checkForUpdates, 3000);
    },
    onNeedRefresh() {
      void updateSW(true);
      triggerReload();
    },
  });

  // Quando o novo Service Worker assume o controle dos clientes (clientsClaim).
  // Na primeira instalação não há versão antiga para trocar: nada de recarregar a tela.
  if ('serviceWorker' in navigator) {
    let hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) { hadController = true; return; }
      triggerReload();
    });
  }

  /** Guarda quando esta tela viu a versão nova pela primeira vez; true se já passou de 90 s sem entrar. */
  const stuckOnOldVersion = (target: string) => {
    try {
      const raw = sessionStorage.getItem('ponto_update_target');
      const seen = raw ? (JSON.parse(raw) as { build: string; at: number }) : null;
      if (!seen || seen.build !== target) {
        sessionStorage.setItem('ponto_update_target', JSON.stringify({ build: target, at: Date.now() }));
        return false;
      }
      return Date.now() - seen.at > 90000;
    } catch {
      return false;
    }
  };

  const checkForUpdates = async () => {
    if (!navigator.onLine || isReloading) return;

    // 1. Notifica o Service Worker para buscar sw.js novo
    if (registrationRef) {
      try {
        await registrationRef.update();
      } catch {}
    }

    // 2. Checagem direta do arquivo /version.json gerado no build (bypassa cache com cache: 'no-store')
    if (currentBuildTime) {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
        });
        if (res.ok) {
          const data = (await res.json()) as { buildTime?: string };
          if (data?.buildTime && data.buildTime !== currentBuildTime) {
            // Nova versão no ar na Cloudflare!
            if (stuckOnOldVersion(data.buildTime)) {
              triggerReload(true);
              return;
            }
            if (registrationRef) {
              await registrationRef.update();
            }
            triggerReload();
          }
        }
      } catch {}
    }
  };

  // Checa a cada minuto em segundo plano
  setInterval(checkForUpdates, 60000);

  // Checa imediatamente ao desbloquear o celular / voltar para a aba
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void checkForUpdates();
    }
  });

  // Checa ao focar a janela ou reconectar à internet
  window.addEventListener('focus', () => void checkForUpdates());
  window.addEventListener('online', () => void checkForUpdates());
}
