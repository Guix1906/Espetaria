import { Suspense, useEffect, useState } from 'react';
import { useRealtimeSync } from './hooks/useRealtimeSync';
import { AuthShell } from './features/auth/AuthShell';
import { lazyNamed } from './lib/lazyWithReload';
import { RemoteErrorBanner } from './components/ui/RemoteErrorBanner';
import { ConfirmDialogProvider } from './components/ui/ConfirmDialog';
import { MenuSplash } from './features/delivery/MenuSplash';
import { useAuthStore } from './stores/useAuthStore';

// Cada tela é baixada só quando abre: o sistema inicia bem mais rápido
const AdminWorkspace = lazyNamed(() => import('./AdminWorkspace'), 'AdminWorkspace');
const LoginScreen = lazyNamed(() => import('./features/auth/LoginScreen'), 'LoginScreen');
const WaiterPortal = lazyNamed(() => import('./features/waiter/WaiterPortal'), 'WaiterPortal');
const PublicMenuPage = lazyNamed(() => import('./features/delivery/PublicMenuPage'), 'PublicMenuPage');
const PublicOrderTrackingPage = lazyNamed(() => import('./features/delivery/PublicOrderTrackingPage'), 'PublicOrderTrackingPage');
const TableOrderPage = lazyNamed(() => import('./features/delivery/TableOrderPage'), 'TableOrderPage');

const screenLoading = <p className="py-16 text-center text-sm text-ink-muted" role="status">Carregando...</p>;

declare global {
  interface Window { pontoDesktop?: { showWhatsApp: (visible: boolean) => void } }
}

export function App() {
  useRealtimeSync();
  const [hash, setHash] = useState(() => window.location.hash);
  const { currentProfile, isAuthenticated, isInitializing, initialize } = useAuthStore();
  useEffect(() => {
    void initialize();
  }, [initialize]);
  useEffect(() => {
    const change = () => setHash(window.location.hash);
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);

  // Cardápio digital público: não depende de login nem da sessão da equipe
  // Endereço oficial: /cardapio (o antigo #/cardapio continua funcionando)
  const onMenuPath = window.location.pathname.replace(/\/+$/, '') === '/cardapio';
  if (hash.startsWith('#/cardapio') || (onMenuPath && !hash.startsWith('#/pedido/'))) return <Suspense fallback={<MenuSplash />}><PublicMenuPage /></Suspense>;
  // Pedido do cliente pelo QR Code da mesa
  if (hash.startsWith('#/mesa/')) return <Suspense fallback={screenLoading}><TableOrderPage token={hash.slice('#/mesa/'.length).split(/[?/]/)[0] ?? ''} /></Suspense>;
  // Acompanhamento do pedido: link enviado na mensagem de WhatsApp
  if (hash.startsWith('#/pedido/')) return <Suspense fallback={screenLoading}><PublicOrderTrackingPage orderId={hash.slice('#/pedido/'.length).split(/[?/]/)[0] ?? ''} /></Suspense>;

  if (isInitializing) {
    // Mesma moldura do login: a tela não "pisca" trocando de layout enquanto a sessão carrega
    return <AuthShell><p className="py-10 text-center text-sm text-ink-muted" role="status">Verificando sessão...</p></AuthShell>;
  }

  let screen;
  if (hash === '#/garcom' || (isAuthenticated && currentProfile.role === 'GARCOM')) screen = <WaiterPortal />;
  else if (!isAuthenticated) screen = <LoginScreen />;
  else screen = <AdminWorkspace />;

  return (
    <ConfirmDialogProvider>
      <Suspense fallback={screenLoading}>{screen}</Suspense>
      <RemoteErrorBanner />
    </ConfirmDialogProvider>
  );
}

export default App;
