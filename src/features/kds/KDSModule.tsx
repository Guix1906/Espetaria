import { useEffect, useState } from 'react';
import { Beer, Flame, UtensilsCrossed } from 'lucide-react';
import { GrillKDSView } from './GrillKDSView';
import { KitchenKDSView } from './KitchenKDSView';
import { BarKDSView } from './BarKDSView';
import { useAuthStore } from '../../stores/useAuthStore';
import { useTableStore } from '../../stores/useTableStore';
import { FilterChip } from '../../components/ui/FilterChip';

export type KDSSubSector = 'grill' | 'kitchen' | 'bar';

const sectors = [
  { id: 'grill', sector: 'GRILL', label: 'Churrasqueira', icon: Flame },
  { id: 'kitchen', sector: 'KITCHEN', label: 'Cozinha e cubas', icon: UtensilsCrossed },
  { id: 'bar', sector: 'BAR', label: 'Bar e bebidas', icon: Beer },
] as const;

export function KDSModule() {
  const { currentProfile } = useAuthStore();
  const { orderItems } = useTableStore();
  const [activeSector, setActiveSector] = useState<KDSSubSector>(() => currentProfile.role === 'COZINHA' ? 'kitchen' : currentProfile.role === 'BAR' ? 'bar' : 'grill');

  useEffect(() => {
    if (currentProfile.role === 'COZINHA') setActiveSector('kitchen');
    else if (currentProfile.role === 'BAR') setActiveSector('bar');
    else if (currentProfile.role === 'CHURRASQUEIRA') setActiveSector('grill');
  }, [currentProfile.role]);

  return (
    <div className="min-w-0">
      <div className="border-b border-line bg-surface px-4 py-3 sm:px-6 xl:px-8">
        <div className="mx-auto flex max-w-[1536px] items-center justify-between gap-4">
          <div className="filter-bar" aria-label="Setor de produção">{sectors.map(({ id, sector, label, icon: Icon }) => <FilterChip key={id} active={activeSector === id} onClick={() => setActiveSector(id)} count={orderItems.filter((item) => item.sector === sector && (item.status === 'RECEIVED' || item.status === 'IN_PREPARATION')).length}><Icon className="h-4 w-4" aria-hidden="true" />{label}</FilterChip>)}</div>
          <span className="hidden shrink-0 items-center gap-2 text-xs text-ink-muted xl:flex"><span className="h-2 w-2 rounded-full bg-emerald-600" />Painel de produção</span>
        </div>
      </div>
      {activeSector === 'grill' && <GrillKDSView />}
      {activeSector === 'kitchen' && <KitchenKDSView />}
      {activeSector === 'bar' && <BarKDSView />}
    </div>
  );
}
