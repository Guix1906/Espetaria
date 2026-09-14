import { Dialog } from '../../components/ui/Dialog';
import React, { useState } from 'react';
import { 
  X, 
  PackageCheck, 
  Banknote, 
  FileText, 
  CheckCheck, 
  AlertTriangle, 
  ArrowRight, 
  ArrowLeft 
} from 'lucide-react';
import { useShiftStore } from '../../stores/useShiftStore';
import { useStockStore } from '../../stores/useStockStore';
import { useTableStore } from '../../stores/useTableStore';
import { useDeliveryStore } from '../../stores/useDeliveryStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { formatBRL } from '../../lib/formatters';

interface ShiftCloseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShiftClosed?: () => void;
}

type Step = 'STOCK_COUNT' | 'CASH_DRAWER' | 'FINAL_CONFIRMATION';

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
  const [closingNotes, setClosingNotes] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen || !currentShift) return null;

  // Produtos do turno atual
  const shiftStockItems = dailyPrepStock.filter((s) => s.shift_id === currentShift.id);

  // Total de vendas em dinheiro deste turno (Salão + Delivery)
  const salonCashPayments = payments.filter((p) => p.shift_id === currentShift.id && p.method === 'DINHEIRO');
  const salonCashTotal = salonCashPayments.reduce((sum, p) => sum + p.amount, 0);

  const deliveryCashOrders = deliveryOrders.filter(
    (o) => o.shift_id === currentShift.id && o.payment_method === 'DINHEIRO' && o.status === 'DELIVERED'
  );
  const deliveryCashTotal = deliveryCashOrders.reduce((sum, o) => sum + o.total, 0);

  const totalCashSales = salonCashTotal + deliveryCashTotal;
  const expectedCashDrawer = currentShift.cash_drawer_start + totalCashSales;

  const handlePhysicalCountChange = (productId: string, val: string) => {
    setPhysicalCounts((prev) => ({
      ...prev,
      [productId]: val,
    }));
  };

  const handleFinishShift = () => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      // 1. Aplica contagens físicas informadas e registra ajustes/divergências no estoque
      shiftStockItems.forEach((stock) => {
        const inputVal = physicalCounts[stock.product_id];
        if (inputVal !== undefined && inputVal.trim() !== '') {
          const count = parseInt(inputVal, 10);
          if (!isNaN(count) && count >= 0) {
            adjustStockPhysicalCount(
              currentShift.id,
              stock.product_id,
              count,
              currentProfile.id,
              'Conferência de Fechamento de Turno'
            );
          }
        }
      });

      // 2. Registra o fechamento financeiro do gaveteiro
      const finalCash = parseFloat(cashDrawerEnd.replace(',', '.')) || expectedCashDrawer;
      closeShift(closingNotes, finalCash, currentProfile.id);

      setIsSubmitting(false);
      onShiftClosed?.();
      onClose();
    } catch (err) {
      setIsSubmitting(false);
      setErrorMessage((err as Error).message);
    }
  };

  const cashDiscrepancy = cashDrawerEnd
    ? (parseFloat(cashDrawerEnd.replace(',', '.')) || 0) - expectedCashDrawer
    : 0;

  return (
    <Dialog label="Conferência e fechamento do turno" onClose={onClose}>
      <div className="dialog-panel bg-surface-muted border border-line rounded-2xl w-full max-w-3xl shadow-card overflow-hidden flex flex-col max-h-[92vh] text-ink zoom-in-95 duration-200">
        
        {/* Cabeçalho do Modal */}
        <div className="bg-surface-muted p-4 sm:p-5 border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-50 border border-red-200 text-red-700 flex items-center justify-center shadow-sm">
              <PackageCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-ink tracking-tight font-sans">
                Fechamento do Turno da Noite
              </h2>
              <p className="text-xs text-ink-muted tabular-nums">
                {currentShift.name} • Reconciliação Física vs Teórica
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-surface-muted transition"
            aria-label="Fechar modal"
           type="button">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Indicador de Passos */}
        <div className="grid grid-cols-3 bg-surface-muted border-b border-line text-xs font-semibold text-center">
          <button
            onClick={() => setStep('STOCK_COUNT')}
            className={`py-3 px-3 border-b-2 transition flex items-center justify-center gap-1.5 ${
              step === 'STOCK_COUNT'
                ? 'border-brand-400 text-brand-700 bg-surface-muted font-bold'
                : 'border-transparent text-ink-muted hover:text-ink hover:bg-surface-muted'
            }`}
           type="button">
            <PackageCheck className="w-4 h-4" />
            <span>1. Estoque Físico</span>
          </button>
          <button
            onClick={() => setStep('CASH_DRAWER')}
            className={`py-3 px-3 border-b-2 transition flex items-center justify-center gap-1.5 ${
              step === 'CASH_DRAWER'
                ? 'border-brand-400 text-brand-700 bg-surface-muted font-bold'
                : 'border-transparent text-ink-muted hover:text-ink hover:bg-surface-muted'
            }`}
           type="button">
            <Banknote className="w-4 h-4" />
            <span>2. Gaveta do Caixa</span>
          </button>
          <button
            onClick={() => setStep('FINAL_CONFIRMATION')}
            className={`py-3 px-3 border-b-2 transition flex items-center justify-center gap-1.5 ${
              step === 'FINAL_CONFIRMATION'
                ? 'border-brand-400 text-brand-700 bg-surface-muted font-bold'
                : 'border-transparent text-ink-muted hover:text-ink hover:bg-surface-muted'
            }`}
           type="button">
            <FileText className="w-4 h-4" />
            <span>3. Resumo & Fechar</span>
          </button>
        </div>

        {/* Mensagem de Erro */}
        {errorMessage && (
          <div className="m-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2" role="alert">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-700" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Conteúdo do Passo Ativo */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 custom-scrollbar">
          
          {/* PASSO 1: CONFERÊNCIA FÍSICA DO ESTOQUE */}
          {step === 'STOCK_COUNT' && (
            <div className="space-y-4">
              <div className="bg-surface-muted p-3.5 rounded-2xl border border-line text-xs text-ink-muted">
                <span className="font-bold text-ink">Instruções de Conferência: </span>
                Digite a quantidade física real de espetos crus que restaram no expositor/freezer e as porções nas cubas. O sistema calculará divergências e quebras de turno automaticamente.
              </div>

              <div className="border border-line rounded-2xl overflow-x-auto bg-surface-muted shadow-sm">
                <table className="data-table w-full text-left text-xs">
                  <thead className="bg-surface-muted text-ink-muted font-bold text-xs border-b border-line">
                    <tr>
                      <th className="p-3">Produto / Corte</th>
                      <th className="p-3 text-center">Teórico</th>
                      <th className="p-3 text-center">Contagem Física</th>
                      <th className="p-3 text-right">Diferença</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {shiftStockItems.map((stock) => {
                      const prod = products.find((p) => p.id === stock.product_id);
                      const inputCount = physicalCounts[stock.product_id];
                      const numInput = inputCount !== undefined && inputCount !== '' ? parseInt(inputCount, 10) : null;
                      const diff = numInput !== null ? numInput - stock.current_quantity : null;

                      return (
                        <tr key={stock.id} className="hover:bg-surface-muted transition">
                          <td className="p-3 font-semibold text-ink">
                            <div>{prod?.name || stock.product_id}</div>
                            <span className="text-xs text-ink-muted tabular-nums">
                              {prod?.is_cubas ? 'Cuba Gastronômica' : 'Espeto na Brasa'}
                            </span>
                          </td>
                          <td className="p-3 text-center tabular-nums font-bold text-ink">
                            {stock.current_quantity} un
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="0"
                              placeholder={String(stock.current_quantity)}
                              value={inputCount ?? ''}
                              onChange={(e) => handlePhysicalCountChange(stock.product_id, e.target.value)}
                              className="w-20 px-2.5 py-1.5 rounded-xl bg-surface-muted border border-line text-ink tabular-nums text-center text-xs focus:ring-1 focus:ring-brand-600 focus:outline-none"
                             aria-label="Contagem física do produto"/>
                          </td>
                          <td className="p-3 text-right tabular-nums font-bold">
                            {diff === null ? (
                              <span className="text-ink-muted">—</span>
                            ) : diff === 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Exato (0)
                              </span>
                            ) : diff < 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700 border border-red-200">
                                {diff} un (Falta)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-800 border border-amber-200">
                                +{diff} un (Sobra)
                              </span>
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

          {/* PASSO 2: CONFERÊNCIA DE GAVETA DE CAIXA */}
          {step === 'CASH_DRAWER' && (
            <div className="space-y-4 max-w-lg mx-auto">
              <div className="bg-surface-muted p-5 rounded-2xl border border-line space-y-3 shadow-sm">
                <div className="flex justify-between items-center text-xs text-ink-muted">
                  <span>Fundo de Caixa Inicial (Abertura):</span>
                  <span className="tabular-nums font-bold text-ink">
                    {formatBRL(currentShift.cash_drawer_start)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs text-ink-muted">
                  <span>Vendas em Dinheiro (Salão):</span>
                  <span className="tabular-nums font-bold text-emerald-700">
                    +{formatBRL(salonCashTotal)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs text-ink-muted">
                  <span>Vendas em Dinheiro (Delivery):</span>
                  <span className="tabular-nums font-bold text-emerald-700">
                    +{formatBRL(deliveryCashTotal)}
                  </span>
                </div>
                <div className="pt-3 border-t border-line flex justify-between items-center text-sm font-bold">
                  <span className="text-ink">Total Esperado na Gaveta:</span>
                  <span className="tabular-nums text-brand-700 text-base font-bold">
                    {formatBRL(expectedCashDrawer)}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink">
                  Valor em Dinheiro Contado Fisicamente no Fechamento:
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-xs text-ink-muted tabular-nums font-bold">
                    R$
                  </span>
                  <input
                    type="text"
                    value={cashDrawerEnd}
                    onChange={(e) => setCashDrawerEnd(e.target.value)}
                    placeholder={expectedCashDrawer.toFixed(2)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-surface-muted border border-line text-ink tabular-nums text-sm font-bold focus:ring-2 focus:ring-brand-600 focus:outline-none"
                   aria-label="Dinheiro contado no fechamento" inputMode="decimal"/>
                </div>
                {cashDrawerEnd && (
                  <div className={`text-xs tabular-nums font-bold pt-1.5 ${
                    cashDiscrepancy === 0
                      ? 'text-emerald-700'
                      : cashDiscrepancy < 0
                      ? 'text-red-700'
                      : 'text-amber-800'
                  }`}>
                    {cashDiscrepancy === 0
                      ? '✅ Caixa fechou com valor exato!'
                      : cashDiscrepancy < 0
                      ? `⚠️ Falta no caixa: ${formatBRL(cashDiscrepancy)}`
                      : `ℹ️ Sobra no caixa: +${formatBRL(cashDiscrepancy)}`}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PASSO 3: NOTAS FINAIS & ENCERRAMENTO */}
          {step === 'FINAL_CONFIRMATION' && (
            <div className="space-y-4 max-w-xl mx-auto">
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl text-xs text-amber-800 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-800" />
                  Atenção ao Encerramento Definitivo
                </div>
                <p className="text-ink-muted">
                  Ao encerrar este turno, todas as movimentações de estoque físico e caixa serão consolidadas. Nenhuma nova comanda ou pedido poderá ser lançado até a abertura de um próximo turno.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink" htmlFor="shiftclosemodal-field-1">
                  Observações de Encerramento (opcional):
                </label>
                <textarea
                  rows={3}
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  placeholder="Ex: Turno movimentado, chuva reduziu movimento após as 23h, 2 espetos queimaram na grelha..."
                  className="w-full p-3 rounded-xl bg-surface-muted border border-line text-ink text-xs placeholder-ink-muted focus:outline-none focus:ring-1 focus:ring-brand-600"
                 aria-label="Observações de Encerramento (opcional):" id="shiftclosemodal-field-1"/>
              </div>
            </div>
          )}

        </div>

        {/* Rodapé com Navegação dos Passos */}
        <div className="p-4 bg-surface-muted border-t border-line flex items-center justify-between">
          {step !== 'STOCK_COUNT' ? (
            <button
              onClick={() => setStep(step === 'FINAL_CONFIRMATION' ? 'CASH_DRAWER' : 'STOCK_COUNT')}
              className="bg-surface-muted hover:bg-surface-muted text-ink border border-line px-4 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition"
             type="button">
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar</span>
            </button>
          ) : <div />}

          {step !== 'FINAL_CONFIRMATION' ? (
            <button
              onClick={() => setStep(step === 'STOCK_COUNT' ? 'CASH_DRAWER' : 'FINAL_CONFIRMATION')}
              className="btn-primary px-5 py-2.5 text-xs font-bold flex items-center gap-1.5 shadow-sm text-white rounded-xl"
             type="button">
              <span>Avançar</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinishShift}
              disabled={isSubmitting}
              className="btn-ruby px-6 py-2.5 text-xs font-bold flex items-center gap-2 shadow-sm text-ink rounded-xl disabled:opacity-50"
             type="button">
              <CheckCheck className="w-4 h-4" />
              <span>{isSubmitting ? 'Encerrando...' : 'Encerrar Turno Definitivamente'}</span>
            </button>
          )}
        </div>

      </div>
    </Dialog>
  );
};
