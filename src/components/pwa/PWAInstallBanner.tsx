import { Download,Flame,Share2,X } from 'lucide-react';
import React,{ useEffect,useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const PWAInstallBanner: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Verifica se já está instalado (standalone)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    if (isStandalone) {
      return;
    }

    // Verifica se o usuário já dispensou nos últimos 3 dias
    const dismissedAt = localStorage.getItem('espetaria_pwa_dismissed');
    if (dismissedAt && Date.now() - parseInt(dismissedAt, 10) < 3 * 24 * 60 * 60 * 1000) {
      return;
    }

    // Detecta iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAppleDevice = /iphone|ipad|ipod/.test(userAgent);
    if (isAppleDevice) {
      setIsIOS(true);
      setIsVisible(true);
      return;
    }

    // Escuta evento nativo no Android/Chrome
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setIsVisible(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    localStorage.setItem('espetaria_pwa_dismissed', Date.now().toString());
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="bg-brand-50 border-b border-brand-200 px-3 py-2.5 sm:px-6 slide-in-from-top">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="bg-brand-700 w-8 h-8 rounded-xl text-white flex items-center justify-center shrink-0 shadow-sm">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-ink flex items-center gap-1.5">
              <span>Instale o App da Espetaria</span>
              <span className="text-xs bg-brand-100 text-brand-800 tabular-nums px-1.5 py-0.5 rounded border border-brand-300">PWA</span>
            </div>
            <p className="text-xs text-ink-muted">
              {isIOS ? (
                <span className="flex items-center gap-1">
                  Toque em <Share2 className="w-3 h-3 text-brand-700 inline" /> e depois em "Adicionar à Tela de Início"
                </span>
              ) : (
                'Acesso offline instantâneo, notificações sonoras e resposta em milissegundos.'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isIOS && deferredPrompt && (
            <button
              onClick={handleInstallClick}
              className="btn-primary px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 shadow-sm"
             type="button">
              <Download className="w-3.5 h-3.5" />
              <span>Instalar</span>
            </button>
          )}

          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-brand-100 transition"
            title="Fechar"
            aria-label="Fechar banner de instalação"
           type="button">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
