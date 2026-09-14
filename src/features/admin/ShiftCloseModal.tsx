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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Cabeçalho do Modal */}
        <div className="bg-slate-950 p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-600/20 border border-rose-500/40 text-rose-400 flex items-center justify-center">
              <PackageCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">
                Fechamento do Turno da Noite
              </h2>
              <p className="text-xs text-slate-400">
                {currentShift.name} • Reconciliação Física vs Teórica
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Indicador de Passos */}
        <div className="grid grid-cols-3 bg-slate-950/60 border-b border-slate-800 text-xs font-semibold text-center">
          <button
            onClick={() => setStep('STOCK_COUNT')}
            className={`py-2.5 px-3 border-b-2 transition flex items-center justify-center gap-1.5 ${
              step === 'STOCK_COUNT'
                ? 'border-rose-500 text-white bg-slate-900/80 font-bold'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <PackageCheck className="w-4 h-4" />
            <span>1. Estoque Físico</span>
          </button>
          <button
            onClick={() => setStep('CASH_DRAWER')}
            className={`py-2.5 px-3 border-b-2 transition flex items-center justify-center gap-1.5 ${
              step === 'CASH_DRAWER'
                ? 'border-rose-500 text-white bg-slate-900/80 font-bold'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Banknote className="w-4 h-4" />
            <span>2. Gaveta do Caixa</span>
          </button>
          <button
            onClick={() => setStep('FINAL_CONFIRMATION')}
            className={`py-2.5 px-3 border-b-2 transition flex items-center justify-center gap-1.5 ${
              step === 'FINAL_CONFIRMATION'
                ? 'border-rose-500 text-white bg-slate-900/80 font-bold'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>3. Resumo & Fechar</span>
          </button>
        </div>

        {/* Mensagem de Erro */}
        {errorMessage && (
          <div className="m-4 p-3 bg-rose-950/60 border border-rose-700/80 rounded-xl text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Conteúdo do Passo Ativo */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          
          {/* PASSO 1: CONFERÊNCIA FÍSICA DO ESTOQUE */}
          {step === 'STOCK_COUNT' && (
            <div className="space-y-4">
              <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800 text-xs text-slate-300">
                <span className="font-bold text-amber-400">Instruções de Conferência: </span>
                Digite a quantidade física real de espetos crus que restaram no expositor/freezer e as porções nas cubas. O sistema calculará divergências e quebras de turno automaticamente.
              </div>

              <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/90 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="p-3">Produto / Corte</th>
                      <th className="p-3 text-center">Teórico</th>
                      <th className="p-3 text-center">Contagem Física</th>
                      <th className="p-3 text-right">Diferença</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {shiftStockItems.map((stock) => {
                      const prod = products.find((p) => p.id === stock.product_id);
                      const inputCount = physicalCounts[stock.product_id];
                      const numInput = inputCount !== undefined && inputCount !== '' ? parseInt(inputCount, 10) : null;
                      const diff = numInput !== null ? numInput - stock.current_quantity : null;

                      return (
                        <tr key={stock.id} className="hover:bg-slate-900/40 transition">
                          <td className="p-3 font-semibold text-white">
                            <div>{prod?.name || stock.product_id}</div>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {prod?.is_cubas ? 'Cuba Gastronômica' : 'Espeto na Brasa'}
                            </span>
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-slate-300">
                            {stock.current_quantity} un
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="0"
                              placeholder={String(stock.current_quantity)}
                              value={inputCount ?? ''}
                              onChange={(e) => handlePhysicalCountChange(stock.product_id, e.target.value)}
                              className="w-20 px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-center text-xs focus:ring-1 focus:ring-rose-500 focus:outline-none"
                            />
                          </td>
                          <td className="p-3 text-right font-mono font-bold">
                            {diff === null ? (
                              <span className="text-slate-500">—</span>
                            ) : diff === 0 ? (
                              <span className="text-emerald-400">Exato (0)</span>
                            ) : diff < 0 ? (
                              <span className="text-rose-400">{diff} un (Falta)</span>
                            ) : (
                              <span className="text-amber-400">+{diff} un (Sobra)</span>
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
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex justify-between items-center text-xs text-slate-400">
                  <span>Fundo de Caixa Inicial (Abertura):</span>
                  <span className="font-mono font-bold text-white">
                    {formatBRL(currentShift.cash_drawer_start)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs text-slate-400">
                  <span>Vendas em Dinheiro (Salão):</span>
                  <span className="font-mono font-bold text-emerald-400">
                    +{formatBRL(salonCashTotal)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs text-slate-400">
                  <span>Vendas em Dinheiro (Delivery):</span>
                  <span className="font-mono font-bold text-emerald-400">
                    +{formatBRL(deliveryCashTotal)}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-sm font-bold">
                  <span className="text-slate-300">Total Esperado na Gaveta:</span>
                  <span className="font-mono text-amber-400 text-base">
                    {formatBRL(expectedCashDrawer)}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Valor em Dinheiro Contado Fisicamente no Fechamento:
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-mono font-bold">
                    R$
                  </span>
                  <input
                    type="text"
                    value={cashDrawerEnd}
                    onChange={(e) => setCashDrawerEnd(e.target.value)}
                    placeholder={expectedCashDrawer.toFixed(2)}
                    className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm font-bold focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  />
                </div>
                {cashDrawerEnd && (
                  <div className={`text-xs font-mono font-bold pt-1 ${
                    cashDiscrepancy === 0
                      ? 'text-emerald-400'
                      : cashDiscrepancy < 0
                      ? 'text-rose-400'
                      : 'text-amber-400'
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
              <div className="bg-amber-950/30 border border-amber-500/40 p-4 rounded-2xl text-xs text-amber-300 space-y-1.5">
                <div className="font-black flex items-center gap-1.5 uppercase tracking-wide">
                  <AlertTriangle className="w-4 h-4" />
                  Atenção ao Encerramento Definitivo
                </div>
                <p>
                  Ao encerrar este turno, todas as movimentações de estoque físico e caixa serão consolidadas. Nenhuma nova comanda ou pedido poderá ser lançado até a abertura de um próximo turno.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Observações de Encerramento (opcional):
                </label>
                <textarea
                  rows={3}
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  placeholder="Ex: Turno movimentado, chuva reduziu movimento após as 23h, 2 espetos queimaram na grelha..."
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
              </div>
            </div>
          )}

        </div>

        {/* Rodapé com Navegação dos Passos */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          {step !== 'STOCK_COUNT' ? (
            <button
              onClick={() => setStep(step === 'FINAL_CONFIRMATION' ? 'CASH_DRAWER' : 'STOCK_COUNT')}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar</span>
            </button>
          ) : <div />}

          {step !== 'FINAL_CONFIRMATION' ? (
            <button
              onClick={() => setStep(step === 'STOCK_COUNT' ? 'CASH_DRAWER' : 'FINAL_CONFIRMATION')}
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-md shadow-rose-950/50"
            >
              <span>Avançar</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinishShift}
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 transition active:scale-95 shadow-lg shadow-rose-950/60 disabled:opacity-50"
            >
              <CheckCheck className="w-4 h-4" />
              <span>{isSubmitting ? 'Encerrando...' : 'Encerrar Turno Definitivamente'}</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
