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
    <div className="flex flex-col min-h-screen bg-obsidian-950">
      
      {/* Seletor de Setores de Produção KDS */}
      <div className="bg-[#0c0d14] border-b border-white/10 px-3 sm:px-6 py-2.5 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
            {/* Aba Churrasqueira */}
            <button
              onClick={() => setActiveSector('grill')}
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs sm:text-sm font-bold transition active:scale-95 ${
                activeSector === 'grill'
                  ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-lg shadow-orange-500/25 font-black'
                  : 'text-stone-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <Flame className="w-4 h-4 text-orange-400" />
              <span>Churrasqueira</span>
              {pendingGrillCount > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/40 font-mono font-black">
                  {pendingGrillCount}
                </span>
              )}
            </button>

            {/* Aba Cozinha & Cubas */}
            <button
              onClick={() => setActiveSector('kitchen')}
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs sm:text-sm font-bold transition active:scale-95 ${
                activeSector === 'kitchen'
                  ? 'bg-gradient-to-r from-teal-500 to-emerald-600 text-white shadow-lg shadow-teal-500/25 font-black'
                  : 'text-stone-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <UtensilsCrossed className="w-4 h-4 text-teal-400" />
              <span>Cozinha & Cubas</span>
              {pendingKitchenCount > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/40 font-mono font-black">
                  {pendingKitchenCount}
                </span>
              )}
            </button>

            {/* Aba Bar */}
            <button
              onClick={() => setActiveSector('bar')}
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs sm:text-sm font-bold transition active:scale-95 ${
                activeSector === 'bar'
                  ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/25 font-black'
                  : 'text-stone-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <Beer className="w-4 h-4 text-sky-400" />
              <span>Bar & Bebidas</span>
              {pendingBarCount > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/40 font-mono font-black">
                  {pendingBarCount}
                </span>
              )}
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-xs text-stone-400 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>KDS em Tempo Real</span>
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
