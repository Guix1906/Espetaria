import {
  AlertCircle,
  Banknote,
  CheckCheck,
  Coins,
  CreditCard,
  Percent,
  Plus,
  QrCode,
  Receipt,
  Trash2,
  Users,
  X
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Dialog } from '../../components/ui/Dialog';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { formatBRL, formatDoneness, getOrderItemStatusConfig } from '../../lib/formatters';
import { useAuthStore } from '../../stores/useAuthStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useTableStore } from '../../stores/useTableStore';
import { OrderItem, Payment, RestaurantTable, Tab } from '../../types/domain';
import { PaymentMethod } from '../../types/enums';
import { PixPaymentModal } from '../pix/PixPaymentModal';
import { ReceiptModal } from './ReceiptModal';

interface TableSettlementModalProps {
  table: RestaurantTable;
  isOpen: boolean;
  onClose: () => void;
}

export const TableSettlementModal: React.FC<TableSettlementModalProps> = ({
  table,
  isOpen,
  onClose,
}) => {
  const { requestText, notify } = useFeedback();
  const {
    tabs,
    getTabOrderItems,
    getTabPayments,
    updateTabBillAdjustments,
    addPaymentAtomic,
    removePayment,
    cancelOrderItemAtomic,
    closeTabAtomic
  } = useTableStore();
  const { currentShift } = useShiftStore();
  const { currentProfile } = useAuthStore();

  const currentTab = tabs.find((t) => t.table_id === table.id && t.status === 'OPEN');
  const items = currentTab ? getTabOrderItems(currentTab.id) : [];
  const payments = currentTab ? getTabPayments(currentTab.id) : [];

  // Permissão para editar comanda em fechamento (após pagamento parcial)
  const canEditInSettlement = ['MASTER', 'GERENTE', 'CAIXA'].includes(currentProfile.role);

  // Estados locais de ajuste de conta
  const [includeServiceFee, setIncludeServiceFee] = useState<boolean>(true);
  const [discountAmount, setDiscountAmount] = useState<number>(0);

  // Estados de novo pagamento
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [cashTendered, setCashTendered] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [isPixModalOpen, setIsPixModalOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Estado do cupom emitido
  const [receiptData, setReceiptData] = useState<{
    tab: Tab;
    table: RestaurantTable;
    items: OrderItem[];
    payments: Payment[];
    cashChange: number;
  } | null>(null);

  // Inicializa valores a partir da comanda atual
  useEffect(() => {
    if (currentTab) {
      setIncludeServiceFee(currentTab.service_fee > 0);
      setDiscountAmount(currentTab.discount);
    }
  }, [currentTab?.id]);

  if (!isOpen) return null;
  if (receiptData) return (<ReceiptModal
    isOpen={true}
    onClose={() => {
      setReceiptData(null);
      onClose();
    }}
    tab={receiptData.tab}
    table={receiptData.table}
    items={receiptData.items}
    payments={receiptData.payments}
    cashChange={receiptData.cashChange}
  />);
  if (!currentTab) return null;

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remainingDue = Math.max(0, Math.round((currentTab.total - totalPaid) * 100) / 100);
  const isFullyPaid = totalPaid >= currentTab.total - 0.01;
  const isOverpaid = totalPaid > currentTab.total + 0.01;
  const refundAmount = isOverpaid ? Math.round((totalPaid - currentTab.total) * 100) / 100 : 0;

  // Cálculo de troco quando dinheiro
  const cashGivenNumber = parseFloat(cashTendered.replace(',', '.')) || 0;
  const paymentAmountNumber = parseFloat(paymentAmount.replace(',', '.')) || 0;
  const cashChange = paymentMethod === 'DINHEIRO' && cashGivenNumber > paymentAmountNumber
    ? Math.round((cashGivenNumber - paymentAmountNumber) * 100) / 100
    : 0;

  // Atualiza ajustes na comanda (taxa de serviço / desconto)
  const handleToggleServiceFee = () => {
    const next = !includeServiceFee;
    setIncludeServiceFee(next);
    updateTabBillAdjustments(currentTab.id, {
      includeServiceFee: next,
      discountAmount,
    });
  };

  const handleApplyDiscount = (val: number) => {
    const sanitized = Math.max(0, val);
    setDiscountAmount(sanitized);
    updateTabBillAdjustments(currentTab.id, {
      includeServiceFee,
      discountAmount: sanitized,
    });
  };

  // Preenche campo de pagamento com o saldo restante ao mudar de método ou abrir
  const handleSelectMethod = (m: PaymentMethod) => {
    setPaymentMethod(m);
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      setPaymentAmount(remainingDue > 0 ? remainingDue.toFixed(2) : '');
    }
  };

  // Registrar fatia de pagamento
  const handleAddPayment = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const amount = parseFloat(paymentAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      setErrorMessage('Informe um valor válido maior que zero.');
      return;
    }

    if (!currentShift) {
      setErrorMessage('Nenhum turno aberto.');
      return;
    }

    try {
      let notes = paymentNotes;
      if (paymentMethod === 'DINHEIRO' && cashGivenNumber > amount) {
        notes = `Recebido: ${formatBRL(cashGivenNumber)} • Troco: ${formatBRL(cashChange)}`;
      }

      addPaymentAtomic(
        currentShift.id,
        currentTab.id,
        amount,
        paymentMethod,
        currentProfile.id,
        notes || undefined
      );

      // Limpa formulário para o próximo pagamento se houver saldo restante
      const nextRemaining = Math.max(0, remainingDue - amount);
      setPaymentAmount(nextRemaining > 0 ? nextRemaining.toFixed(2) : '');
      setCashTendered('');
      setPaymentNotes('');
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  // Finaliza a comanda e libera a mesa
  const handleFinalizeClosure = () => {
    if (!currentShift) return;
    setErrorMessage(null);

    try {
      const result = closeTabAtomic(currentShift.id, currentTab.id, currentProfile.id);

      // Abre o cupom térmico
      setReceiptData({
        tab: result.tab,
        table,
        items: result.items,
        payments: result.payments,
        cashChange,
      });
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleCancelItem = async (item: OrderItem) => {
    if (!currentShift) return;
    if (!canEditInSettlement) {
      notify('Somente admin, gerente ou caixa podem editar itens em fechamento.', 'error');
      return;
    }
    const reason = await requestText({
      title: 'Cancelar item em fechamento',
      label: 'Motivo obrigatório',
      confirmText: 'Cancelar item',
      danger: true,
      message: `A comanda já possui pagamento parcial. Informe o motivo para remover "${item.quantity}x ${item.product_name}":`,
      initialValue: 'Item não consumido / lançado errado',
    });
    if (!reason?.trim()) return;

    try {
      cancelOrderItemAtomic(item.id, reason.trim(), currentProfile.id, currentShift.id);
      notify(`Item removido. Novo saldo: ${formatBRL(currentTab.total)}.`, 'success');
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  return (
    <>
      <Dialog label="Fechamento da conta" onClose={onClose}>
        <div className="dialog-panel bg-surface-muted border border-line rounded-2xl w-full max-w-4xl p-5 sm:p-6 shadow-card space-y-4 max-h-[95vh] flex flex-col fade-in zoom-in-95">

          {/* Topo do Checkout */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
            <div className="flex items-center gap-3">
              <div className="bg-brand-700 w-12 h-12 rounded-2xl text-white flex items-center justify-center font-bold text-xl shadow-card">
                {String(table.number).padStart(2, '0')}
              </div>
              <div>
                <h3 className="font-bold text-ink text-lg leading-none flex items-center gap-2 font-sans">
                  <span>Fechamento de Conta — Mesa {String(table.number).padStart(2, '0')}</span>
                  {table.status === 'AGUARDANDO_CONTA' && (
                    <span className="text-xs px-2.5 py-0.5 rounded-sm bg-amber-100 text-amber-800 tabular-nums font-medium">
                      Conta Solicitada
                    </span>
                  )}
                </h3>
                <p className="text-xs text-ink-muted mt-1 flex items-center gap-2">
                  <span>{currentTab.customer_name}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-ink-muted" />
                    {currentTab.people_count} pessoas
                  </span>
                  <span>•</span>
                  <span>Aberta às {new Date(currentTab.opened_at).toLocaleTimeString('pt-BR')}</span>
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-surface-muted transition"
              type="button" aria-label="Fechar janela">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mensagem de Erro se houver */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2" role="alert">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-700" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Grid Principal: Extrato à esquerda / Pagamento à direita */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 flex-1 overflow-y-auto pr-1 custom-scrollbar">

            {/* COLUNA ESQUERDA: Conferência Item a Item (6 colunas) */}
            <div className="md:col-span-6 space-y-3 flex flex-col justify-between bg-white p-4 rounded-2xl border border-stone-300">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-2">
                <span className="text-xs font-bold text-ink flex items-center gap-1.5 font-sans">
                  <Receipt className="w-4 h-4 text-brand-700" />
                  <span>Itens Lançados ({items.filter(i => i.status !== 'CANCELLED').length})</span>
                </span>
                <span className="text-xs text-ink-muted tabular-nums">
                  Auditoria de consumo
                </span>
              </div>

              {/* Alerta de pagamento excedente (valor a devolver) */}
              {isOverpaid && (
                <div className="notice border-amber-300 bg-amber-50 text-amber-900 mb-3" role="alert">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <p className="text-xs font-medium">
                    Pagamento excede o total em <strong>{formatBRL(refundAmount)}</strong>. Devolva o troco ao cliente antes de fechar.
                  </p>
                </div>
              )}

              {/* Lista de Itens */}
              <div className="overflow-y-auto max-h-[36vh] space-y-2 pr-1 text-xs">
                {items.length === 0 ? (
                  <div className="py-8 text-center text-ink-muted">Nenhum item consumido.</div>
                ) : (
                  items.map((item) => {
                    const statusConf = getOrderItemStatusConfig(item.status);
                    const isCancelled = item.status === 'CANCELLED';

                    return (
                      <div
                        key={item.id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${isCancelled
                            ? 'bg-rose-50 border-rose-200 text-ink-muted line-through'
                            : 'bg-white border-stone-300 text-ink'
                          }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-ink text-xs truncate">
                            {item.quantity}x {item.product_name}
                          </div>
                          {item.doneness && (
                            <div className="text-xs text-amber-800 tabular-nums">
                              {formatDoneness(item.doneness)}
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-xs px-1.5 py-0.5 rounded-sm font-semibold ${statusConf.bg} ${statusConf.color}`}>
                              {statusConf.label}
                            </span>
                            <span className="text-ink-muted tabular-nums text-xs">
                              {formatBRL(item.unit_price)} unid.
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="tabular-nums font-bold text-ink text-xs">
                            {formatBRL(item.unit_price * item.quantity)}
                          </span>
                          {!isCancelled && canEditInSettlement && (
                            <button
                              onClick={() => handleCancelItem(item)}
                              title="Cancelar item (requer motivo)"
                              className="p-1 rounded text-ink-muted hover:text-rose-700 hover:bg-rose-50 transition"
                              type="button" aria-label="Cancelar item">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Ajustes de Taxa de Serviço e Desconto */}
              <div className="border-t border-line pt-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-ink">
                    <input
                      type="checkbox"
                      checked={includeServiceFee}
                      onChange={handleToggleServiceFee}
                      className="w-4 h-4 rounded text-brand-700 focus:ring-0 focus:outline-none cursor-pointer bg-surface-muted border-line"
                    />
                    <span className="font-semibold">Taxa de serviço (10%)</span>
                  </label>
                  <span className="tabular-nums text-ink font-bold">
                    {formatBRL(currentTab.service_fee)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-ink font-semibold flex items-center gap-1">
                    <Percent className="w-3.5 h-3.5 text-rose-700" />
                    <span>Desconto (R$):</span>
                  </span>
                  <div className="flex items-center gap-1.5 w-32">
                    <input
                      type="number"
                      min="0"
                      step="0.50"
                      value={discountAmount || ''}
                      placeholder="0,00"
                      onChange={(e) => handleApplyDiscount(parseFloat(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-stone-300 text-ink tabular-nums text-right text-xs focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:outline-none transition-shadow"
                      aria-label="Desconto em reais" />
                  </div>
                </div>

                <div className="flex justify-between items-baseline pt-2 border-t border-line">
                  <span className="font-bold text-ink text-sm font-sans">TOTAL DEVIDO:</span>
                  <span className="tabular-nums text-2xl font-bold text-brand-700">
                    {formatBRL(currentTab.total)}
                  </span>
                </div>
              </div>
            </div>

            {/* COLUNA DIREITA: Divisão de Pagamentos Multimeios (6 colunas) */}
            <div className="md:col-span-6 space-y-3 flex flex-col justify-between bg-white p-4 rounded-2xl border border-stone-300">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-2">
                <span className="text-xs font-bold text-ink flex items-center gap-1.5 font-sans">
                  <Coins className="w-4 h-4 text-emerald-700" />
                  <span>Pagamento</span>
                </span>
                <span className="text-xs tabular-nums text-ink-muted">
                  Total Pago: <strong className="text-emerald-700">{formatBRL(totalPaid)}</strong>
                </span>
              </div>

              {/* Lista de Fatias de Pagamentos já Registradas */}
              <div className="space-y-1.5 max-h-[22vh] overflow-y-auto pr-1 custom-scrollbar">
                {payments.length === 0 ? (
                  <div className="py-4 text-center text-ink-muted text-xs">
                    Nenhum pagamento registrado ainda. Selecione o método abaixo.
                  </div>
                ) : (
                  payments.map((p) => (
                    <div
                      key={p.id}
                      className="p-2.5 rounded-xl bg-surface-muted border border-line flex items-center justify-between text-xs shadow-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-sm bg-emerald-50 text-emerald-800 font-medium tabular-nums text-xs">
                          {p.method}
                        </span>
                        <div>
                          <span className="tabular-nums font-bold text-ink text-sm">
                            {formatBRL(p.amount)}
                          </span>
                          {p.notes && (
                            <p className="text-xs text-ink-muted italic mt-0.5">
                              {p.notes}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => removePayment(p.id)}
                        className="p-1.5 text-ink-muted hover:text-rose-700 hover:bg-rose-50 rounded transition"
                        title="Remover este pagamento"
                        type="button" aria-label="Remover este pagamento">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Status do Saldo da Conta */}
              <div
                className={`p-3 rounded-2xl border flex items-center justify-between text-xs tabular-nums font-bold ${isFullyPaid
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'bg-amber-50 text-amber-800'
                  }`}
              >
                <span>{isFullyPaid ? 'Conta quitada' : 'Saldo a pagar'}</span>
                <span className="text-lg">{formatBRL(remainingDue)}</span>
              </div>

              {/* Formulário para Adicionar Pagamento */}
              {!isFullyPaid && (
                <form onSubmit={handleAddPayment} className="space-y-2.5 pt-1 border-t border-line">
                  {/* Seletor de Meio de Pagamento */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { id: 'PIX' as PaymentMethod, label: 'PIX', icon: QrCode },
                      { id: 'DINHEIRO' as PaymentMethod, label: 'Dinheiro', icon: Banknote },
                      { id: 'DEBITO' as PaymentMethod, label: 'Débito', icon: CreditCard },
                      { id: 'CREDITO' as PaymentMethod, label: 'Crédito', icon: CreditCard },
                    ].map((m) => {
                      const Icon = m.icon;
                      const isSelected = paymentMethod === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => handleSelectMethod(m.id)}
                          className={`py-2.5 rounded-xl text-xs font-bold transition flex flex-col items-center gap-1 ${isSelected
                              ? 'bg-brand-700 text-white font-bold shadow-sm'
                              : 'bg-white border border-stone-300 text-ink hover:bg-brand-50 hover:border-brand-300'
                            }`}
                        >
                          <Icon className="w-4 h-4" />
                          <span>{m.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Atalho Especial para PIX Dinâmico */}
                  {paymentMethod === 'PIX' && (
                    <button
                      type="button"
                      onClick={() => setIsPixModalOpen(true)}
                      className="w-full py-2.5 px-3 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>Abrir PIX e código de pagamento</span>
                    </button>
                  )}

                  {/* Campo de Valor do Pagamento e Botões de Divisão Rápida */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3.5 top-2.5 text-xs text-ink-muted tabular-nums font-bold">
                          R$
                        </span>
                        <input
                          type="text"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          placeholder={remainingDue.toFixed(2)}
                          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white border border-stone-300 text-ink tabular-nums text-sm font-bold focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:outline-none transition-shadow"
                          aria-label="Valor do pagamento em reais" inputMode="decimal" />
                      </div>

                      <button
                        type="submit"
                        className="btn-success px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Lançar</span>
                      </button>
                    </div>

                    {/* Botões Rápidos de Divisão */}
                    <div className="flex flex-wrap gap-1.5 text-xs tabular-nums text-ink-muted">
                      <button
                        type="button"
                        onClick={() => setPaymentAmount(remainingDue.toFixed(2))}
                        className="px-2.5 py-1 rounded-lg bg-white border border-stone-300 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-300 transition"
                      >
                        Total ({formatBRL(remainingDue)})
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentAmount((remainingDue / 2).toFixed(2))}
                        className="px-2.5 py-1 rounded-lg bg-white border border-stone-300 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-300 transition"
                      >
                        1/2 ({formatBRL(remainingDue / 2)})
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentAmount((remainingDue / 3).toFixed(2))}
                        className="px-2.5 py-1 rounded-lg bg-white border border-stone-300 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-300 transition"
                      >
                        1/3 ({formatBRL(remainingDue / 3)})
                      </button>
                    </div>
                  </div>

                  {/* Campo de Dinheiro Entregue e Cálculo de Troco */}
                  {paymentMethod === 'DINHEIRO' && (
                    <div className="p-3 rounded-2xl bg-surface-muted border border-line space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-ink font-semibold">
                          Valor entregue pelo cliente:
                        </span>
                        <div className="relative w-32">
                          <span className="absolute left-2.5 top-2 text-xs text-ink-muted tabular-nums font-bold">
                            R$
                          </span>
                          <input
                            type="text"
                            placeholder="0,00"
                            value={cashTendered}
                            onChange={(e) => setCashTendered(e.target.value)}
                            className="w-full pl-7 pr-2.5 py-1.5 rounded-xl bg-surface-muted border border-line text-ink tabular-nums text-xs text-right focus:ring-1 focus:ring-brand-600 focus:outline-none"
                            aria-label="Dinheiro recebido do cliente" inputMode="decimal" />
                        </div>
                      </div>

                      {cashChange > 0 && (
                        <div className="flex justify-between items-center pt-2 border-t border-line text-emerald-700 tabular-nums font-bold">
                          <span>Troco a devolver:</span>
                          <span className="text-base">{formatBRL(cashChange)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </form>
              )}

              {/* Botão de Fechamento Final */}
              <div className="pt-2">
                <button
                  type="button"
                  disabled={!isFullyPaid}
                  onClick={handleFinalizeClosure}
                  className={`w-full py-4 rounded-2xl font-bold text-xs transition shadow-sm flex items-center justify-center gap-2 ${isFullyPaid
                      ? 'btn-success'
                      : 'bg-surface-muted text-ink-muted cursor-not-allowed border border-line'
                    }`}
                >
                  <CheckCheck className="w-4 h-4" />
                  <span>{isFullyPaid ? 'Encerrar Conta e Liberar Mesa' : 'Aguardando Quitação Total'}</span>
                </button>
              </div>

            </div>

          </div>

        </div>
      </Dialog>

      {/* Modal de Impressão do Cupom Térmico */}


      {/* Modal de PIX Dinâmico Instantâneo com QR Code & Zap */}
      {currentTab && (
        <PixPaymentModal
          isOpen={isPixModalOpen}
          onClose={() => setIsPixModalOpen(false)}
          amount={parseFloat(paymentAmount.replace(',', '.')) || remainingDue}
          tableNumber={table.number}
          customerName={currentTab.customer_name}
          subtotal={currentTab.subtotal}
          serviceFee={includeServiceFee ? currentTab.service_fee : 0}
          onPaymentConfirmed={(confirmedAmount, txId) => {
            if (!currentShift) return;
            addPaymentAtomic(
              currentShift.id,
              currentTab.id,
              confirmedAmount,
              'PIX',
              currentProfile.id,
              `PIX Dinâmico BACEN TxID: ${txId}`
            );
            // Atualiza o valor restante no form
            const nextRemaining = Math.max(0, remainingDue - confirmedAmount);
            setPaymentAmount(nextRemaining > 0 ? nextRemaining.toFixed(2) : '');
          }}
        />
      )}
    </>
  );
};
