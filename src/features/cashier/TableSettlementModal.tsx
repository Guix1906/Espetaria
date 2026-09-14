import React, { useState, useEffect } from 'react';
import { 
  X, 
  Receipt, 
  Trash2, 
  CreditCard, 
  Banknote, 
  QrCode, 
  Plus, 
  Percent, 
  Coins, 
  CheckCheck,
  AlertCircle,
  Users
} from 'lucide-react';
import { RestaurantTable, Tab, OrderItem, Payment } from '../../types/domain';
import { PaymentMethod } from '../../types/enums';
import { useTableStore } from '../../stores/useTableStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { formatBRL, formatDoneness, getOrderItemStatusConfig } from '../../lib/formatters';
import { ReceiptModal } from './ReceiptModal';
import { PixPaymentModal } from '../pix/PixPaymentModal';

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

  if (!isOpen || !currentTab) return null;

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remainingDue = Math.max(0, Math.round((currentTab.total - totalPaid) * 100) / 100);
  const isFullyPaid = totalPaid >= currentTab.total - 0.01;

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

  const handleCancelItem = (item: OrderItem) => {
    if (!currentShift) return;
    const reason = prompt(`Motivo do cancelamento de "${item.product_name}":`, 'Lançamento indevido pelo garçom');
    if (!reason) return;

    try {
      cancelOrderItemAtomic(item.id, reason, currentProfile.id, currentShift.id);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md">
        <div className="card-carbon border border-carbon-700 rounded-3xl w-full max-w-4xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[95vh] flex flex-col">
          
          {/* Topo do Checkout */}
          <div className="flex items-center justify-between border-b border-carbon-800 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-ember-600 to-gold-600 text-obsidian-950 flex items-center justify-center font-black text-xl shadow-lg shadow-ember-950/60">
                {String(table.number).padStart(2, '0')}
              </div>
              <div>
                <h3 className="font-extrabold text-white text-lg leading-none flex items-center gap-2 font-serif">
                  <span>Fechamento de Conta — Mesa {String(table.number).padStart(2, '0')}</span>
                  {table.status === 'AGUARDANDO_CONTA' && (
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 font-mono font-bold animate-pulse">
                      Conta Solicitada
                    </span>
                  )}
                </h3>
                <p className="text-xs text-obsidian-400 mt-1 flex items-center gap-2">
                  <span>{currentTab.customer_name}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-obsidian-500" />
                    {currentTab.people_count} pessoas
                  </span>
                  <span>•</span>
                  <span>Aberta às {new Date(currentTab.opened_at).toLocaleTimeString('pt-BR')}</span>
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-obsidian-400 hover:text-white hover:bg-carbon-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mensagem de Erro se houver */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-ruby-950/80 border border-ruby-600 text-ruby-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-ruby-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Grid Principal: Extrato à esquerda / Pagamento à direita */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 flex-1 overflow-y-auto pr-1 custom-scrollbar">
            
            {/* COLUNA ESQUERDA: Conferência Item a Item (6 colunas) */}
            <div className="md:col-span-6 space-y-3 flex flex-col justify-between bg-obsidian-900/80 p-4 rounded-2xl border border-carbon-800">
              <div className="flex items-center justify-between border-b border-carbon-800 pb-2">
                <span className="text-xs font-bold text-obsidian-300 uppercase tracking-wide flex items-center gap-1.5 font-serif">
                  <Receipt className="w-4 h-4 text-gold-400" />
                  <span>Itens Lançados ({items.filter(i => i.status !== 'CANCELLED').length})</span>
                </span>
                <span className="text-[11px] text-obsidian-500 font-mono">
                  Auditoria de consumo
                </span>
              </div>

              {/* Lista de Itens */}
              <div className="overflow-y-auto max-h-[36vh] space-y-2 pr-1 text-xs custom-scrollbar">
                {items.length === 0 ? (
                  <div className="py-8 text-center text-obsidian-500">Nenhum item consumido.</div>
                ) : (
                  items.map((item) => {
                    const statusConf = getOrderItemStatusConfig(item.status);
                    const isCancelled = item.status === 'CANCELLED';

                    return (
                      <div
                        key={item.id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                          isCancelled
                            ? 'bg-ruby-950/20 border-ruby-900/40 text-obsidian-500 line-through'
                            : 'bg-carbon-900 border-carbon-800 text-obsidian-200'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-white text-xs truncate">
                            {item.quantity}x {item.product_name}
                          </div>
                          {item.doneness && (
                            <div className="text-[10px] text-amber-400 font-mono">
                              {formatDoneness(item.doneness)}
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[9px] px-1.5 py-0.2 rounded border font-semibold ${statusConf.bg} ${statusConf.color}`}>
                              {statusConf.label}
                            </span>
                            <span className="text-obsidian-400 font-mono text-[10px]">
                              {formatBRL(item.unit_price)} unid.
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white text-xs">
                            {formatBRL(item.unit_price * item.quantity)}
                          </span>
                          {!isCancelled && (
                            <button
                              onClick={() => handleCancelItem(item)}
                              title="Cancelar item"
                              className="p-1 rounded text-obsidian-500 hover:text-ruby-400 hover:bg-ruby-950/60 transition"
                            >
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
              <div className="border-t border-carbon-800 pt-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-obsidian-300">
                    <input
                      type="checkbox"
                      checked={includeServiceFee}
                      onChange={handleToggleServiceFee}
                      className="w-4 h-4 rounded text-ember-500 focus:ring-0 focus:outline-none cursor-pointer bg-carbon-800 border-carbon-700"
                    />
                    <span className="font-semibold">Taxa de Serviço Garçom (10%)</span>
                  </label>
                  <span className="font-mono text-obsidian-300 font-bold">
                    {formatBRL(currentTab.service_fee)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-obsidian-300 font-semibold flex items-center gap-1">
                    <Percent className="w-3.5 h-3.5 text-ruby-400" />
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
                      className="w-full px-2.5 py-1.5 rounded-xl bg-carbon-900 border border-carbon-700 text-white font-mono text-right text-xs focus:ring-1 focus:ring-gold-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-between items-baseline pt-2 border-t border-carbon-800">
                  <span className="font-extrabold text-white text-sm font-serif">TOTAL DEVIDO:</span>
                  <span className="font-mono text-2xl font-black text-gold-400 drop-shadow-md">
                    {formatBRL(currentTab.total)}
                  </span>
                </div>
              </div>
            </div>

            {/* COLUNA DIREITA: Divisão de Pagamentos Multimeios (6 colunas) */}
            <div className="md:col-span-6 space-y-3 flex flex-col justify-between bg-obsidian-900/80 p-4 rounded-2xl border border-carbon-800">
              <div className="flex items-center justify-between border-b border-carbon-800 pb-2">
                <span className="text-xs font-bold text-obsidian-300 uppercase tracking-wide flex items-center gap-1.5 font-serif">
                  <Coins className="w-4 h-4 text-emerald-400" />
                  <span>Divisão e Recebimento Multimeios</span>
                </span>
                <span className="text-[11px] font-mono text-obsidian-400">
                  Total Pago: <strong className="text-emerald-400">{formatBRL(totalPaid)}</strong>
                </span>
              </div>

              {/* Lista de Fatias de Pagamentos já Registradas */}
              <div className="space-y-1.5 max-h-[22vh] overflow-y-auto pr-1 custom-scrollbar">
                {payments.length === 0 ? (
                  <div className="py-4 text-center text-obsidian-500 text-xs">
                    Nenhum pagamento registrado ainda. Selecione o método abaixo.
                  </div>
                ) : (
                  payments.map((p) => (
                    <div
                      key={p.id}
                      className="p-2.5 rounded-xl bg-carbon-900 border border-emerald-800/40 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-950/80 text-emerald-300 font-bold border border-emerald-700/60 font-mono text-[10px]">
                          {p.method}
                        </span>
                        <div>
                          <span className="font-mono font-bold text-white text-sm">
                            {formatBRL(p.amount)}
                          </span>
                          {p.notes && (
                            <p className="text-[10px] text-obsidian-400 italic mt-0.5">
                              {p.notes}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => removePayment(p.id)}
                        className="p-1.5 text-obsidian-500 hover:text-ruby-400 hover:bg-ruby-950/50 rounded transition"
                        title="Remover este pagamento"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Status do Saldo da Conta */}
              <div
                className={`p-3 rounded-2xl border flex items-center justify-between text-xs font-mono font-bold ${
                  isFullyPaid
                    ? 'bg-emerald-950/50 border-emerald-600/70 text-emerald-300 shadow-md shadow-emerald-950/40'
                    : 'bg-amber-950/30 border-amber-600/70 text-amber-300 shadow-md shadow-amber-950/30'
                }`}
              >
                <span>{isFullyPaid ? '✅ CONTA QUITADA!' : '⏳ SALDO RESTANTE A PAGAR:'}</span>
                <span className="text-lg">{formatBRL(remainingDue)}</span>
              </div>

              {/* Formulário para Adicionar Pagamento */}
              {!isFullyPaid && (
                <form onSubmit={handleAddPayment} className="space-y-2.5 pt-1 border-t border-carbon-800">
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
                          className={`py-2.5 rounded-xl text-xs font-bold transition flex flex-col items-center gap-1 active:scale-95 ${
                            isSelected
                              ? 'bg-gradient-to-r from-ember-600 to-gold-600 text-obsidian-950 font-black shadow-lg shadow-ember-950/50'
                              : 'bg-carbon-900 border border-carbon-800 text-obsidian-300 hover:bg-carbon-800 hover:text-white'
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
                      className="w-full py-2.5 px-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 transition active:scale-98 animate-pulse"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>Gerar QR Code PIX Dinâmico & WhatsApp Zap</span>
                    </button>
                  )}

                  {/* Campo de Valor do Pagamento e Botões de Divisão Rápida */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3.5 top-2.5 text-xs text-obsidian-500 font-mono font-bold">
                          R$
                        </span>
                        <input
                          type="text"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          placeholder={remainingDue.toFixed(2)}
                          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-carbon-900 border border-carbon-700 text-white font-mono text-sm font-bold focus:ring-2 focus:ring-gold-500 focus:outline-none"
                        />
                      </div>

                      <button
                        type="submit"
                        className="btn-emerald px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Lançar</span>
                      </button>
                    </div>

                    {/* Botões Rápidos de Divisão */}
                    <div className="flex gap-1.5 text-[10px] font-mono text-obsidian-400">
                      <button
                        type="button"
                        onClick={() => setPaymentAmount(remainingDue.toFixed(2))}
                        className="px-2.5 py-1 rounded-lg bg-carbon-900 border border-carbon-800 hover:bg-carbon-800 hover:text-white"
                      >
                        Total ({formatBRL(remainingDue)})
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentAmount((remainingDue / 2).toFixed(2))}
                        className="px-2.5 py-1 rounded-lg bg-carbon-900 border border-carbon-800 hover:bg-carbon-800 hover:text-white"
                      >
                        1/2 ({formatBRL(remainingDue / 2)})
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentAmount((remainingDue / 3).toFixed(2))}
                        className="px-2.5 py-1 rounded-lg bg-carbon-900 border border-carbon-800 hover:bg-carbon-800 hover:text-white"
                      >
                        1/3 ({formatBRL(remainingDue / 3)})
                      </button>
                    </div>
                  </div>

                  {/* Campo de Dinheiro Entregue e Cálculo de Troco */}
                  {paymentMethod === 'DINHEIRO' && (
                    <div className="p-3 rounded-2xl bg-carbon-900 border border-carbon-700 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-obsidian-300 font-semibold">
                          Valor entregue pelo cliente:
                        </span>
                        <div className="relative w-32">
                          <span className="absolute left-2.5 top-2 text-[11px] text-obsidian-500 font-mono font-bold">
                            R$
                          </span>
                          <input
                            type="text"
                            placeholder="0,00"
                            value={cashTendered}
                            onChange={(e) => setCashTendered(e.target.value)}
                            className="w-full pl-7 pr-2.5 py-1.5 rounded-xl bg-obsidian-950 border border-carbon-700 text-white font-mono text-xs text-right focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      {cashChange > 0 && (
                        <div className="flex justify-between items-center pt-2 border-t border-carbon-800 text-emerald-400 font-mono font-bold">
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
                  className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-wider transition active:scale-95 shadow-xl flex items-center justify-center gap-2 ${
                    isFullyPaid
                      ? 'btn-emerald shadow-emerald-950/60'
                      : 'bg-carbon-800 text-obsidian-500 cursor-not-allowed border border-carbon-700'
                  }`}
                >
                  <CheckCheck className="w-4 h-4" />
                  <span>{isFullyPaid ? 'Encerrar Conta e Liberar Mesa' : 'Aguardando Quitação Total'}</span>
                </button>
              </div>

            </div>

          </div>

        </div>
      </div>

      {/* Modal de Impressão do Cupom Térmico */}
      {receiptData && (
        <ReceiptModal
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
        />
      )}

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
