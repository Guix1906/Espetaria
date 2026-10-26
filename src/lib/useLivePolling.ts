import { useEffect, useRef } from 'react';

/**
 * Repete `fn` a cada `ms` enquanto a tela está visível e roda na hora quando o cliente
 * volta para a aba/app ou a internet volta (o celular pausa timers em segundo plano).
 */
export function useLivePolling(fn: () => void | Promise<unknown>, ms: number, enabled = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    const run = () => { if (document.visibilityState !== 'hidden') void fnRef.current(); };
    const timer = window.setInterval(run, ms);
    const onVisible = () => { if (document.visibilityState === 'visible') run(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', run);
    window.addEventListener('online', run);
    window.addEventListener('pageshow', run);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', run);
      window.removeEventListener('online', run);
      window.removeEventListener('pageshow', run);
    };
  }, [ms, enabled]);
}
