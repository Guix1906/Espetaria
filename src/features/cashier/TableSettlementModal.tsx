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
  X
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Dialog } from '../../components/ui/Dialog';
import { StatusTag } from '../../components/ui/StatusTag';
import { METHOD_LABELS } from '../../lib/financeData';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { formatBRL, formatDoneness } from '../../lib/formatters';
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
  const [includeServiceFee, setIncludeServiceFee] = useState<boolean>(false);
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
      setIncludeServiceFee(getServiceFeeRate() > 0 && currentTab.service_fee > 0);
      setDiscountAmount(currentTab.discount);
      // Já abre com o saldo no campo: é só escolher a forma e lançar
      const paid = payments.reduce((sum, p) => sum + p.amount, 0);
      const due = Math.max(0, Math.round((currentTab.total - paid) * 100) / 100);
      setPaymentAmount(due > 0 ? due.toFixed(2) : '');
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
        <div className="dialog-panel bg-surface-muted border border-line rounded-2xl w-full max-w-5xl p-4 sm:p-5 shadow-card space-y-4 max-h-[95vh] flex flex-col fade-in zoom-in-95">

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
              <h4 className="flex items-center gap-2 border-b border-line pb-2 text-lg font-bold text-ink font-sans">
                <Receipt className="w-5 h-5 text-brand-700" />
                Itens lançados ({items.filter(i => i.status !== 'CANCELLED').length})
              </h4>

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
              <div className="flex-1 overflow-y-auto max-h-[46vh] divide-y divide-line pr-1">
                {items.length === 0 ? (
                  <div className="py-8 text-center text-base text-ink-muted">Nenhum item consumido.</div>
                ) : (
                  items.map((item) => {
                    const isCancelled = item.status === 'CANCELLED';
                    return (
                      <div key={item.id} className={`flex items-center justify-between gap-3 py-2.5 ${isCancelled ? 'text-ink-muted line-through' : 'text-ink'}`}>
                        <div className="min-w-0 flex-1">
                          <p className="text-[17px] font-semibold leading-snug">
                            <span className="font-mono font-bold text-brand-700">{item.quantity}x</span> {item.product_name}
                          </p>
                          {(item.doneness || item.quantity > 1) && (
                            <p className="mt-0.5 text-sm text-ink-muted">
                              {item.doneness && <span className="font-medium text-amber-800">{formatDoneness(item.doneness)}</span>}
                              {item.doneness && item.quantity > 1 && ' · '}
                              {item.quantity > 1 && <span className="tabular-nums">{formatBRL(item.unit_price)} cada</span>}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 text-[17px] font-bold tabular-nums">{formatBRL(item.unit_price * item.quantity)}</span>
                        {!isCancelled && canEditInSettlement && (
                          <button onClick={() => handleCancelItem(item)} title="Cancelar item (requer motivo)" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-muted hover:text-rose-700 hover:bg-rose-50 transition" type="button" aria-label={`Cancelar ${item.product_name}`}>
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Ajustes de Taxa de Serviço e Desconto */}
              <div className="border-t border-line pt-3 space-y-2 text-base">
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
                      className="w-full px-2.5 py-1.5 rounded-md bg-surface border border-line text-ink tabular-nums text-right text-base focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:outline-none transition-shadow"
                      aria-label="Desconto em reais" />
                  </div>
                </div>

                <div className="flex justify-between items-baseline pt-2 border-t border-line">
                  <span className="font-bold text-ink text-lg font-sans">Total da conta</span>
                  <span className="tabular-nums text-3xl font-bold text-brand-700">
                    {formatBRL(currentTab.total)}
                  </span>
                </div>
              </div>
            </div>

            {/* COLUNA DIREITA: Pagamento, de cima para baixo: saldo, forma, valor, lançar */}
            <div className="md:col-span-6 space-y-3 flex flex-col bg-surface p-4 rounded-2xl border border-line">
              <h4 className="flex items-center gap-2 border-b border-line pb-2 text-lg font-bold text-ink font-sans">
                <Coins className="w-5 h-5 text-emerald-700" />
                Pagamento
              </h4>

              <div className={`flex items-center justify-between gap-3 rounded-xl p-3 ${isFullyPaid ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
                <div>
                  <p className="text-base font-semibold">{isFullyPaid ? 'Conta paga' : 'Falta pagar'}</p>
                  {totalPaid > 0 && <p className="text-sm tabular-nums">Já pago: {formatBRL(totalPaid)}</p>}
                </div>
                <span className="text-3xl font-black tabular-nums">{formatBRL(remainingDue)}</span>
              </div>

              {!isFullyPaid && (
                <form onSubmit={handleAddPayment} className="space-y-3">
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
                          aria-pressed={isSelected}
                          onClick={() => handleSelectMethod(m.id)}
                          className={`min-h-[56px] rounded-md text-sm font-bold transition flex flex-col items-center justify-center gap-1 ${isSelected
                              ? 'bg-ink text-white'
                              : 'bg-surface border border-line-strong text-ink hover:bg-surface-muted'
                            }`}
                        >
                          <Icon className="w-4 h-4" />
                          <span>{m.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {paymentMethod === 'PIX' && (
                    <button type="button" onClick={() => setIsPixModalOpen(true)} className="btn-secondary min-h-[44px] w-full text-sm font-semibold">
                      <QrCode className="w-4 h-4" />
                      Mostrar QR Code do PIX
                    </button>
                  )}

                  <div>
                    <label htmlFor="settlement-amount" className="mb-1 block text-sm font-semibold text-ink-secondary">Valor a lançar</label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-ink-muted font-bold">R$</span>
                        <input
                          id="settlement-amount"
                          type="text"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          placeholder={remainingDue.toFixed(2)}
                          className="w-full min-h-[52px] pl-11 pr-3 rounded-md bg-surface border border-line-strong text-ink tabular-nums text-xl font-bold focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:outline-none transition-shadow"
                          inputMode="decimal" />
                      </div>
                      <button type="submit" className="btn-success min-h-[52px] px-5 rounded-md text-base font-bold flex items-center gap-1.5 shrink-0">
                        <Plus className="w-4 h-4" />
                        Lançar
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 text-sm tabular-nums text-ink-secondary">
                    {([
                      ['Total', 1],
                      ['1/2', 2],
                      ['1/3', 3],
                      ...(currentTab.people_count > 1 && ![2, 3].includes(currentTab.people_count) ? [[`Por pessoa (${currentTab.people_count})`, currentTab.people_count] as const] : []),
                    ] as const).map(([label, parts]) => (
                      <button key={label} type="button" onClick={() => setPaymentAmount((remainingDue / parts).toFixed(2))}
                        className="min-h-[44px] px-3 rounded-md bg-surface border border-line hover:bg-surface-muted transition">
                        {label}: {formatBRL(remainingDue / parts)}
                      </button>
                    ))}
                  </div>

                  {paymentMethod === 'DINHEIRO' && (
                    <div className="space-y-2 rounded-xl border border-line p-3 text-base">
                      <div className="flex items-center justify-between gap-2">
                        <label htmlFor="settlement-cash" className="font-semibold text-ink">Cliente entregou</label>
                        <input
                          id="settlement-cash"
                          type="text"
                          placeholder="0,00"
                          value={cashTendered}
                          onChange={(e) => setCashTendered(e.target.value)}
                          className="w-32 min-h-[44px] px-2.5 rounded-md bg-surface border border-line-strong text-ink tabular-nums text-right focus:ring-1 focus:ring-brand-600 focus:outline-none"
                          inputMode="decimal" />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {noteSuggestions.map((note) => (
                          <button key={note} type="button" onClick={() => setCashTendered(note.toFixed(2))} className="min-h-[40px] px-3 rounded-md border border-line text-sm font-semibold tabular-nums hover:bg-surface-muted transition">
                            {formatBRL(note)}
                          </button>
                        ))}
                      </div>
                      {cashChange > 0 && (
                        <div className="flex justify-between items-center border-t border-line pt-2 font-bold text-emerald-800 tabular-nums">
                          <span>Troco</span>
                          <span className="text-xl">{formatBRL(cashChange)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </form>
              )}

              {payments.length > 0 && (
                <div className="border-t border-line pt-2">
                  <p className="mb-1 text-sm font-semibold text-ink-secondary">Pagamentos lançados</p>
                  <ul className="max-h-[18vh] divide-y divide-line overflow-y-auto">
                    {payments.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 py-1">
                        <div className="min-w-0">
                          <p className="text-base"><span className="font-semibold">{METHOD_LABELS[p.method] ?? p.method}</span> <span className="font-bold tabular-nums">{formatBRL(p.amount)}</span></p>
                          {p.notes && <p className="truncate text-sm text-ink-muted">{p.notes}</p>}
                        </div>
                        <button onClick={() => void handleRemovePayment(p)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-muted hover:text-rose-700 hover:bg-rose-50 transition" title="Remover este pagamento" type="button" aria-label="Remover este pagamento">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="button"
                disabled={!isFullyPaid}
                onClick={handleFinalizeClosure}
                className={`mt-auto w-full min-h-[56px] rounded-md font-bold text-[17px] transition flex items-center justify-center gap-2 ${isFullyPaid
                    ? 'btn-success'
                    : 'bg-surface-muted text-ink-muted cursor-not-allowed border border-line'
                  }`}
              >
                <CheckCheck className="w-5 h-5" />
                <span>{isFullyPaid ? 'Encerrar conta e liberar mesa' : 'Lance o pagamento para encerrar'}</span>
              </button>
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
