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
      existing.innerHTML = '<span>⚡</span><span>Nova versão pronta. Atualizando em instantes...</span>';
    }
    return;
  }

  const toast = document.createElement('div');
  toast.id = 'ponto-update-toast';
  toast.className = 'fixed top-3 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 bg-brand-700 text-white text-xs font-semibold rounded-full shadow-2xl flex items-center gap-2 animate-bounce border border-amber-300';
  toast.innerHTML = waiting
    ? '<span>⚡</span><span>Nova versão pronta. Atualizando em instantes...</span>'
    : '<span>⚡</span><span>Atualizando sistema para a versão mais recente...</span>';
  document.body.appendChild(toast);
}

export function initAutoUpdate() {
  if (typeof window === 'undefined') return;

  const currentBuildTime = typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : '';
  let registrationRef: ServiceWorkerRegistration | undefined;

  const RELOAD_COOLDOWN_MS = 15000;

  const doReload = () => {
    try {
      sessionStorage.setItem('ponto_last_pwa_reload', String(Date.now()));
    } catch {}
    window.location.reload();
  };

  const triggerReload = () => {
    if (isReloading) return;

    // Proteção contra loop de recargas sucessivas (cooldown de 15s)
    try {
      const lastReload = Number(sessionStorage.getItem('ponto_last_pwa_reload') || '0');
      if (Date.now() - lastReload < RELOAD_COOLDOWN_MS) {
        return;
      }
    } catch {}

    isReloading = true;

    // Se o usuário estiver no meio de uma digitação ou com modal aberto, aguarda concluir
    if (isUserInteracting()) {
      showUpdateToast(true);
      let attempts = 0;
      const interval = window.setInterval(() => {
        attempts += 1;
        // Se fechou o modal/blur ou atingiu o limite de 8s de tolerância, recarrega
        if (!isUserInteracting() || attempts >= 8) {
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

  // Quando o novo Service Worker assume o controle dos clientes (clientsClaim)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      triggerReload();
    });
  }

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
            if (registrationRef) {
              await registrationRef.update();
            }
            triggerReload();
          }
        }
      } catch {}
    }
  };

  // Checa a cada 15 segundos em segundo plano
  setInterval(checkForUpdates, 15000);

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
