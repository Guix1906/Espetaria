import React from 'react';
import { Smartphone, LayoutGrid, Flame, Receipt, PackageCheck, FileText, Bike, Sparkles, ShieldCheck } from 'lucide-react';

export type ActiveTab = 'waiter' | 'tables' | 'kds' | 'cashier' | 'delivery' | 'menu' | 'master' | 'stock' | 'audit';
interface NavigationTabsProps { activeTab: ActiveTab; onChangeTab: (tab: ActiveTab) => void; openTablesCount: number; exhaustedCount: number; pendingProductionCount?: number; waitingBillCount?: number; activeDeliveriesCount?: number; }

export const NavigationTabs: React.FC<NavigationTabsProps> = ({ 
  activeTab, 
  onChangeTab, 
  openTablesCount, 
  exhaustedCount, 
  pendingProductionCount = 0, 
  waitingBillCount = 0, 
  activeDeliveriesCount = 0 
}) => {
  const tabs = [
    { id: 'waiter' as ActiveTab, label: 'Garçom', icon: Smartphone, badge: 'PWA', badgeVariant: 'default' },
    { id: 'tables' as ActiveTab, label: 'Salão & Mesas', icon: LayoutGrid, badge: openTablesCount ? `${openTablesCount}` : undefined, badgeVariant: 'gold' },
    { id: 'kds' as ActiveTab, label: 'KDS Produção', icon: Flame, badge: pendingProductionCount ? `${pendingProductionCount}` : undefined, badgeVariant: 'ember' },
    { id: 'cashier' as ActiveTab, label: 'Caixa', icon: Receipt, badge: waitingBillCount ? `${waitingBillCount}` : undefined, badgeVariant: 'ruby' },
    { id: 'delivery' as ActiveTab, label: 'Delivery', icon: Bike, badge: activeDeliveriesCount ? `${activeDeliveriesCount}` : undefined, badgeVariant: 'sky' },
    { id: 'menu' as ActiveTab, label: 'Cardápio Digital', icon: Sparkles },
    { id: 'master' as ActiveTab, label: 'Gestão Master', icon: ShieldCheck },
    { id: 'stock' as ActiveTab, label: 'Estoque Diário', icon: PackageCheck, badge: exhaustedCount ? `${exhaustedCount}` : undefined, badgeVariant: 'ruby' },
    { id: 'audit' as ActiveTab, label: 'Auditoria', icon: FileText },
  ];

  return (
    <nav className="border-b border-white/[0.08] bg-[#0c0d14]/90 px-3 backdrop-blur-xl sm:px-6">
      <div className="mx-auto flex max-w-[1520px] items-center gap-1.5 overflow-x-auto py-2 scrollbar-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          let badgeClasses = 'bg-white/10 text-stone-300';
          if (tab.badgeVariant === 'ember') badgeClasses = 'bg-orange-500/20 text-orange-400 border border-orange-500/30';
          else if (tab.badgeVariant === 'gold') badgeClasses = 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
          else if (tab.badgeVariant === 'ruby') badgeClasses = 'bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse';
          else if (tab.badgeVariant === 'sky') badgeClasses = 'bg-sky-500/20 text-sky-300 border border-sky-500/30';

          return (
            <button
              key={tab.id}
              onClick={() => onChangeTab(tab.id)}
              className={`group relative flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold whitespace-nowrap transition active:scale-95 ${
                isActive
                  ? 'bg-gradient-to-r from-orange-500/20 via-amber-500/15 to-orange-500/20 border border-orange-500/40 text-orange-300 shadow-[0_0_15px_rgba(249,115,22,0.15)] font-black'
                  : 'text-stone-400 hover:bg-white/[0.05] hover:text-stone-200 border border-transparent'
              }`}
            >
              <Icon
                className={`h-4 w-4 transition ${
                  isActive ? 'text-orange-400 scale-110' : 'text-stone-500 group-hover:text-stone-300'
                }`}
                strokeWidth={isActive ? 2.2 : 1.8}
              />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-mono font-black ${badgeClasses}`}>
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
