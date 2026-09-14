import React, { useState, useEffect } from 'react';
import { Header } from './components/layout/Header';
import { NavigationTabs, ActiveTab } from './components/layout/NavigationTabs';
import { TableGridView } from './features/tables/TableGridView';
import { DailyStockView } from './features/stock/DailyStockView';
import { AuditLogView } from './features/audit/AuditLogView';
import { WaiterModule } from './features/waiter/WaiterModule';
import { KDSModule } from './features/kds/KDSModule';
import { ShiftOpenModal } from './features/shifts/ShiftOpenModal';
import { useTableStore } from './stores/useTableStore';
import { useStockStore } from './stores/useStockStore';
import { useAuthStore } from './stores/useAuthStore';
import { useRealtimeSync } from './hooks/useRealtimeSync';

export const App: React.FC = () => {
  // Sincroniza canais de WebSockets, disponibilidade e bipes de KDS
  useRealtimeSync();

  const { currentProfile } = useAuthStore();
  const [activeTab, setActiveTab] = useState<ActiveTab>('waiter');
  const [isShiftModalOpen, setIsShiftModalOpen] = useState<boolean>(false);

  useEffect(() => {
    if (currentProfile.role === 'GARCOM') {
      setActiveTab('waiter');
    } else if (['CHURRASQUEIRA', 'COZINHA', 'BAR'].includes(currentProfile.role)) {
      setActiveTab('kds');
    }
  }, [currentProfile.role]);

  const { tables, orderItems } = useTableStore();
  const { dailyPrepStock } = useStockStore();

  const openTablesCount = tables.filter((t) => t.status === 'OCUPADA').length;
  const exhaustedCount = dailyPrepStock.filter((s) => s.is_exhausted || s.current_quantity <= 0).length;
  const pendingProductionCount = orderItems.filter(
    (i) => i.status === 'RECEIVED' || i.status === 'IN_PREPARATION'
  ).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Cabeçalho Sticky com Controle de Turno e Perfil */}
      <Header onOpenShiftClick={() => setIsShiftModalOpen(true)} />

      {/* Barra de Navegação dos Módulos Operacionais */}
      <NavigationTabs
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        openTablesCount={openTablesCount}
        exhaustedCount={exhaustedCount}
        pendingProductionCount={pendingProductionCount}
      />

      {/* Conteúdo do Módulo Ativo */}
      <main className="flex-1 pb-16">
        {activeTab === 'waiter' && <WaiterModule />}
        {activeTab === 'tables' && <TableGridView />}
        {activeTab === 'kds' && <KDSModule />}
        {activeTab === 'stock' && (
          <DailyStockView onOpenShiftClick={() => setIsShiftModalOpen(true)} />
        )}
        {activeTab === 'audit' && <AuditLogView />}
      </main>

      {/* Modal de Abertura do Turno da Noite (Mise en Place & Cubas) */}
      <ShiftOpenModal
        isOpen={isShiftModalOpen}
        onClose={() => setIsShiftModalOpen(false)}
      />

    </div>
  );
};

export default App;
