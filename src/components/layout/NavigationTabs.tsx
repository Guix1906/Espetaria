import React from 'react';
import { Smartphone, LayoutGrid, Flame, Receipt, PackageCheck, FileText, Bike, Sparkles, ShieldCheck } from 'lucide-react';

export type ActiveTab = 'waiter' | 'tables' | 'kds' | 'cashier' | 'delivery' | 'menu' | 'master' | 'stock' | 'audit';

interface NavigationTabsProps {
  activeTab: ActiveTab;
  onChangeTab: (tab: ActiveTab) => void;
  openTablesCount: number;
  exhaustedCount: number;
  pendingProductionCount?: number;
  waitingBillCount?: number;
  activeDeliveriesCount?: number;
}

export const NavigationTabs: React.FC<NavigationTabsProps> = ({
  activeTab,
  onChangeTab,
  openTablesCount,
  exhaustedCount,
  pendingProductionCount = 0,
  waitingBillCount = 0,
  activeDeliveriesCount = 0,
}) => {
  const tabs = [
    {
      id: 'waiter' as ActiveTab,
      label: 'App do Garçom (PWA)',
      icon: Smartphone,
      badge: 'Mobile',
      badgeColor: 'bg-rose-500/20 text-rose-400 border border-rose-500/40',
    },
    {
      id: 'tables' as ActiveTab,
      label: 'Visão Geral do Salão',
      icon: LayoutGrid,
      badge: openTablesCount > 0 ? `${openTablesCount} ocupadas` : undefined,
      badgeColor: 'bg-amber-500/20 text-amber-400 border border-amber-500/40',
    },
    {
      id: 'kds' as ActiveTab,
      label: 'KDS Produção',
      icon: Flame,
      badge: pendingProductionCount > 0 ? `${pendingProductionCount} na fila` : undefined,
      badgeColor: 'bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse',
    },
    {
      id: 'cashier' as ActiveTab,
      label: 'Caixa & Fechamento',
      icon: Receipt,
      badge: waitingBillCount > 0 ? `${waitingBillCount} pedindo conta` : undefined,
      badgeColor: 'bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse font-bold',
    },
    {
      id: 'delivery' as ActiveTab,
      label: 'Delivery & Motoboys',
      icon: Bike,
      badge: activeDeliveriesCount > 0 ? `${activeDeliveriesCount} ativos` : undefined,
      badgeColor: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse font-bold',
    },
    {
      id: 'menu' as ActiveTab,
      label: 'Cardápio Digital (Cliente)',
      icon: Sparkles,
      badge: 'Online',
      badgeColor: 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40',
    },
    {
      id: 'master' as ActiveTab,
      label: 'Painel Master (DRE)',
      icon: ShieldCheck,
      badge: 'Gerencial',
      badgeColor: 'bg-amber-500/20 text-amber-400 border border-amber-500/40',
    },
    {
      id: 'stock' as ActiveTab,
      label: 'Estoque Diário & Esgotamento',
      icon: PackageCheck,
      badge: exhaustedCount > 0 ? `${exhaustedCount} esgotados` : undefined,
      badgeColor: 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse',
    },
    {
      id: 'audit' as ActiveTab,
      label: 'Auditoria de Estoque',
      icon: FileText,
    },
  ];

  return (
    <nav className="bg-slate-900 border-b border-slate-800 px-3 sm:px-6">
      <div className="max-w-7xl mx-auto flex items-center space-x-1 sm:space-x-2 overflow-x-auto py-2 scrollbar-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onChangeTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition whitespace-nowrap active:scale-95 ${
                isActive
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-950/50'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${tab.badgeColor}`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
