import { Download, Share2, Smartphone, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && navigator.standalone === true);
    if (standalone) return;
    const dismissedAt = localStorage.getItem('espetaria_pwa_dismissed');
    if (dismissedAt && Date.now() - Number(dismissedAt) < 3 * 24 * 60 * 60 * 1000) return;
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) { setIsIOS(true); setIsVisible(true); return; }
    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setIsVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handlePrompt);
    return () => window.removeEventListener('beforeinstallprompt', handlePrompt);
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    setErrorMessage(null);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') setIsVisible(false);
      setDeferredPrompt(null);
    } catch {
      setErrorMessage('Não foi possível instalar agora. Tente novamente pelo menu do navegador.');
    }
  };
  const dismiss = () => { localStorage.setItem('espetaria_pwa_dismissed', String(Date.now())); setIsVisible(false); };
  if (!isVisible) return null;

  return (
    <div className="border-b border-brand-200 bg-brand-50 px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-[1536px] flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3"><Smartphone className="mt-1 hidden h-5 w-5 shrink-0 text-brand-700 sm:block" aria-hidden="true" /><div><p className="text-sm font-semibold text-brand-900">A espetaria na sua tela inicial</p><p className="mt-1 text-xs leading-relaxed text-ink-secondary">{isIOS ? <span>Toque em <Share2 className="inline h-3.5 w-3.5" aria-label="Compartilhar" /> e escolha "Adicionar à Tela de Início".</span> : 'Instale o aplicativo para acessar o sistema mais rapidamente.'}</p>{errorMessage && <p role="alert" className="mt-2 text-sm text-rose-800">{errorMessage}</p>}</div></div>
        <div className="flex shrink-0 items-center gap-2">{!isIOS && deferredPrompt && <button type="button" onClick={install} className="btn-primary"><Download className="h-4 w-4" aria-hidden="true" />Instalar</button>}<button type="button" onClick={dismiss} className="icon-button border-brand-200 bg-brand-50" aria-label="Dispensar instalação"><X className="h-4 w-4" /></button></div>
      </div>
    </div>
  );
}
