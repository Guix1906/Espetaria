import { getServiceFeeRate } from '../../lib/utils';
import {
  AlertCircle,
  Banknote,
  CheckCheck,
  Coins,
  CreditCard,
  Percent,
  Plus,
  Printer,
  QrCode,
  Receipt,
  Trash2,
  Users,
  X,
  Zap
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Dialog } from '../../components/ui/Dialog';
import { StatusTag } from '../../components/ui/StatusTag';
import { METHOD_LABELS } from '../../lib/financeData';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { formatBRL, formatDoneness, getOrderItemStatusConfig } from '../../lib/formatters';
import { useAuthStore } from '../../stores/useAuthStore';
import { usePrintStore } from '../../stores/usePrintStore';
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
  const { requestText, requestChoice, notify } = useFeedback();
  const [printingBill, setPrintingBill] = useState(false);
  const printBill = async () => {
    setPrintingBill(true);
    const ok = await usePrintStore.getState().printBill(table.id);
    setPrintingBill(false);
    notify(ok ? 'Conta enviada para a impressora da churrasqueira.' : 'Não foi possível imprimir a conta.', ok ? 'success' : 'error');
  };
  const {
    tabs,
    getTabOrderItems,
    getTabPayments,
    updateTabBillAdjustments,
    addPaymentAtomic,
    removePayment,
    cancelOrderItemAtomic,
    closeTabAtomic,
    quickCloseTabAtomic
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
  /** Texto digitado no desconto; só aplica ao sair do campo (aí pede o motivo). */
  const [discountDraft, setDiscountDraft] = useState<string | null>(null);

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

  // Desconto maior que zero pede o motivo (vai para as observações da comanda e para a auditoria)
  const commitDiscount = async () => {
    if (discountDraft === null) return;
    const value = Math.max(0, parseFloat(discountDraft.replace(',', '.')) || 0);
    setDiscountDraft(null);
    if (value === discountAmount) return;
    if (value > 0) {
      const reason = await requestText({ title: `Desconto de ${formatBRL(value)}`, label: 'Motivo do desconto', confirmText: 'Aplicar desconto', initialValue: '', message: 'O motivo fica registrado na comanda.' });
      if (!reason?.trim()) return;
      handleApplyDiscount(value);
      if (isSupabaseConfigured) {
        const { error } = await supabase.rpc('set_tab_discount_reason', { p_tab_id: currentTab.id, p_reason: reason.trim() });
        if (error) notify('Desconto aplicado, mas o motivo não foi salvo (falta rodar a migração 00044 no Supabase).', 'error');
      }
      return;
    }
    handleApplyDiscount(0);
  };

  const handleRemovePayment = async (p: Payment) => {
    const answer = await requestChoice({
      title: `Remover pagamento de ${formatBRL(p.amount)}?`,
      message: `${METHOD_LABELS[p.method] ?? p.method} lançado nesta conta.`,
      choices: [{ value: 'yes', label: 'Sim, remover' }, { value: 'no', label: 'Não, manter' }],
    });
    if (answer === 'yes') removePayment(p.id);
  };

  // Preenche campo de pagamento com o saldo restante ao mudar de método ou abrir
  const handleSelectMethod = (m: PaymentMethod) => {
    setPaymentMethod(m);
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      setPaymentAmount(remainingDue > 0 ? remainingDue.toFixed(2) : '');
    }
  };

  // Sugestões de notas de dinheiro comuns acima do saldo devido para troco imediato
  const commonBanknotes = [10, 20, 50, 100, 200];
  const roundedTen = Math.ceil(remainingDue / 10) * 10;
  const noteSuggestions = Array.from(new Set([
    ...(roundedTen > remainingDue ? [roundedTen] : []),
    ...commonBanknotes.filter((n) => n > remainingDue),
  ])).slice(0, 3);

  // Quitação rápida em 1 clique (Total ou Restante)
  const handleQuickPay = (method: PaymentMethod, tendered?: number) => {
    if (!currentShift || !currentTab) return;
    if (remainingDue <= 0) {
      handleFinalizeClosure();
      return;
    }
    setErrorMessage(null);
    try {
      const given = tendered && tendered > remainingDue ? tendered : remainingDue;
      const change = tendered && tendered > remainingDue ? Math.round((tendered - remainingDue) * 100) / 100 : 0;
      let notes = `Quitação total via ${METHOD_LABELS[method] ?? method}`;
      if (change > 0) {
        notes = `Recebido: ${formatBRL(given)} • Troco: ${formatBRL(change)}`;
      }

      const result = quickCloseTabAtomic(
        currentShift.id,
        currentTab.id,
        remainingDue,
        method,
        currentProfile.id,
        notes
      );

      setReceiptData({
        tab: result.tab,
        table,
        items: result.items,
        payments: result.payments,
        cashChange: change,
      });
      notify(`Mesa ${table.number} encerrada com sucesso! Pagamento via ${METHOD_LABELS[method] ?? method}.`, 'success');
    } catch (err) {
      setErrorMessage((err as Error).message);
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
                  <span>Fechamento de conta — Mesa {String(table.number).padStart(2, '0')}</span>
                  {table.status === 'AGUARDANDO_CONTA' && <StatusTag kind="bill" className="font-semibold">Conta pedida</StatusTag>}
                </h3>
                <p className="text-xs text-ink-muted mt-1 flex items-center gap-2">
                  <span>{currentTab.customer_name}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-ink-muted" />
                    {currentTab.people_count} pessoas
                  </span>
                  <span>•</span>
                  <span>Aberta às {new Date(currentTab.opened_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => void printBill()}
                disabled={printingBill}
                className="btn-secondary text-xs"
                type="button">
                <Printer className="h-4 w-4" />
                {printingBill ? 'Enviando...' : 'Imprimir conta'}
              </button>
              <button
              onClick={onClose}
              className="p-2 rounded-md text-ink-muted hover:text-ink hover:bg-surface-muted transition"
              type="button" aria-label="Fechar janela">
              <X className="w-5 h-5" />
            </button>
            </div>
          </div>

          {/* Mensagem de Erro se houver */}
          {errorMessage && (
            <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2" role="alert">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-700" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Grid Principal: Extrato à esquerda / Pagamento à direita */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 flex-1 overflow-y-auto pr-1 custom-scrollbar">

            {/* COLUNA ESQUERDA: Conferência Item a Item (6 colunas) */}
            <div className="md:col-span-6 space-y-3 flex flex-col justify-between bg-surface p-4 rounded-2xl border border-line">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2">
                <span className="text-xs font-bold text-ink flex items-center gap-1.5 font-sans">
                  <Receipt className="w-4 h-4 text-brand-700" />
                  <span>Itens lançados ({items.filter(i => i.status !== 'CANCELLED').length})</span>
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
                        className={`p-2.5 rounded-md border flex items-center justify-between gap-2 ${isCancelled
                            ? 'bg-rose-50 border-rose-200 text-ink-muted line-through'
                            : 'bg-surface border-line text-ink'
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
                {getServiceFeeRate() > 0 && <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-ink">
                    <input
                      type="checkbox"
                      checked={includeServiceFee}
                      onChange={handleToggleServiceFee}
                      className="w-4 h-4 rounded text-brand-700 focus:ring-0 focus:outline-none cursor-pointer bg-surface-muted border-line"
                    />
                    <span className="font-semibold">Taxa de serviço ({Math.round(getServiceFeeRate() * 1000) / 10}%)</span>
                  </label>
                  <span className="tabular-nums text-ink font-bold">
                    {formatBRL(currentTab.service_fee)}
                  </span>
                </div>}

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
                      value={discountDraft ?? (discountAmount || '')}
                      placeholder="0,00"
                      onChange={(e) => setDiscountDraft(e.target.value)}
                      onBlur={() => void commitDiscount()}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      className="w-full px-2.5 py-1.5 rounded-md bg-surface border border-line text-ink tabular-nums text-right text-xs focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:outline-none transition-shadow"
                      aria-label="Desconto em reais" />
                  </div>
                </div>

                <div className="flex justify-between items-baseline pt-2 border-t border-line">
                  <span className="font-bold text-ink text-sm font-sans">Total devido</span>
                  <span className="tabular-nums text-2xl font-bold text-brand-700">
                    {formatBRL(currentTab.total)}
                  </span>
                </div>
              </div>
            </div>

            {/* COLUNA DIREITA: Divisão de Pagamentos Multimeios (6 colunas) */}
            <div className="md:col-span-6 space-y-3 flex flex-col justify-between bg-surface p-4 rounded-2xl border border-line">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2">
                <span className="text-xs font-bold text-ink flex items-center gap-1.5 font-sans">
                  <Coins className="w-4 h-4 text-emerald-700" />
                  <span>Pagamento</span>
                </span>
                <span className="text-xs tabular-nums text-ink-muted">
                  Total pago: <strong className="text-emerald-700">{formatBRL(totalPaid)}</strong>
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
                      className="p-2.5 rounded-md bg-surface-muted border border-line flex items-center justify-between text-xs shadow-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-sm bg-emerald-50 text-emerald-800 font-medium tabular-nums text-xs">
                          {METHOD_LABELS[p.method] ?? p.method}
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
                        onClick={() => void handleRemovePayment(p)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink-muted hover:text-rose-700 hover:bg-rose-50 transition"
                        title="Remover este pagamento"
                        type="button" aria-label="Remover este pagamento">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Status do Saldo da Conta */}
              <div
                className={`p-3 rounded-2xl border flex items-center justify-between text-xs tabular-nums font-bold ${isFullyPaid
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}
              >
                <div>
                  <span className="block text-xs font-semibold">{isFullyPaid ? 'Conta quitada' : 'Saldo a pagar'}</span>
                  {currentTab.people_count > 1 && !isFullyPaid && (
                    <span className="text-[11px] font-normal text-amber-900/80">
                      ({currentTab.people_count} pessoas = {formatBRL(remainingDue / currentTab.people_count)} cada)
                    </span>
                  )}
                </div>
                <span className="text-xl font-black">{formatBRL(remainingDue)}</span>
              </div>

              {/* BLOCO DE QUITAÇÃO RÁPIDA EM 1 CLIQUE */}
              {!isFullyPaid && remainingDue > 0 && (
                <div className="bg-gradient-to-br from-brand-50/70 via-surface to-surface p-3.5 rounded-2xl border-2 border-brand-300 shadow-sm space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-brand-900 flex items-center gap-1.5 font-sans">
                      <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
                      <span>Quitar em 1 Clique (sem formulário)</span>
                    </span>
                    <span className="text-[11px] font-bold text-brand-700 bg-brand-100/90 px-2 py-0.5 rounded-full">
                      Encerra e libera a mesa
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => handleQuickPay('PIX')}
                      className="min-h-[58px] p-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold transition flex flex-col items-center justify-center gap-0.5 shadow-sm border border-emerald-500 text-center"
                      title={`Quitar valor total de ${formatBRL(remainingDue)} via PIX`}
                    >
                      <div className="flex items-center gap-1 text-xs">
                        <QrCode className="w-3.5 h-3.5" />
                        <span>PIX</span>
                      </div>
                      <span className="text-sm tabular-nums font-black">{formatBRL(remainingDue)}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickPay('DEBITO')}
                      className="min-h-[58px] p-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold transition flex flex-col items-center justify-center gap-0.5 shadow-sm border border-blue-500 text-center"
                      title={`Quitar valor total de ${formatBRL(remainingDue)} via Cartão de Débito`}
                    >
                      <div className="flex items-center gap-1 text-xs">
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>DÉBITO</span>
                      </div>
                      <span className="text-sm tabular-nums font-black">{formatBRL(remainingDue)}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickPay('CREDITO')}
                      className="min-h-[58px] p-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-bold transition flex flex-col items-center justify-center gap-0.5 shadow-sm border border-indigo-500 text-center"
                      title={`Quitar valor total de ${formatBRL(remainingDue)} via Cartão de Crédito`}
                    >
                      <div className="flex items-center gap-1 text-xs">
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>CRÉDITO</span>
                      </div>
                      <span className="text-sm tabular-nums font-black">{formatBRL(remainingDue)}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickPay('DINHEIRO')}
                      className="min-h-[58px] p-2 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white font-bold transition flex flex-col items-center justify-center gap-0.5 shadow-sm border border-amber-500 text-center"
                      title={`Quitar valor total de ${formatBRL(remainingDue)} em Dinheiro`}
                    >
                      <div className="flex items-center gap-1 text-xs">
                        <Banknote className="w-3.5 h-3.5" />
                        <span>DINHEIRO</span>
                      </div>
                      <span className="text-sm tabular-nums font-black">{formatBRL(remainingDue)}</span>
                    </button>
                  </div>

                  {noteSuggestions.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-brand-200/60 text-xs">
                      <span className="font-semibold text-ink-secondary text-[11px] flex items-center gap-1">
                        <Coins className="w-3.5 h-3.5 text-amber-600" />
                        <span>Dinheiro com troco:</span>
                      </span>
                      {noteSuggestions.map((note) => {
                        const change = Math.round((note - remainingDue) * 100) / 100;
                        return (
                          <button
                            key={note}
                            type="button"
                            onClick={() => handleQuickPay('DINHEIRO', note)}
                            className="px-2.5 py-1 rounded-lg bg-surface border border-line-strong hover:bg-amber-50 hover:border-amber-400 hover:text-amber-900 transition text-[11px] font-bold tabular-nums text-ink flex items-center gap-1 shadow-xs"
                            title={`Receber nota de ${formatBRL(note)} e registrar troco de ${formatBRL(change)}`}
                          >
                            <span>Nota {formatBRL(note)}</span>
                            <span className="text-emerald-700 font-semibold">(troco {formatBRL(change)})</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Divisor para pagamento parcial / multimeios */}
              {!isFullyPaid && remainingDue > 0 && (
                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-line"></div>
                  <span className="flex-shrink mx-3 text-[11px] uppercase tracking-wider text-ink-muted font-bold">
                    Ou dividir pagamento / registrar parcial
                  </span>
                  <div className="flex-grow border-t border-line"></div>
                </div>
              )}

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
                          className={`min-h-[44px] py-2 rounded-md text-sm font-bold transition flex flex-col items-center justify-center gap-1 ${isSelected
                              ? 'bg-brand-700 text-white font-bold shadow-sm'
                              : 'bg-surface border border-line text-ink hover:bg-brand-50 hover:border-brand-300'
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
                          className="w-full min-h-[48px] pl-9 pr-3 rounded-md bg-surface border border-line text-ink tabular-nums text-sm font-bold focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:outline-none transition-shadow"
                          aria-label="Valor do pagamento em reais" inputMode="decimal" />
                      </div>

                      <button
                        type="submit"
                        className="btn-success min-h-[48px] px-4 rounded-md text-[15px] flex items-center gap-1.5 shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Lançar</span>
                      </button>
                    </div>

                    {/* Botões Rápidos de Divisão */}
                    <div className="flex flex-wrap gap-1.5 text-sm tabular-nums text-ink-secondary">
                      {([
                        ['Total', 1],
                        ['1/2', 2],
                        ['1/3', 3],
                        ...(currentTab.people_count > 1 && ![2, 3].includes(currentTab.people_count) ? [[`Por pessoa (${currentTab.people_count})`, currentTab.people_count] as const] : []),
                      ] as const).map(([label, parts]) => (
                        <button key={label} type="button" onClick={() => setPaymentAmount((remainingDue / parts).toFixed(2))}
                          className="min-h-[44px] px-3 rounded-md bg-surface border border-line hover:bg-brand-50 hover:text-brand-700 hover:border-brand-300 transition">
                          {label} ({formatBRL(remainingDue / parts)})
                        </button>
                      ))}
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
                            className="w-full pl-7 pr-2.5 py-1.5 rounded-md bg-surface-muted border border-line text-ink tabular-nums text-xs text-right focus:ring-1 focus:ring-brand-600 focus:outline-none"
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
                  className={`w-full min-h-[56px] rounded-md font-bold text-[17px] transition shadow-sm flex items-center justify-center gap-2 ${isFullyPaid
                      ? 'btn-success'
                      : 'bg-surface-muted text-ink-muted cursor-not-allowed border border-line'
                    }`}
                >
                  <CheckCheck className="w-5 h-5" />
                  <span>{isFullyPaid ? 'Encerrar conta e liberar mesa' : 'Aguardando pagamento total'}</span>
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
