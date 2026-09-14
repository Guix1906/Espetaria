import { ChefHat,X } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { BrandMark } from './BrandMark';
import { NAVIGATION_GROUPS,PAGE_TITLES,type ActiveTab } from './navigation';

export type { ActiveTab } from './navigation';

interface NavigationTabsProps {
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

export function NavigationTabs({ activeTab, onChangeTab, openTablesCount, exhaustedCount, pendingProductionCount = 0, waitingBillCount = 0, activeDeliveriesCount = 0, isMobileOpen, onCloseMobile }: NavigationTabsProps) {
  const counts: Partial<Record<ActiveTab, number>> = {
    tables: openTablesCount,
    kds: pendingProductionCount,
    cashier: waitingBillCount,
    delivery: activeDeliveriesCount,
    stock: exhaustedCount,
  };

  const content = (mobile: boolean) => (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-6">
        <BrandMark />
        {mobile && <button type="button" onClick={onCloseMobile} className="icon-button" aria-label="Fechar menu"><X className="h-5 w-5" /></button>}
      </div>
      <nav aria-label={mobile ? 'Menu principal' : 'Navegação principal'} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5">
        {NAVIGATION_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-3.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">{group.label}</p>
            <div className="space-y-1">
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
                    {count > 0 && <span className={`rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${needsAttention ? 'bg-rose-50 text-rose-700' : 'bg-surface-muted text-ink-secondary'}`} aria-label={`${count} ${id === 'stock' ? 'produtos esgotados' : 'em andamento'}`}>{count}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="m-4 mt-0 flex items-start gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-4">
        <ChefHat className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden="true" />
        <div><p className="text-xs font-semibold text-brand-900">Uma operação, mais simples.</p><p className="mt-1 text-xs leading-relaxed text-ink-muted">Salão, cozinha e delivery no mesmo lugar.</p></div>
      </div>
    </>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-line bg-surface lg:flex">{content(false)}</aside>
      {isMobileOpen && <Dialog label="Navegação do sistema" onClose={onCloseMobile} placement="navigation"><div className="dialog-panel flex flex-col">{content(true)}</div></Dialog>}
    </>
  );
}
