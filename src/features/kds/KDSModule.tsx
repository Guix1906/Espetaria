import React, { useState, useEffect } from 'react';
import { Flame, UtensilsCrossed, Beer } from 'lucide-react';
import { GrillKDSView } from './GrillKDSView';
import { KitchenKDSView } from './KitchenKDSView';
import { BarKDSView } from './BarKDSView';
import { useAuthStore } from '../../stores/useAuthStore';
import { useTableStore } from '../../stores/useTableStore';

export type KDSSubSector = 'grill' | 'kitchen' | 'bar';

export const KDSModule: React.FC = () => {
  const { currentProfile } = useAuthStore();
  const { orderItems } = useTableStore();

  const [activeSector, setActiveSector] = useState<KDSSubSector>(() => {
    if (currentProfile.role === 'COZINHA') return 'kitchen';
    if (currentProfile.role === 'BAR') return 'bar';
    return 'grill';
  });

  // Atualiza setor se o perfil mudar
  useEffect(() => {
    if (currentProfile.role === 'COZINHA') setActiveSector('kitchen');
    else if (currentProfile.role === 'BAR') setActiveSector('bar');
    else if (currentProfile.role === 'CHURRASQUEIRA') setActiveSector('grill');
  }, [currentProfile.role]);

  // Contagem de pendentes por setor
  const pendingGrillCount = orderItems.filter(
    (i) => i.sector === 'GRILL' && (i.status === 'RECEIVED' || i.status === 'IN_PREPARATION')
  ).length;

  const pendingKitchenCount = orderItems.filter(
    (i) => i.sector === 'KITCHEN' && (i.status === 'RECEIVED' || i.status === 'IN_PREPARATION')
  ).length;

  const pendingBarCount = orderItems.filter(
    (i) => i.sector === 'BAR' && (i.status === 'RECEIVED' || i.status === 'IN_PREPARATION')
  ).length;

  return (
    <div className="flex flex-col min-h-screen bg-slate-950">
      
      {/* Seletor de Setores de Produção KDS */}
      <div className="bg-slate-900 border-b border-slate-800 px-3 sm:px-6 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
            {/* Aba Churrasqueira */}
            <button
              onClick={() => setActiveSector('grill')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition active:scale-95 ${
                activeSector === 'grill'
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-950/60'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Flame className="w-4 h-4" />
              <span>Churrasqueira</span>
              {pendingGrillCount > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-700 font-mono">
                  {pendingGrillCount}
                </span>
              )}
            </button>

            {/* Aba Cozinha & Cubas */}
            <button
              onClick={() => setActiveSector('kitchen')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition active:scale-95 ${
                activeSector === 'kitchen'
                  ? 'bg-teal-600 text-white shadow-lg shadow-teal-950/60'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <UtensilsCrossed className="w-4 h-4" />
              <span>Cozinha & Cubas</span>
              {pendingKitchenCount > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-950 text-teal-300 border border-teal-700 font-mono">
                  {pendingKitchenCount}
                </span>
              )}
            </button>

            {/* Aba Bar */}
            <button
              onClick={() => setActiveSector('bar')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition active:scale-95 ${
                activeSector === 'bar'
                  ? 'bg-sky-600 text-white shadow-lg shadow-sky-950/60'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Beer className="w-4 h-4" />
              <span>Bar & Bebidas</span>
              {pendingBarCount > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-950 text-sky-300 border border-sky-700 font-mono">
                  {pendingBarCount}
                </span>
              )}
            </button>
          </div>

          <div className="hidden sm:flex items-center text-xs text-slate-500 font-mono">
            <span>Operação KDS Ativa</span>
          </div>
        </div>
      </div>

      {/* Renderização do KDS Ativo */}
      <div className="flex-1">
        {activeSector === 'grill' && <GrillKDSView />}
        {activeSector === 'kitchen' && <KitchenKDSView />}
        {activeSector === 'bar' && <BarKDSView />}
      </div>

    </div>
  );
};
