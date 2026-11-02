import { useEffect, useRef, useState } from 'react';
import { Header } from './components/layout/Header';
import { isPendingProduction } from './lib/productionStatus';
import { NavigationTabs } from './components/layout/NavigationTabs';
import { PAGE_TITLES, tabsForRole, type ActiveTab } from './components/layout/navigation';
import { PWAInstallBanner } from './components/pwa/PWAInstallBanner';
import { MasterDashboardView } from './features/admin/MasterDashboardView';
import { FinanceView } from './features/finance/FinanceView';
import { ReportsView } from './features/reports/ReportsView';
import { AuditLogView } from './features/audit/AuditLogView';
import { CashierModule } from './features/cashier/CashierModule';
import { DigitalMenuQrView } from './features/delivery/DigitalMenuQrView';
import { DeliveryManagementView } from './features/delivery/DeliveryManagementView';
import { KDSModule } from './features/kds/KDSModule';
import { ProductCatalogManageView } from './features/products/ProductCatalogManageView';
import { SettingsView } from './features/settings/SettingsView';
import { TeamManagementView } from './features/team/TeamManagementView';
import { ShiftOpenModal } from './features/shifts/ShiftOpenModal';
import { DailyStockView } from './features/stock/DailyStockView';
import { WaiterModule } from './features/waiter/WaiterModule';
import { WaiterPortal } from './features/waiter/WaiterPortal';
import { TopTabs } from './components/layout/TopTabs';
import { WhatsAppView } from './features/whatsapp/WhatsAppView';
import { useRealtimeSync } from './hooks/useRealtimeSync';
import { LoginScreen } from './features/auth/LoginScreen';
import { AuthShell } from './features/auth/AuthShell';
import { PublicMenuPage } from './features/delivery/PublicMenuPage';
import { PublicOrderTrackingPage } from './features/delivery/PublicOrderTrackingPage';
import { TableOrderPage } from './features/delivery/TableOrderPage';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { RemoteErrorBanner } from './components/ui/RemoteErrorBanner';
import { ConfirmDialogProvider } from './components/ui/ConfirmDialog';
import { useAuthStore } from './stores/useAuthStore';
import { useDeliveryStore } from './stores/useDeliveryStore';
import { useStockStore } from './stores/useStockStore';
import { useTableStore } from './stores/useTableStore';

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
  if (hash.startsWith('#/cardapio') || (onMenuPath && !hash.startsWith('#/pedido/'))) return <PublicMenuPage />;
  // Pedido do cliente pelo QR Code da mesa
  if (hash.startsWith('#/mesa/')) return <TableOrderPage token={hash.slice('#/mesa/'.length).split(/[?/]/)[0] ?? ''} />;
  // Acompanhamento do pedido: link enviado na mensagem de WhatsApp
  if (hash.startsWith('#/pedido/')) return <PublicOrderTrackingPage orderId={hash.slice('#/pedido/'.length).split(/[?/]/)[0] ?? ''} />;

  if (isInitializing) {
    // Mesma moldura do login: a tela não "pisca" trocando de layout enquanto a sessão carrega
    return <AuthShell><p className="py-10 text-center text-sm text-[#6B5D53]" role="status">Verificando sessão...</p></AuthShell>;
  }

  let screen;
  if (hash === '#/garcom' || (isAuthenticated && currentProfile.role === 'GARCOM')) screen = <WaiterPortal />;
  else if (!isAuthenticated) screen = <LoginScreen />;
  else screen = <AdminWorkspace />;

  return (
    <ConfirmDialogProvider>
      {screen}
      <RemoteErrorBanner />
    </ConfirmDialogProvider>
  );
}

const TAB_HASH_MAP: Record<ActiveTab, string> = {
  master: '#/painel/visao-geral',
  finance: '#/painel/financeiro',
  reports: '#/painel/relatorios',
  waiter: '#/painel/salao',
  tables: '#/painel/mesas',
  kds: '#/painel/producao',
  cashier: '#/painel/caixa',
  delivery: '#/painel/delivery',
  menu: '#/painel/cardapio-digital',
  whatsapp: '#/painel/whatsapp',
  products: '#/painel/produtos',
  stock: '#/painel/estoque',
  audit: '#/painel/auditoria',
  team: '#/painel/equipe',
  settings: '#/painel/configuracoes',
};

const HASH_TO_TAB: Record<string, ActiveTab> = Object.entries(TAB_HASH_MAP).reduce((acc, [tab, hash]) => {
  acc[hash] = tab as ActiveTab;
  return acc;
}, {} as Record<string, ActiveTab>);

function getInitialAdminTab(allowedTabs: ActiveTab[]): ActiveTab {
  if (typeof window !== 'undefined') {
    const currentHash = window.location.hash.toLowerCase();
    const tabFromHash = HASH_TO_TAB[currentHash];
    if (tabFromHash && allowedTabs.includes(tabFromHash)) return tabFromHash;

    try {
      const saved = localStorage.getItem('ponto_active_admin_tab') as ActiveTab;
      if (saved && allowedTabs.includes(saved)) return saved;
    } catch {}
  }
  return allowedTabs[0] ?? 'waiter';
}

function AdminWorkspace() {
  const currentProfile = useAuthStore((s) => s.currentProfile);
  const allowedTabs = tabsForRole(currentProfile.role);
  const [requestedTab, setRequestedTab] = useState<ActiveTab>(() => getInitialAdminTab(allowedTabs));
  // Nunca renderiza uma tela fora das permissões do papel atual
  // No programa do PC não existe a tela de Conversas: a aba WhatsApp é o WhatsApp Web
  const activeTab: ActiveTab = allowedTabs.includes(requestedTab) && !(window.pontoDesktop && requestedTab === 'whatsapp') ? requestedTab : (allowedTabs[0] ?? 'waiter');
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const previousTab = useRef(activeTab);

  // Programa do PC: o WhatsApp Web é desenhado pelo programa, por cima desta área
  const [desktopWebOpen, setDesktopWebOpen] = useState(false);
  useEffect(() => { window.pontoDesktop?.showWhatsApp(desktopWebOpen); }, [desktopWebOpen]);

  // Aba "Sistema" volta para a última tela aberta antes do WhatsApp
  const lastSystemTab = useRef<ActiveTab>(activeTab === 'whatsapp' ? (allowedTabs[0] ?? 'waiter') : activeTab);
  if (activeTab !== 'whatsapp') lastSystemTab.current = activeTab;

  const setActiveTab = (tab: ActiveTab) => {
    setRequestedTab(tab);
    try {
      localStorage.setItem('ponto_active_admin_tab', tab);
      const targetHash = TAB_HASH_MAP[tab];
      if (targetHash && window.location.hash !== targetHash) {
        window.history.replaceState(null, '', targetHash);
      }
    } catch {}
  };

  // Se o usuário clicar em Voltar/Avançar no navegador, sincroniza a tela
  useEffect(() => {
    const handleHash = () => {
      const h = window.location.hash.toLowerCase();
      const tab = HASH_TO_TAB[h];
      if (tab && allowedTabs.includes(tab) && tab !== activeTab) {
        setRequestedTab(tab);
      }
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [activeTab, allowedTabs]);

  // Se o papel do usuário mudar e a tela atual não for permitida, redireciona para a permitida
  useEffect(() => {
    if (!allowedTabs.includes(requestedTab)) {
      setActiveTab(allowedTabs[0] ?? 'waiter');
    }
  }, [allowedTabs, requestedTab]);

  useEffect(() => {
    document.title = `${PAGE_TITLES[activeTab]} | Ponto`;
    if (previousTab.current !== activeTab) {
      window.scrollTo({ top: 0 });
      mainRef.current?.focus({ preventScroll: true });
    }
    previousTab.current = activeTab;
  }, [activeTab]);

  // Só os números do menu: a moldura (e a tela aberta) não redesenha a cada mudança do banco
  const openTablesCount = useTableStore((s) => s.tables.filter((table) => table.status === 'OCUPADA' || table.status === 'AGUARDANDO_CONTA').length);
  const waitingBillCount = useTableStore((s) => s.tables.filter((table) => table.status === 'AGUARDANDO_CONTA').length);
  const pendingProductionCount = useTableStore((s) => s.orderItems.filter(isPendingProduction).length);
  const exhaustedCount = useStockStore((s) => s.dailyPrepStock.filter((stock) => stock.is_exhausted || stock.current_quantity <= 0).length);
  const activeDeliveriesCount = useDeliveryStore((s) => s.deliveryOrders.filter((order) => ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'].includes(order.status)).length);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Pular para o conteúdo</a>
      <TopTabs
        whatsappActive={activeTab === 'whatsapp'}
        canUseWhatsApp={allowedTabs.includes('whatsapp')}
        onSystem={() => { setDesktopWebOpen(false); setActiveTab(lastSystemTab.current); }}
        onWhatsApp={() => { setDesktopWebOpen(false); setActiveTab('whatsapp'); }}
        desktopWeb={window.pontoDesktop ? { active: desktopWebOpen, onOpen: () => setDesktopWebOpen(true) } : undefined}
      />
      <NavigationTabs allowed={allowedTabs} activeTab={activeTab} onChangeTab={setActiveTab} openTablesCount={openTablesCount} exhaustedCount={exhaustedCount} pendingProductionCount={pendingProductionCount} waitingBillCount={waitingBillCount} activeDeliveriesCount={activeDeliveriesCount} isMobileOpen={isMobileMenuOpen} onCloseMobile={() => setIsMobileMenuOpen(false)} />
      <div className="app-workspace flex flex-col">
        <PWAInstallBanner />
        <Header activeTab={activeTab} onOpenShiftClick={() => setIsShiftModalOpen(true)} onMenuClick={() => setIsMobileMenuOpen(true)} isMenuOpen={isMobileMenuOpen} />
        <main id="main-content" ref={mainRef} tabIndex={-1} aria-label={PAGE_TITLES[activeTab]} className="min-w-0 flex-1 pb-8 outline-none">
          {/* key: ao trocar de tela, um erro da tela anterior não fica preso */}
          <ErrorBoundary key={activeTab} area={activeTab} inline>
          {(activeTab === 'waiter' || activeTab === 'tables') && <WaiterModule onOpenShiftClick={() => setIsShiftModalOpen(true)} />}
          {activeTab === 'kds' && <KDSModule />}
          {activeTab === 'cashier' && <CashierModule />}
          {activeTab === 'delivery' && <DeliveryManagementView />}
          {activeTab === 'menu' && <DigitalMenuQrView />}
          {activeTab === 'whatsapp' && <WhatsAppView onNavigateTab={setActiveTab} />}
          {activeTab === 'products' && <ProductCatalogManageView />}
          {activeTab === 'finance' && <FinanceView />}
          {activeTab === 'reports' && <ReportsView />}
          {activeTab === 'master' && <MasterDashboardView onOpenShiftClick={() => setIsShiftModalOpen(true)} onNavigateTab={setActiveTab} />}
          {activeTab === 'stock' && <DailyStockView onOpenShiftClick={() => setIsShiftModalOpen(true)} />}
          {activeTab === 'audit' && <AuditLogView />}
          {activeTab === 'team' && <TeamManagementView />}
          {activeTab === 'settings' && <SettingsView />}
          </ErrorBoundary>
        </main>
      </div>
      <ShiftOpenModal isOpen={isShiftModalOpen} onClose={() => setIsShiftModalOpen(false)} />
    </div>
  );
}

export default App;
