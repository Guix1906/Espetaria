import { useEffect,useRef,useState } from 'react';
import { Header } from './components/layout/Header';
import { NavigationTabs } from './components/layout/NavigationTabs';
import { PAGE_TITLES,type ActiveTab } from './components/layout/navigation';
import { PWAInstallBanner } from './components/pwa/PWAInstallBanner';
import { MasterDashboardView } from './features/admin/MasterDashboardView';
import { AuditLogView } from './features/audit/AuditLogView';
import { CashierModule } from './features/cashier/CashierModule';
import { DeliveryCatalogView } from './features/delivery/DeliveryCatalogView';
import { DeliveryManagementView } from './features/delivery/DeliveryManagementView';
import { KDSModule } from './features/kds/KDSModule';
import { ShiftOpenModal } from './features/shifts/ShiftOpenModal';
import { DailyStockView } from './features/stock/DailyStockView';
import { TableGridView } from './features/tables/TableGridView';
import { WaiterModule } from './features/waiter/WaiterModule';
import { useRealtimeSync } from './hooks/useRealtimeSync';
import { useAuthStore } from './stores/useAuthStore';
import { useDeliveryStore } from './stores/useDeliveryStore';
import { useStockStore } from './stores/useStockStore';
import { useTableStore } from './stores/useTableStore';

export function App() {
  useRealtimeSync();
  const { currentProfile } = useAuthStore();
  const [activeTab, setActiveTab] = useState<ActiveTab>('waiter');
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const previousTab = useRef(activeTab);

  useEffect(() => {
    if (currentProfile.role === 'GARCOM') setActiveTab('waiter');
    else if (['CHURRASQUEIRA', 'COZINHA', 'BAR'].includes(currentProfile.role)) setActiveTab('kds');
    else if (currentProfile.role === 'CAIXA') setActiveTab('cashier');
    else if (currentProfile.role === 'MASTER' || currentProfile.role === 'GERENTE') setActiveTab('master');
  }, [currentProfile.role]);

  useEffect(() => {
    document.title = `${PAGE_TITLES[activeTab]} | Sabor da Carne`;
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
  const activeDeliveriesCount = deliveryOrders.filter((order) => ['CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY'].includes(order.status)).length;

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Pular para o conteúdo</a>
      <NavigationTabs activeTab={activeTab} onChangeTab={setActiveTab} openTablesCount={openTablesCount} exhaustedCount={exhaustedCount} pendingProductionCount={pendingProductionCount} waitingBillCount={waitingBillCount} activeDeliveriesCount={activeDeliveriesCount} isMobileOpen={isMobileMenuOpen} onCloseMobile={() => setIsMobileMenuOpen(false)} />
      <div className="app-workspace flex flex-col">
        <PWAInstallBanner />
        <Header activeTab={activeTab} onOpenShiftClick={() => setIsShiftModalOpen(true)} onMenuClick={() => setIsMobileMenuOpen(true)} isMenuOpen={isMobileMenuOpen} />
        <main id="main-content" ref={mainRef} tabIndex={-1} aria-label={PAGE_TITLES[activeTab]} className="min-w-0 flex-1 pb-8 outline-none">
          {activeTab === 'waiter' && <WaiterModule />}
          {activeTab === 'tables' && <TableGridView />}
          {activeTab === 'kds' && <KDSModule />}
          {activeTab === 'cashier' && <CashierModule />}
          {activeTab === 'delivery' && <DeliveryManagementView />}
          {activeTab === 'menu' && <DeliveryCatalogView />}
          {activeTab === 'master' && <MasterDashboardView />}
          {activeTab === 'stock' && <DailyStockView onOpenShiftClick={() => setIsShiftModalOpen(true)} />}
          {activeTab === 'audit' && <AuditLogView />}
        </main>
      </div>
      <ShiftOpenModal isOpen={isShiftModalOpen} onClose={() => setIsShiftModalOpen(false)} />
    </div>
  );
}

export default App;
