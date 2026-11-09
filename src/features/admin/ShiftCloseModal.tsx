import {
  AlertTriangle,
  Banknote,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  PackageCheck,
  X,
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

/** Aceita "1.234,56", "1234,56" ou "1234.56". Vazio ou inválido = null. */
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

  const [cashDrawerEnd, setCashDrawerEnd] = useState<string>('');
  const [differenceReason, setDifferenceReason] = useState<string>('');
  const [closingNotes, setClosingNotes] = useState<string>('');
  const [physicalCounts, setPhysicalCounts] = useState<Record<string, string>>({});
  const [showStockSection, setShowStockSection] = useState<boolean>(false);
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

  // Dinheiro do turno (salão + delivery entregue)
  const shiftPayments = payments.filter((p) => p.shift_id === currentShift.id);
  const salonCashTotal = shiftPayments.filter((p) => p.method === 'DINHEIRO').reduce((sum, p) => sum + p.amount, 0);
  const shiftDeliveries = deliveryOrders.filter((o) => o.shift_id === currentShift.id && o.status !== 'CANCELLED');
  const deliveryCashTotal = shiftDeliveries
    .filter((o) => o.payment_method === 'DINHEIRO' && o.status === 'DELIVERED')
    .reduce((sum, o) => sum + o.total, 0);
  const expectedCashDrawer = currentShift.cash_drawer_start + salonCashTotal + deliveryCashTotal;

  // Faturamento total do turno
  const salonRevenue = shiftPayments.reduce((sum, p) => sum + p.amount, 0);
  const deliveryRevenue = shiftDeliveries
    .filter((o) => o.status === 'DELIVERED' || !!o.paid_at)
    .reduce((sum, o) => sum + o.total, 0);
  const totalRevenue = salonRevenue + deliveryRevenue;

  const countedCash = parseMoney(cashDrawerEnd);
  const cashDiscrepancy = countedCash === null ? null : Math.round((countedCash - expectedCashDrawer) * 100) / 100;
  const hasCashDifference = cashDiscrepancy !== null && cashDiscrepancy !== 0;

  const handleFinishShift = () => {
    setErrorMessage(null);
    if (countedCash === null) {
      setErrorMessage('Informe o valor em dinheiro contado na gaveta.');
      return;
    }
    if (hasCashDifference && !differenceReason.trim()) {
      setErrorMessage('Por favor, informe uma justificativa rápida para a diferença no caixa.');
      return;
    }
    setIsSubmitting(true);

    try {
      // Ajusta contagens físicas se foram preenchidas
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

  return (
    <Dialog label="Fechamento do turno" onClose={onClose}>
      <div className="dialog-panel bg-surface border border-line rounded-2xl w-full max-w-2xl shadow-card overflow-hidden flex flex-col max-h-[92vh] text-ink zoom-in-95 duration-200">

        {/* Cabeçalho */}
        <div className="p-4 sm:p-5 border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-ink">Fechamento do turno</h2>
              <p className="text-xs sm:text-sm text-ink-muted">{currentShift.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-surface-muted transition"
            aria-label="Fechar"
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="m-4 mb-0 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm flex items-center gap-2" role="alert">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5 custom-scrollbar">

          {/* Cards de Resumo Rápido do Turno */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl border border-line bg-surface-soft">
              <p className="text-xs text-ink-muted font-medium">Faturamento Total</p>
              <p className="mt-0.5 font-mono text-lg font-bold text-ink">{formatBRL(totalRevenue)}</p>
              <p className="text-[11px] text-ink-muted truncate">Salão {formatBRL(salonRevenue)} · Delivery {formatBRL(deliveryRevenue)}</p>
            </div>
            <div className="p-3.5 rounded-xl border border-line bg-surface-soft">
              <p className="text-xs text-ink-muted font-medium">Dinheiro Esperado</p>
              <p className="mt-0.5 font-mono text-lg font-bold text-brand-700">{formatBRL(expectedCashDrawer)}</p>
              <p className="text-[11px] text-ink-muted truncate">Fundo {formatBRL(currentShift.cash_drawer_start)} + Vendas {formatBRL(salonCashTotal + deliveryCashTotal)}</p>
            </div>
          </div>

          {/* Seção Principal: Conferência do Caixa */}
          <div className="p-4 sm:p-5 rounded-2xl border-2 border-brand-200 bg-brand-50/30 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm sm:text-base text-ink flex items-center gap-2">
                  <Banknote className="w-5 h-5 text-brand-700" />
                  <span>Dinheiro contado na gaveta</span>
                </h3>
                <p className="text-xs text-ink-secondary mt-0.5">
                  Conte as notas e moedas físicas presentes na gaveta do caixa.
                </p>
              </div>
            </div>

            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-muted font-mono font-bold">R$</span>
              <input
                id="shift-close-cash"
                type="text"
                autoFocus
                value={cashDrawerEnd}
                onChange={(e) => setCashDrawerEnd(e.target.value)}
                placeholder="0,00"
                className="w-full h-13 pl-10 pr-4 rounded-xl bg-white border-2 border-brand-300 text-ink font-mono text-lg font-bold focus:ring-2 focus:ring-brand-600 focus:border-brand-600 focus:outline-none shadow-xs"
                inputMode="decimal"
              />
            </div>

            {/* Status da Conferência */}
            {cashDiscrepancy !== null && (
              <div className={`p-3 rounded-xl border flex items-center justify-between text-xs sm:text-sm font-bold ${
                cashDiscrepancy === 0
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : cashDiscrepancy < 0
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}>
                <div className="flex items-center gap-2">
                  {cashDiscrepancy === 0 ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  )}
                  <span>
                    {cashDiscrepancy === 0
                      ? 'Caixa exato! Bateu com o esperado.'
                      : cashDiscrepancy < 0
                      ? `Falta de ${formatBRL(-cashDiscrepancy)} no caixa.`
                      : `Sobra de ${formatBRL(cashDiscrepancy)} no caixa.`}
                  </span>
                </div>
                <span className="font-mono text-xs opacity-80">Esperado: {formatBRL(expectedCashDrawer)}</span>
              </div>
            )}

            {/* Justificativa caso haja diferença */}
            {hasCashDifference && (
              <div className="space-y-1.5 pt-1">
                <label htmlFor="shift-close-reason" className="block text-xs font-bold text-ink">
                  Justificativa da diferença <span className="text-rose-600">*</span>
                </label>
                <input
                  id="shift-close-reason"
                  type="text"
                  value={differenceReason}
                  onChange={(e) => setDifferenceReason(e.target.value)}
                  placeholder="Ex.: Troco a mais, despesa rápida de padaria paga no caixa..."
                  className="w-full h-10 px-3 rounded-lg bg-white border border-line-strong text-ink text-sm focus:outline-none focus:ring-1 focus:ring-brand-600"
                />
              </div>
            )}
          </div>

          {/* Observações Opcionais do Fechamento */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-ink-secondary" htmlFor="shift-close-notes">
              Observações do turno (opcional)
            </label>
            <input
              id="shift-close-notes"
              type="text"
              value={closingNotes}
              onChange={(e) => setClosingNotes(e.target.value)}
              placeholder="Ex.: Noite movimentada, chuva forte às 22h..."
              className="w-full h-10 px-3 rounded-lg bg-surface border border-line text-ink text-sm placeholder-ink-muted focus:outline-none focus:ring-1 focus:ring-brand-600"
            />
          </div>

          {/* Seção Retrátil Opcional: Estoque Físico */}
          {shiftStockItems.length > 0 && (
            <div className="rounded-xl border border-line bg-surface overflow-hidden">
              <button
                type="button"
                onClick={() => setShowStockSection(!showStockSection)}
                className="w-full p-3.5 flex items-center justify-between text-left hover:bg-surface-muted transition"
              >
                <div className="flex items-center gap-2">
                  <PackageCheck className="w-4 h-4 text-ink-muted" />
                  <span className="text-xs sm:text-sm font-semibold text-ink">
                    Conferir sobra de espetos no estoque (Opcional)
                  </span>
                </div>
                {showStockSection ? (
                  <ChevronUp className="w-4 h-4 text-ink-muted" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-ink-muted" />
                )}
              </button>

              {showStockSection && (
                <div className="p-3 border-t border-line space-y-3 bg-surface-soft">
                  <p className="text-xs text-ink-muted">
                    Preencha apenas se quiser atualizar o saldo final de cada espeto no sistema. Se deixar em branco, o sistema mantém as quantidades atuais.
                  </p>
                  <div className="max-h-60 overflow-y-auto rounded-lg border border-line bg-surface">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-surface-soft border-b border-line text-ink-muted font-semibold">
                        <tr>
                          <th className="p-2">Item</th>
                          <th className="p-2 text-center">Sistema</th>
                          <th className="p-2 text-center">Contado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {shiftStockItems.map((stock) => (
                          <tr key={stock.id}>
                            <td className="p-2 font-medium text-ink">{productName(stock.product_id)}</td>
                            <td className="p-2 text-center font-mono text-ink-muted">{stock.current_quantity}</td>
                            <td className="p-2 text-center">
                              <input
                                type="number"
                                min="0"
                                value={physicalCounts[stock.product_id] ?? ''}
                                onChange={(e) => setPhysicalCounts((prev) => ({ ...prev, [stock.product_id]: e.target.value }))}
                                placeholder="—"
                                className="w-16 h-7 text-center rounded border border-line font-mono text-xs focus:ring-1 focus:ring-brand-600 focus:outline-none"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Rodapé com Ações */}
        <div className="p-4 border-t border-line flex items-center justify-between gap-3 bg-surface">
          <button
            onClick={onClose}
            className="btn-secondary h-11 px-4 text-sm font-semibold rounded-xl"
            type="button"
          >
            Voltar
          </button>

          <button
            onClick={handleFinishShift}
            disabled={isSubmitting || countedCash === null || (hasCashDifference && !differenceReason.trim())}
            className="btn-danger h-11 px-6 text-sm font-bold flex items-center gap-2 rounded-xl disabled:opacity-50 shadow-xs"
            type="button"
          >
            <CheckCheck className="w-4 h-4" />
            <span>{isSubmitting ? 'Encerrando...' : 'Encerrar Turno'}</span>
          </button>
        </div>

      </div>
    </Dialog>
  );
};
