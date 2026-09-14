import React, { useState } from 'react';
import { Flame, ChevronDown, ChevronUp } from 'lucide-react';
import { OrderItem } from '../../types/domain';
import { MeatDoneness } from '../../types/enums';
import { formatDoneness } from '../../lib/formatters';

interface GrillLiveSummaryProps {
  orderItems: OrderItem[];
}

interface AggregatedSkewer {
  productId: string;
  productName: string;
  onGrillCount: number;
  waitingCount: number;
  totalCount: number;
  donenessBreakdown: Record<MeatDoneness, number>;
}

export const GrillLiveSummary: React.FC<GrillLiveSummaryProps> = ({ orderItems }) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  // Considera apenas itens de churrasqueira ativos (não cancelados e não entregues)
  const activeGrillItems = orderItems.filter(
    (i) => i.sector === 'GRILL' && (i.status === 'IN_PREPARATION' || i.status === 'RECEIVED')
  );

  // Total geral
  const totalOnGrill = activeGrillItems
    .filter((i) => i.status === 'IN_PREPARATION')
    .reduce((sum, i) => sum + i.quantity, 0);

  const totalWaiting = activeGrillItems
    .filter((i) => i.status === 'RECEIVED')
    .reduce((sum, i) => sum + i.quantity, 0);

  // Agrega por produto
  const aggregatedMap = new Map<string, AggregatedSkewer>();

  activeGrillItems.forEach((item) => {
    let entry = aggregatedMap.get(item.product_id);
    if (!entry) {
      entry = {
        productId: item.product_id,
        productName: item.product_name,
        onGrillCount: 0,
        waitingCount: 0,
        totalCount: 0,
        donenessBreakdown: {
          MAL_PASSADA: 0,
          AO_PONTO_PARA_MAL: 0,
          AO_PONTO: 0,
          AO_PONTO_PARA_BEM: 0,
          BEM_PASSADA: 0,
        },
      };
      aggregatedMap.set(item.product_id, entry);
    }

    if (item.status === 'IN_PREPARATION') {
      entry.onGrillCount += item.quantity;
    } else if (item.status === 'RECEIVED') {
      entry.waitingCount += item.quantity;
    }
    entry.totalCount += item.quantity;

    if (item.doneness) {
      entry.donenessBreakdown[item.doneness] =
        (entry.donenessBreakdown[item.doneness] || 0) + item.quantity;
    }
  });

  const aggregatedList = Array.from(aggregatedMap.values()).sort(
    (a, b) => b.totalCount - a.totalCount
  );

  if (activeGrillItems.length === 0) {
    return (
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 text-slate-400 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-amber-500/70" />
          <span>Nenhum espeto na brasa ou na fila neste momento. Grelha livre!</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/95 border-2 border-amber-600/40 rounded-2xl shadow-xl overflow-hidden">
      {/* Barra de Controle / Resumo Rápido */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="px-4 py-3 bg-gradient-to-r from-amber-950/70 via-slate-900 to-slate-900 flex items-center justify-between cursor-pointer hover:bg-slate-800/60 transition select-none"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-amber-600 text-slate-950 flex items-center justify-center font-black">
            <Flame className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h4 className="text-sm sm:text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
              <span>Resumo Agregado da Grelha</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 font-mono">
                {aggregatedList.length} tipos de espeto
              </span>
            </h4>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-700/80 font-bold">
              🔥 {totalOnGrill} na brasa
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-950 text-amber-300 border border-amber-700/80 font-bold">
              ⏳ {totalWaiting} na fila
            </span>
          </div>

          <button className="p-1 rounded-lg text-slate-400 hover:text-white">
            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Conteúdo Expansível do Resumo */}
      {isExpanded && (
        <div className="p-3.5 border-t border-slate-800 bg-slate-950/60">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {aggregatedList.map((skewer) => {
              const hasDoneness = Object.values(skewer.donenessBreakdown).some((cnt) => cnt > 0);

              return (
                <div
                  key={skewer.productId}
                  className="p-3 rounded-xl bg-slate-900 border border-slate-700/80 hover:border-amber-500/60 transition flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-1">
                      <h5 className="font-extrabold text-white text-sm leading-tight line-clamp-1">
                        {skewer.productName}
                      </h5>
                      <span className="text-base font-black text-amber-400 font-mono shrink-0">
                        {skewer.totalCount}x
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-slate-400">
                      <span className="text-emerald-400 font-semibold">
                        {skewer.onGrillCount} assando
                      </span>
                      <span>•</span>
                      <span className="text-amber-400 font-semibold">
                        {skewer.waitingCount} aguardando
                      </span>
                    </div>
                  </div>

                  {/* Detalhamento por Ponto da Carne */}
                  {hasDoneness && (
                    <div className="mt-2 pt-2 border-t border-slate-800/80 flex flex-wrap gap-1">
                      {(Object.entries(skewer.donenessBreakdown) as [MeatDoneness, number][])
                        .filter(([_, count]) => count > 0)
                        .map(([doneness, count]) => (
                          <span
                            key={doneness}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/80 font-mono font-semibold"
                          >
                            {count}x {formatDoneness(doneness)}
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
