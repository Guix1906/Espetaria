import {
  AlertOctagon,
  CheckCircle2,
  Printer,
  Soup,
  UtensilsCrossed,
  Volume2,
  VolumeX
} from 'lucide-react';
import React, { useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { audioService } from '../../lib/audio';
import { useAuthStore } from '../../stores/useAuthStore';
import { usePrintStore } from '../../stores/usePrintStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useStockStore } from '../../stores/useStockStore';
import { GrillReadyAlerts } from './GrillReadyAlerts';

/**
 * A cozinha trabalha pelo cupom impresso (sem botões de preparo):
 * aqui ficam só o aviso de espeto pronto para montar a bandeja e o saldo das cubas.
 */
export const KitchenKDSView: React.FC = () => {
  const { products, dailyPrepStock, toggleExhaustProduct } = useStockStore();
  const { currentShift } = useShiftStore();
  const { currentProfile } = useAuthStore();
  const { jobs } = usePrintStore();

  const kitchenPrintJobsCount = jobs.filter((j) => j.sector === 'KITCHEN' && j.status === 'PRINTED').length;

  const [audioEnabled, setAudioEnabled] = useState<boolean>(audioService.getAudioEnabled());
  const [showCubasMonitor, setShowCubasMonitor] = useState<boolean>(true);

  const handleToggleAudio = () => {
    const next = !audioEnabled;
    audioService.setAudioEnabled(next);
    setAudioEnabled(next);
    if (next) {
      audioService.playNewOrderSound();
    }
  };

  // Produtos gerenciados em cubas ou da cozinha
  const cubaStockItems = dailyPrepStock.filter((s) => {
    const prod = products.find((p) => p.id === s.product_id);
    return prod?.is_cubas || prod?.sector === 'KITCHEN';
  });

  const handleToggleExhaustCuba = (productId: string, currentExhausted: boolean) => {
    if (!currentShift) return;
    const nextStatus = !currentExhausted;
    const reason = nextStatus ? 'Esgotado pelo cozinheiro via KDS Cubas' : undefined;
    toggleExhaustProduct(currentShift.id, productId, nextStatus, currentProfile.id, reason);
  };

  return (
    <div className="page-layout">

      <PageHeader eyebrow="Produção" title="Cozinha" description="A cozinha trabalha pelo cupom impresso. Aqui aparecem os espetos prontos para montar a bandeja." icon={UtensilsCrossed} actions={<>
        <button type="button" onClick={handleToggleAudio} className="icon-button" aria-pressed={audioEnabled} aria-label={audioEnabled ? 'Desativar alertas sonoros' : 'Ativar alertas sonoros'} title={audioEnabled ? 'Som ativado' : 'Som desativado'}>{audioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</button>
        <button type="button" aria-expanded={showCubasMonitor} onClick={() => setShowCubasMonitor(!showCubasMonitor)} className="btn-secondary"><Soup className="h-4 w-4" aria-hidden="true" />{showCubasMonitor ? 'Ocultar cubas' : 'Mostrar cubas'}</button>
      </>} />

      <GrillReadyAlerts />

      <p className="flex items-center gap-2 text-sm text-ink-muted">
        <Printer className="h-4 w-4" aria-hidden="true" />
        Os pedidos também saem na impressora da cozinha · {kitchenPrintJobsCount} {kitchenPrintJobsCount === 1 ? 'cupom impresso' : 'cupons impressos'}
      </p>

      {/* MONITOR DE CUBAS GASTRONÔMICAS (GN) */}
      {showCubasMonitor && (
        <div className="bg-surface-muted border border-emerald-200 rounded-2xl shadow-sm overflow-hidden p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <Soup className="w-5 h-5 text-emerald-700" />
              <h3 className="font-bold text-ink text-sm font-sans">
                Estoque das cubas
              </h3>
            </div>
            <span className="text-xs text-ink-muted tabular-nums">
              Saldo disponível em porções
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
            {cubaStockItems.map((item) => {
              const prod = products.find((p) => p.id === item.product_id);
              if (!prod) return null;

              const isExhausted = item.is_exhausted || item.current_quantity <= 0;
              const isLow = item.current_quantity <= 10 && !isExhausted;
              const percent = item.initial_quantity > 0
                ? Math.max(0, Math.min(100, Math.round((item.current_quantity / item.initial_quantity) * 100)))
                : 0;

              return (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-2xl border transition flex flex-col justify-between shadow-sm ${isExhausted
                      ? 'bg-rose-50 border-rose-200 text-ink-muted'
                      : isLow
                        ? 'bg-amber-50'
                        : 'bg-surface-muted border-line'
                    }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-1">
                      <h4 className="font-bold text-xs text-ink line-clamp-1">
                        {prod.name}
                      </h4>
                      {isExhausted ? (
                        <span className="text-xs px-1.5 py-0.5 rounded-sm bg-rose-100 text-rose-800 font-medium">
                          Zero
                        </span>
                      ) : isLow ? (
                        <span className="text-xs px-1.5 py-0.5 rounded-sm bg-amber-100 text-amber-800 font-medium">
                          Baixo
                        </span>
                      ) : null}
                    </div>

                    {/* Barra de Progresso da Cuba */}
                    <div className="mt-2.5 space-y-1">
                      <div className="w-full h-2 rounded-sm bg-surface-muted overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${isExhausted
                              ? 'bg-rose-700'
                              : isLow
                                ? 'bg-amber-700'
                                : 'bg-emerald-700'
                            }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs tabular-nums text-ink-muted">
                        <span>Resta: <strong className="text-ink font-bold">{item.current_quantity}</strong></span>
                        <span>{percent}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Botão de Bloqueio Rápido de Cuba */}
                  <button
                    onClick={() => handleToggleExhaustCuba(item.product_id, item.is_exhausted)}
                    className={`mt-3 w-full py-1.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 ${isExhausted
                        ? 'btn-success'
                        : 'bg-surface-muted hover:bg-rose-50 border-line hover: text-ink hover:text-rose-700'
                      }`}
                    type="button">
                    {isExhausted ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Reativar cuba</span>
                      </>
                    ) : (
                      <>
                        <AlertOctagon className="w-3 h-3 text-rose-700" />
                        <span>Marcar cuba esgotada</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
};
