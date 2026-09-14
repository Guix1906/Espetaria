import React, { useState, useEffect } from 'react';
import { Download, X, Share2, Flame } from 'lucide-react';

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
    <div className="bg-gradient-to-r from-obsidian-950 via-carbon-900 to-obsidian-950 border-b border-ember-500/30 px-3 py-2.5 sm:px-6 animate-in slide-in-from-top">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-ember-500 to-orange-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-ember-950/60">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>Instale o App da Espetaria</span>
              <span className="text-[10px] bg-ember-500/20 text-ember-400 font-mono px-1.5 py-0.5 rounded border border-ember-500/30">PWA</span>
            </div>
            <p className="text-[11px] text-obsidian-300">
              {isIOS ? (
                <span className="flex items-center gap-1">
                  Toque em <Share2 className="w-3 h-3 text-ember-400 inline" /> e depois em "Adicionar à Tela de Início"
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
              className="btn-ember px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 shadow-md shadow-ember-950/60"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Instalar</span>
            </button>
          )}

          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg text-obsidian-400 hover:text-white hover:bg-carbon-800 transition"
            title="Fechar"
            aria-label="Fechar banner de instalação"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
