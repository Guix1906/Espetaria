import { Flame, UtensilsCrossed } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FilterChip } from '../../components/ui/FilterChip';
import { isPendingProduction } from '../../lib/productionStatus';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDeliveryStore } from '../../stores/useDeliveryStore';
import { useTableStore } from '../../stores/useTableStore';
import { GrillKDSView } from './GrillKDSView';
import { KitchenKDSView } from './KitchenKDSView';

/** Cozinha e bar trabalham pelo cupom impresso: só a churrasqueira tem fila na tela. */
export type KDSSubSector = 'grill' | 'kitchen';

export function KDSModule() {
  const { currentProfile } = useAuthStore();
  const { orderItems } = useTableStore();
  const deliveryOrders = useDeliveryStore((s) => s.deliveryOrders);
  // Delivery/retirada na brasa também contam (o pedido não tem status por item)
  const grillCount = orderItems.filter(isPendingProduction).length + deliveryOrders
    .filter((o) => o.status === 'PREPARING' || o.status === 'CONFIRMED')
    .reduce((sum, o) => sum + o.items.filter((i) => i.sector === 'GRILL').length, 0);
  const [activeSector, setActiveSector] = useState<KDSSubSector>(() => currentProfile.role === 'COZINHA' ? 'kitchen' : 'grill');

  useEffect(() => {
    if (currentProfile.role === 'COZINHA') setActiveSector('kitchen');
    else if (currentProfile.role === 'CHURRASQUEIRA') setActiveSector('grill');
  }, [currentProfile.role]);

  return (
    <div className="min-w-0">
      <div className="border-b border-line bg-surface px-4 py-3 sm:px-6 xl:px-8">
        <div className="mx-auto flex max-w-[1536px] items-center justify-between gap-4">
          <div className="filter-bar" aria-label="Setor de produção">
            <FilterChip active={activeSector === 'grill'} onClick={() => setActiveSector('grill')} count={grillCount}><Flame className="h-4 w-4" aria-hidden="true" />Churrasqueira</FilterChip>
            <FilterChip active={activeSector === 'kitchen'} onClick={() => setActiveSector('kitchen')}><UtensilsCrossed className="h-4 w-4" aria-hidden="true" />Cozinha e cubas</FilterChip>
          </div>
          <span className="hidden shrink-0 items-center gap-2 text-xs text-ink-muted xl:flex"><span className="h-2 w-2 rounded-full bg-emerald-600" />Painel de produção</span>
        </div>
      </div>
      {activeSector === 'grill' ? <GrillKDSView /> : <KitchenKDSView />}
    </div>
  );
}
