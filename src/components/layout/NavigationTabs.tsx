import React from 'react';
import { LayoutGrid, PackageCheck, FileText } from 'lucide-react';

export type ActiveTab = 'tables' | 'stock' | 'audit';

interface NavigationTabsProps {
  activeTab: ActiveTab;
  onChangeTab: (tab: ActiveTab) => void;
  openTablesCount: number;
  exhaustedCount: number;
}

export const NavigationTabs: React.FC<NavigationTabsProps> = ({
  activeTab,
  onChangeTab,
  openTablesCount,
  exhaustedCount,
}) => {
  const tabs = [
    {
      id: 'tables' as ActiveTab,
      label: 'Mesas & Salão',
      icon: LayoutGrid,
      badge: openTablesCount > 0 ? `${openTablesCount} ocupadas` : undefined,
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
