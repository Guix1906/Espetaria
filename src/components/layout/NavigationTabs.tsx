import { X } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { BrandMark } from './BrandMark';
import { NAVIGATION_GROUPS, PAGE_TITLES, type ActiveTab } from './navigation';

export type { ActiveTab } from './navigation';

interface NavigationTabsProps {
  /** Telas liberadas para o papel do usuário logado. */
  allowed: ActiveTab[];
  activeTab: ActiveTab;
  onChangeTab: (tab: ActiveTab) => void;
  openTablesCount: number;
  exhaustedCount: number;
  pendingProductionCount?: number;
  waitingBillCount?: number;
  activeDeliveriesCount?: number;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export function NavigationTabs({ allowed, activeTab, onChangeTab, openTablesCount, exhaustedCount, pendingProductionCount = 0, waitingBillCount = 0, activeDeliveriesCount = 0, isMobileOpen, onCloseMobile }: NavigationTabsProps) {
  const counts: Partial<Record<ActiveTab, number>> = {
    tables: openTablesCount,
    kds: pendingProductionCount,
    cashier: waitingBillCount,
    delivery: activeDeliveriesCount,
    stock: exhaustedCount,
  };

  const content = (mobile: boolean) => (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-5 py-4">
        <BrandMark inverted />
        {mobile && <button type="button" onClick={onCloseMobile} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-stone-300 hover:bg-white/10" aria-label="Fechar menu"><X className="h-5 w-5" /></button>}
      </div>
      <nav aria-label={mobile ? 'Menu principal' : 'Navegação principal'} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAVIGATION_GROUPS.map((group) => ({ ...group, items: group.items.filter(({ id }) => allowed.includes(id)) }))
          .filter((group) => group.items.length > 0)
          .map((group) => (
          <div key={group.label}>
            <p className="nav-group-label">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map(({ id, icon: Icon }) => {
                const count = counts[id] ?? 0;
                const needsAttention = id === 'cashier' || id === 'stock';
                return (
                  <button
                    key={id}
                    type="button"
                    className="nav-item"
                    aria-current={activeTab === id ? 'page' : undefined}
                    aria-controls="main-content"
                    onClick={() => { onChangeTab(id); if (mobile) onCloseMobile(); }}
                  >
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
                    <span className="flex-1">{PAGE_TITLES[id]}</span>
                    {count > 0 && <span className={`rounded-sm px-2 py-0.5 text-xs font-semibold tabular-nums ${needsAttention ? 'bg-brand-500 text-white' : 'bg-white/10 text-stone-200'}`} aria-label={`${count} ${id === 'stock' ? 'produtos esgotados' : 'em andamento'}`}>{count}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </>
  );

  return (
    <>
      <aside className="app-sidebar fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col lg:flex">{content(false)}</aside>
      {isMobileOpen && <Dialog label="Navegação do sistema" onClose={onCloseMobile} placement="navigation"><div className="dialog-panel app-sidebar flex flex-col !border-0">{content(true)}</div></Dialog>}
    </>
  );
}
