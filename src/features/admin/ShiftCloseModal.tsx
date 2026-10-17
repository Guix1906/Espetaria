import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  CheckCheck,
  FileText,
  PackageCheck,
  X
} from 'lucide-react';
import React, { useState } from 'react';
import { Dialog } from '../../components/ui/Dialog';
import { formatBRL } from '../../lib/formatters';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDeliveryStore } from '../../stores/useDeliveryStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useStockStore } from '../../stores/useStockStore';
import { useTableStore } from '../../stores/useTableStore';

interface ShiftCloseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShiftClosed?: () => void;
}

type Step = 'STOCK_COUNT' | 'CASH_DRAWER' | 'FINAL_CONFIRMATION';
const STEPS: { id: Step; label: string; icon: typeof PackageCheck }[] = [
  { id: 'STOCK_COUNT', label: '1. Estoque físico', icon: PackageCheck },
  { id: 'CASH_DRAWER', label: '2. Gaveta do caixa', icon: Banknote },
  { id: 'FINAL_CONFIRMATION', label: '3. Resumo', icon: FileText },
];

/** Aceita "1.234,56", "1234,56" ou "1234.56". Vazio ou inválido = null (nunca vira "caixa exato"). */
function parseMoney(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export const ShiftCloseModal: React.FC<ShiftCloseModalProps> = ({
  isOpen,
  onClose,
  onShiftClosed,
}) => {
  const { currentShift, closeShift } = useShiftStore();
  const { dailyPrepStock, products, adjustStockPhysicalCount } = useStockStore();
  const { payments } = useTableStore();
  const { deliveryOrders } = useDeliveryStore();
  const { currentProfile } = useAuthStore();

  const [step, setStep] = useState<Step>('STOCK_COUNT');
  const [physicalCounts, setPhysicalCounts] = useState<Record<string, string>>({});
  const [cashDrawerEnd, setCashDrawerEnd] = useState<string>('');
  const [differenceReason, setDifferenceReason] = useState<string>('');
  const [closingNotes, setClosingNotes] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen || !currentShift) return null;

  const shiftStockItems = dailyPrepStock.filter((s) => s.shift_id === currentShift.id);
  const productName = (id: string) => products.find((p) => p.id === id)?.name || id;

  const countOf = (productId: string): number | null => {
    const v = physicalCounts[productId];
    if (v === undefined || v.trim() === '') return null;
    const n = parseInt(v, 10);
    return Number.isNaN(n) || n < 0 ? null : n;
  };
  const uncounted = shiftStockItems.filter((s) => countOf(s.product_id) === null);
  const stockDiffs = shiftStockItems
    .map((s) => ({ stock: s, diff: (countOf(s.product_id) ?? s.current_quantity) - s.current_quantity, counted: countOf(s.product_id) !== null }))
    .filter((d) => d.counted && d.diff !== 0);

  // Dinheiro do turno (salão + delivery entregue)
  const shiftPayments = payments.filter((p) => p.shift_id === currentShift.id);
  const salonCashTotal = shiftPayments.filter((p) => p.method === 'DINHEIRO').reduce((sum, p) => sum + p.amount, 0);
  const shiftDeliveries = deliveryOrders.filter((o) => o.shift_id === currentShift.id && o.status !== 'CANCELLED');
  const deliveryCashTotal = shiftDeliveries
    .filter((o) => o.payment_method === 'DINHEIRO' && o.status === 'DELIVERED')
    .reduce((sum, o) => sum + o.total, 0);
  const expectedCashDrawer = currentShift.cash_drawer_start + salonCashTotal + deliveryCashTotal;

  // Faturamento do turno
  const salonRevenue = shiftPayments.reduce((sum, p) => sum + p.amount, 0);
  const deliveryRevenue = shiftDeliveries
    .filter((o) => o.status === 'DELIVERED' || !!o.paid_at)
    .reduce((sum, o) => sum + o.total, 0);

  const countedCash = parseMoney(cashDrawerEnd);
  const cashDiscrepancy = countedCash === null ? null : Math.round((countedCash - expectedCashDrawer) * 100) / 100;
  const hasCashDifference = cashDiscrepancy !== null && cashDiscrepancy !== 0;

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const canAdvanceFromCash = countedCash !== null && (!hasCashDifference || differenceReason.trim().length > 0);

  const goNext = () => {
    setErrorMessage(null);
    if (step === 'STOCK_COUNT') setStep('CASH_DRAWER');
    else if (step === 'CASH_DRAWER') {
      if (countedCash === null) { setErrorMessage('Informe o dinheiro contado na gaveta.'); return; }
      if (hasCashDifference && !differenceReason.trim()) { setErrorMessage('Explique o motivo da diferença no caixa.'); return; }
      setStep('FINAL_CONFIRMATION');
    }
  };

  const handleFinishShift = () => {
    setErrorMessage(null);
    if (countedCash === null) { setStep('CASH_DRAWER'); setErrorMessage('Informe o dinheiro contado na gaveta.'); return; }
    if (hasCashDifference && !differenceReason.trim()) { setStep('CASH_DRAWER'); setErrorMessage('Explique o motivo da diferença no caixa.'); return; }
    setIsSubmitting(true);

    try {
      shiftStockItems.forEach((stock) => {
        const count = countOf(stock.product_id);
        if (count !== null) {
          adjustStockPhysicalCount(currentShift.id, stock.product_id, count, currentProfile.id, 'Conferência de fechamento de turno');
        }
      });

      const notes = [
        hasCashDifference ? `Diferença no caixa (${cashDiscrepancy! > 0 ? '+' : ''}${formatBRL(cashDiscrepancy!)}): ${differenceReason.trim()}` : '',
        closingNotes.trim(),
      ].filter(Boolean).join('\n');
      closeShift(notes, countedCash, currentProfile.id);

      setIsSubmitting(false);
      onShiftClosed?.();
      onClose();
    } catch (err) {
      setIsSubmitting(false);
      setErrorMessage((err as Error).message);
    }
  };

  const diffLabel = (v: number) => (v > 0 ? `Sobra de ${formatBRL(v)}` : `Falta de ${formatBRL(-v)}`);

  return (
    <Dialog label="Fechamento do turno" onClose={onClose}>
      <div className="dialog-panel bg-surface border border-line rounded-2xl w-full max-w-3xl shadow-card overflow-hidden flex flex-col max-h-[92vh] text-ink zoom-in-95 duration-200">

        <div className="p-4 sm:p-5 border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-brand-50 text-brand-700 flex items-center justify-center">
              <PackageCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-ink">Fechamento do turno</h2>
              <p className="text-sm text-ink-muted">{currentShift.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-surface-muted transition" aria-label="Fechar" type="button">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Passos lineares: só volta, não pula para frente */}
        <div className="grid grid-cols-3 border-b border-line text-sm font-semibold text-center">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = s.id === step;
            const reachable = i < stepIndex;
            return (
              <button
                key={s.id}
                onClick={() => reachable && setStep(s.id)}
                disabled={!reachable && !active}
                aria-current={active ? 'step' : undefined}
                className={`min-h-[48px] py-2 px-2 border-b-2 transition flex items-center justify-center gap-1.5 ${active
                  ? 'border-brand-500 text-brand-700 font-bold'
                  : reachable ? 'border-transparent text-ink-secondary hover:text-ink hover:bg-surface-muted' : 'border-transparent text-ink-muted opacity-60 cursor-not-allowed'}`}
                type="button">
                <Icon className="w-4 h-4 shrink-0" />
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>

        {errorMessage && (
          <div className="m-4 mb-0 p-3 bg-rose-50 border border-rose-200 rounded-md text-rose-800 text-sm flex items-center gap-2" role="alert">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 custom-scrollbar">

          {step === 'STOCK_COUNT' && (
            <div className="space-y-4">
              <p className="text-sm text-ink-secondary">
                Digite quantos espetos crus restaram no expositor e quantas porções há nas cubas. O sistema calcula as diferenças.
              </p>
              {uncounted.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-800 text-sm flex items-center gap-2" role="status">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{uncounted.length === 1 ? '1 produto ainda não foi contado.' : `${uncounted.length} produtos ainda não foram contados.`} Você pode seguir, mas eles ficam sem conferência.</span>
                </div>
              )}

              <div className="border border-line rounded-2xl overflow-x-auto">
                <table className="data-table w-full text-left text-sm">
                  <thead className="text-ink-muted font-semibold border-b border-line">
                    <tr>
                      <th className="p-3">Produto</th>
                      <th className="p-3 text-center">No sistema</th>
                      <th className="p-3 text-center">Contagem</th>
                      <th className="p-3 text-right">Diferença</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {shiftStockItems.map((stock) => {
                      const prod = products.find((p) => p.id === stock.product_id);
                      const count = countOf(stock.product_id);
                      const diff = count !== null ? count - stock.current_quantity : null;

                      return (
                        <tr key={stock.id} className={count === null ? 'bg-amber-50' : ''}>
                          <td className="p-3 font-semibold text-ink">
                            <div>{prod?.name || stock.product_id}</div>
                            <span className="text-[13px] font-normal text-ink-muted">{prod?.is_cubas ? 'Cuba' : 'Espeto'}</span>
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-ink">{stock.current_quantity}</td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="0"
                              inputMode="numeric"
                              value={physicalCounts[stock.product_id] ?? ''}
                              onChange={(e) => setPhysicalCounts((prev) => ({ ...prev, [stock.product_id]: e.target.value }))}
                              className="w-20 h-11 px-2 rounded-md bg-surface border border-line-strong text-ink font-mono text-center text-base focus:ring-1 focus:ring-brand-600 focus:outline-none"
                              aria-label={`Contagem de ${prod?.name || 'produto'}`} />
                          </td>
                          <td className="p-3 text-right font-mono font-bold">
                            {diff === null ? (
                              <span className="font-sans font-semibold text-amber-800">não contado</span>
                            ) : diff === 0 ? (
                              <span className="text-emerald-700">Exato</span>
                            ) : diff < 0 ? (
                              <span className="text-rose-700">{diff} (falta)</span>
                            ) : (
                              <span className="text-amber-800">+{diff} (sobra)</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 'CASH_DRAWER' && (
            <div className="space-y-4 max-w-lg mx-auto">
              <div className="p-4 rounded-2xl border border-line bg-surface-soft space-y-2.5 text-sm">
                <div className="flex justify-between items-center text-ink-secondary">
                  <span>Fundo de troco inicial</span>
                  <span className="font-mono font-bold text-ink">{formatBRL(currentShift.cash_drawer_start)}</span>
                </div>
                <div className="flex justify-between items-center text-ink-secondary">
                  <span>Vendas em dinheiro (salão)</span>
                  <span className="font-mono font-bold text-emerald-700">+{formatBRL(salonCashTotal)}</span>
                </div>
                <div className="flex justify-between items-center text-ink-secondary">
                  <span>Vendas em dinheiro (delivery)</span>
                  <span className="font-mono font-bold text-emerald-700">+{formatBRL(deliveryCashTotal)}</span>
                </div>
                <div className="pt-2.5 border-t border-line flex justify-between items-center font-bold">
                  <span className="text-ink">Esperado na gaveta</span>
                  <span className="font-mono text-brand-700 text-base">{formatBRL(expectedCashDrawer)}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="shift-close-cash" className="block text-sm font-semibold text-ink">Dinheiro contado na gaveta</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-muted font-mono font-bold">R$</span>
                  <input
                    id="shift-close-cash"
                    type="text"
                    value={cashDrawerEnd}
                    onChange={(e) => setCashDrawerEnd(e.target.value)}
                    placeholder="0,00"
                    required
                    className="w-full h-12 pl-10 pr-3 rounded-md bg-surface border border-line-strong text-ink font-mono text-base font-bold focus:ring-2 focus:ring-brand-600 focus:outline-none"
                    inputMode="decimal" />
                </div>
                {cashDiscrepancy !== null && (
                  <div className={`text-sm font-bold pt-1 ${cashDiscrepancy === 0 ? 'text-emerald-700' : cashDiscrepancy < 0 ? 'text-rose-700' : 'text-amber-800'}`}>
                    {cashDiscrepancy === 0 ? 'Caixa bateu com o esperado.' : `${diffLabel(cashDiscrepancy)} no caixa.`}
                  </div>
                )}
              </div>

              {hasCashDifference && (
                <div className="space-y-1.5">
                  <label htmlFor="shift-close-reason" className="block text-sm font-semibold text-ink">Motivo da diferença</label>
                  <textarea
                    id="shift-close-reason"
                    rows={2}
                    required
                    value={differenceReason}
                    onChange={(e) => setDifferenceReason(e.target.value)}
                    placeholder="Ex.: troco dado a mais, sangria sem registro..."
                    className="w-full p-3 rounded-md bg-surface border border-line-strong text-ink text-base focus:outline-none focus:ring-1 focus:ring-brand-600" />
                </div>
              )}
            </div>
          )}

          {step === 'FINAL_CONFIRMATION' && (
            <div className="space-y-4 max-w-xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-2xl border border-line bg-surface-soft">
                  <p className="text-sm text-ink-muted">Faturamento do turno</p>
                  <p className="mt-1 font-mono text-lg font-bold text-ink">{formatBRL(salonRevenue + deliveryRevenue)}</p>
                  <p className="text-[13px] text-ink-muted">Salão {formatBRL(salonRevenue)} · Delivery {formatBRL(deliveryRevenue)}</p>
                </div>
                <div className="p-3.5 rounded-2xl border border-line bg-surface-soft">
                  <p className="text-sm text-ink-muted">Dinheiro esperado</p>
                  <p className="mt-1 font-mono text-lg font-bold text-ink">{formatBRL(expectedCashDrawer)}</p>
                  <p className="text-[13px] text-ink-muted">Contado {countedCash === null ? '—' : formatBRL(countedCash)}</p>
                </div>
                <div className="p-3.5 rounded-2xl border border-line bg-surface-soft">
                  <p className="text-sm text-ink-muted">Diferença no caixa</p>
                  <p className={`mt-1 font-mono text-lg font-bold ${!hasCashDifference ? 'text-emerald-700' : cashDiscrepancy! < 0 ? 'text-rose-700' : 'text-amber-800'}`}>
                    {cashDiscrepancy === null ? '—' : cashDiscrepancy === 0 ? 'R$ 0,00' : `${cashDiscrepancy > 0 ? '+' : ''}${formatBRL(cashDiscrepancy)}`}
                  </p>
                  {hasCashDifference && <p className="text-[13px] text-ink-muted line-clamp-2">{differenceReason}</p>}
                </div>
              </div>

              <div className="rounded-2xl border border-line">
                <h3 className="px-4 pt-3 text-sm font-bold text-ink">Diferenças de estoque</h3>
                {stockDiffs.length === 0 ? (
                  <p className="px-4 pb-3 pt-1 text-sm text-ink-muted">Nenhuma diferença nos produtos contados.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {stockDiffs.map(({ stock, diff }) => (
                      <li key={stock.id} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
                        <span className="text-ink">{productName(stock.product_id)}</span>
                        <span className={`font-mono font-bold ${diff < 0 ? 'text-rose-700' : 'text-amber-800'}`}>{diff > 0 ? `+${diff}` : diff}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {uncounted.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <p className="font-bold">Não contados ({uncounted.length})</p>
                  <p className="mt-0.5">{uncounted.map((s) => productName(s.product_id)).join(', ')}</p>
                </div>
              )}

              <p className="text-sm text-ink-secondary">
                Ao encerrar, estoque e caixa ficam consolidados. Nenhuma comanda ou pedido novo pode ser lançado até abrir outro turno.
              </p>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-ink" htmlFor="shift-close-notes">Observações de encerramento (opcional)</label>
                <textarea
                  id="shift-close-notes"
                  rows={3}
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  placeholder="Ex.: chuva reduziu o movimento depois das 23h, 2 espetos queimaram..."
                  className="w-full p-3 rounded-md bg-surface border border-line-strong text-ink text-base placeholder-ink-muted focus:outline-none focus:ring-1 focus:ring-brand-600" />
              </div>
            </div>
          )}

        </div>

        <div className="p-4 border-t border-line flex items-center justify-between flex-wrap gap-3">
          {step !== 'STOCK_COUNT' ? (
            <button
              onClick={() => { setErrorMessage(null); setStep(STEPS[Math.max(0, stepIndex - 1)]!.id); }}
              className="btn-secondary h-12 px-4 text-[15px] font-semibold rounded-md flex items-center gap-1.5"
              type="button">
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar</span>
            </button>
          ) : <div />}

          {step !== 'FINAL_CONFIRMATION' ? (
            <button
              onClick={goNext}
              disabled={step === 'CASH_DRAWER' && !canAdvanceFromCash}
              className="btn-primary h-12 px-5 text-[15px] font-semibold flex items-center gap-1.5 rounded-md disabled:opacity-50"
              type="button">
              <span>Avançar</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinishShift}
              disabled={isSubmitting}
              className="btn-danger h-12 px-5 text-[15px] font-semibold flex items-center gap-2 rounded-md disabled:opacity-50"
              type="button">
              <CheckCheck className="w-4 h-4" />
              <span>{isSubmitting ? 'Encerrando...' : 'Encerrar turno'}</span>
            </button>
          )}
        </div>

      </div>
    </Dialog>
  );
};
