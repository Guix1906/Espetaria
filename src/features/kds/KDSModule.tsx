import { Flame, UtensilsCrossed } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SectionTabs } from '../../components/ui/SectionTabs';
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
  const [activeSector, setActiveSectorState] = useState<KDSSubSector>(() => {
    try {
      const saved = localStorage.getItem('ponto_active_kds_sector') as KDSSubSector;
      if (saved === 'grill' || saved === 'kitchen') return saved;
    } catch {}
    return currentProfile.role === 'COZINHA' ? 'kitchen' : 'grill';
  });

  const setActiveSector = (sector: KDSSubSector) => {
    setActiveSectorState(sector);
    try {
      localStorage.setItem('ponto_active_kds_sector', sector);
    } catch {}
  };

  useEffect(() => {
    if (currentProfile.role === 'COZINHA') setActiveSector('kitchen');
    else if (currentProfile.role === 'CHURRASQUEIRA') setActiveSector('grill');
  }, [currentProfile.role]);

  return (
    <div className="min-w-0">
      <div className="bg-surface px-4 pt-2 sm:px-6 xl:px-8">
        <div className="mx-auto max-w-[1536px]">
          <SectionTabs
            label="Setor de produção"
            value={activeSector}
            onChange={setActiveSector}
            items={[
              { id: 'grill', label: 'Churrasqueira', icon: Flame, count: grillCount },
              { id: 'kitchen', label: 'Cozinha e cubas', icon: UtensilsCrossed },
            ]}
          />
        </div>
      </div>
      {activeSector === 'grill' ? <GrillKDSView /> : <KitchenKDSView />}
    </div>
  );
}
