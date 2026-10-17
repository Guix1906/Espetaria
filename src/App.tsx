import { useEffect, useRef, useState } from 'react';
import { Header } from './components/layout/Header';
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
import { useRealtimeSync } from './hooks/useRealtimeSync';
import { LoginScreen } from './features/auth/LoginScreen';
import { AuthShell } from './features/auth/AuthShell';
import { PublicMenuPage } from './features/delivery/PublicMenuPage';
import { PublicOrderTrackingPage } from './features/delivery/PublicOrderTrackingPage';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { RemoteErrorBanner } from './components/ui/RemoteErrorBanner';
import { ConfirmDialogProvider } from './components/ui/ConfirmDialog';
import { useAuthStore } from './stores/useAuthStore';
import { useDeliveryStore } from './stores/useDeliveryStore';
import { useStockStore } from './stores/useStockStore';
import { useTableStore } from './stores/useTableStore';

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

function AdminWorkspace() {
  const { currentProfile } = useAuthStore();
  const allowedTabs = tabsForRole(currentProfile.role);
  const [requestedTab, setActiveTab] = useState<ActiveTab>(() => allowedTabs[0] ?? 'waiter');
  // Nunca renderiza uma tela fora das permissões do papel atual
  const activeTab: ActiveTab = allowedTabs.includes(requestedTab) ? requestedTab : (allowedTabs[0] ?? 'waiter');
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const previousTab = useRef(activeTab);

  useEffect(() => {
    setActiveTab(tabsForRole(currentProfile.role)[0] ?? 'waiter');
  }, [currentProfile.role]);

  useEffect(() => {
    document.title = `${PAGE_TITLES[activeTab]} | Ponto`;
    if (previousTab.current !== activeTab) {
      window.scrollTo({ top: 0 });
      mainRef.current?.focus({ preventScroll: true });
    }
    previousTab.current = activeTab;
  }, [activeTab]);

  const { tables, orderItems } = useTableStore();
  const { dailyPrepStock } = useStockStore();
  const { deliveryOrders } = useDeliveryStore();
  const openTablesCount = tables.filter((table) => table.status === 'OCUPADA' || table.status === 'AGUARDANDO_CONTA').length;
  const waitingBillCount = tables.filter((table) => table.status === 'AGUARDANDO_CONTA').length;
  const exhaustedCount = dailyPrepStock.filter((stock) => stock.is_exhausted || stock.current_quantity <= 0).length;
  const pendingProductionCount = orderItems.filter((item) => item.status === 'RECEIVED' || item.status === 'IN_PREPARATION').length;
  const activeDeliveriesCount = deliveryOrders.filter((order) => ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'].includes(order.status)).length;

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Pular para o conteúdo</a>
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
