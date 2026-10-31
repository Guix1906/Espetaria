import { registerSW } from 'virtual:pwa-register';

let isReloading = false;

function showUpdateToast() {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('ponto-update-toast');
  if (existing) return;

  const toast = document.createElement('div');
  toast.id = 'ponto-update-toast';
  toast.className = 'fixed top-3 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 bg-brand-700 text-white text-xs font-semibold rounded-full shadow-2xl flex items-center gap-2 animate-bounce border border-amber-300';
  toast.innerHTML = '<span>⚡</span><span>Atualizando sistema para a versão mais recente...</span>';
  document.body.appendChild(toast);
}

export function initAutoUpdate() {
  if (typeof window === 'undefined') return;

  const currentBuildTime = typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : '';
  let registrationRef: ServiceWorkerRegistration | undefined;

  const triggerReload = () => {
    if (isReloading) return;
    isReloading = true;
    showUpdateToast();

    // Aguarda 400ms para exibir o aviso suavemente e não cortar clique em andamento
    setTimeout(() => {
      window.location.reload();
    }, 400);
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
