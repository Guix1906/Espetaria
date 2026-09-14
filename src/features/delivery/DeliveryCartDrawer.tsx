import { Dialog } from '../../components/ui/Dialog';
import React, { useState } from 'react';
import { 
  X, 
  Trash2, 
  MapPin, 
  Phone, 
  User, 
  CreditCard, 
  Banknote, 
  QrCode, 
  Send, 
  AlertCircle,
  Plus,
  Minus
} from 'lucide-react';
import { useDeliveryStore, NEIGHBORHOOD_FEES } from '../../stores/useDeliveryStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { DeliveryPaymentMethod } from '../../types/domain';
import { formatBRL, formatDoneness } from '../../lib/formatters';

interface DeliveryCartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderPlaced: () => void;
}

export const DeliveryCartDrawer: React.FC<DeliveryCartDrawerProps> = ({
  isOpen,
  onClose,
  onOrderPlaced,
}) => {
  const { cart, removeFromCart, updateCartQuantity, placeDeliveryOrderAtomic } = useDeliveryStore();
  const { currentShift } = useShiftStore();

  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [neighborhood, setNeighborhood] = useState(NEIGHBORHOOD_FEES[0]?.name || 'Centro');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [reference, setReference] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<DeliveryPaymentMethod>('PIX');
  const [cashChangeFor, setCashChangeFor] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const currentFee = NEIGHBORHOOD_FEES.find((n) => n.name === neighborhood)?.fee || 5.0;
  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const total = subtotal + currentFee;

  const handleSubmitOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (cart.length === 0) {
      setErrorMessage('Seu carrinho está vazio.');
      return;
    }

    if (!customerName.trim() || !phone.trim() || !street.trim() || !number.trim()) {
      setErrorMessage('Por favor, preencha Nome, WhatsApp, Rua e Número para a entrega.');
      return;
    }

    if (!currentShift) {
      setErrorMessage('A espetaria está fechada no momento. Horário de funcionamento: Noite.');
      return;
    }

    setIsSubmitting(true);
    try {
      const cashChangeNumber = paymentMethod === 'DINHEIRO' && cashChangeFor
        ? parseFloat(cashChangeFor.replace(',', '.'))
        : undefined;

      placeDeliveryOrderAtomic({
        shiftId: currentShift.id,
        customerName: customerName.trim(),
        phone: phone.trim(),
        addressStreet: street.trim(),
        addressNumber: number.trim(),
        addressNeighborhood: neighborhood,
        addressComplement: complement.trim() || undefined,
        addressReference: reference.trim() || undefined,
        deliveryFee: currentFee,
        paymentMethod,
        cashChangeFor: cashChangeNumber,
        notes: orderNotes.trim() || undefined,
      });

      onOrderPlaced();
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog label="Revisar pedido e endereço de entrega" onClose={onClose} placement="sheet">
      <div className="dialog-panel bg-surface-muted border-t sm:border border-line rounded-t-3xl sm:rounded-2xl w-full max-w-lg p-5 sm:p-6 shadow-card space-y-4 max-h-[92vh] flex flex-col fade-in zoom-in-95">
        
        {/* Topo do Carrinho */}
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <h3 className="font-bold text-ink text-base leading-none font-sans">
              Seu Pedido de Delivery
            </h3>
            <p className="text-xs text-ink-muted mt-1">
              {cart.reduce((sum, i) => sum + i.quantity, 0)} itens selecionados
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-muted transition"
           type="button" aria-label="Fechar janela">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensagem de Erro */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2" role="alert">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-700" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Conteúdo Rolável do Pedido e Cadastro */}
        <div className="overflow-y-auto flex-1 space-y-4 pr-1 text-xs">
          
          {/* Lista de Itens do Carrinho */}
          <div className="space-y-2">
            <span className="font-bold text-ink text-xs font-sans">
              Itens do Pedido:
            </span>
            {cart.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-2xl bg-surface-muted border border-line flex items-center justify-between gap-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-ink truncate text-xs">
                    {item.product.name}
                  </div>
                  {item.doneness && (
                    <div className="text-xs text-amber-800 tabular-nums">
                      Ponto: {formatDoneness(item.doneness)}
                    </div>
                  )}
                  {item.notes && (
                    <div className="text-xs text-amber-800 italic">
                      Obs: {item.notes}
                    </div>
                  )}
                  <div className="tabular-nums text-brand-700 font-bold text-xs mt-0.5">
                    {formatBRL(item.product.price * item.quantity)}
                  </div>
                </div>

                {/* Controles de Quantidade */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center border border-line rounded-xl bg-surface-muted overflow-hidden shadow-sm">
                    <button
                      type="button"
                      onClick={() => updateCartQuantity(item.id, -1)}
                      className="p-1.5 text-ink-muted hover:text-ink transition"
                     aria-label="Diminuir quantidade">
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="px-2 tabular-nums font-bold text-ink text-xs">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateCartQuantity(item.id, 1)}
                      className="p-1.5 text-ink-muted hover:text-ink transition"
                     aria-label="Aumentar quantidade">
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeFromCart(item.id)}
                    className="p-1.5 text-ink-muted hover:text-rose-700 transition"
                   aria-label="Remover item">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Dados do Cliente e Endereço */}
          <form id="delivery-form" onSubmit={handleSubmitOrder} className="space-y-3 pt-2 border-t border-line">
            <span className="font-bold text-ink text-xs block font-sans">
              Dados para Entrega:
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-ink-muted">
                  <User className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  placeholder="Seu Nome Completo"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-surface-muted border border-line text-ink text-xs focus:ring-1 focus:ring-brand-600 focus:outline-none"
                  required
                 aria-label="Nome do cliente"/>
              </div>

              <div className="relative">
                <span className="absolute left-3 top-2.5 text-ink-muted">
                  <Phone className="w-3.5 h-3.5" />
                </span>
                <input
                  type="tel"
                  placeholder="WhatsApp (ex: 11 98765-4321)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-surface-muted border border-line text-ink text-xs focus:ring-1 focus:ring-brand-600 focus:outline-none"
                  required
                 aria-label="WhatsApp com DDD"/>
              </div>
            </div>

            {/* Bairro & Taxa */}
            <div>
              <label className="text-xs text-ink-muted font-semibold mb-1 block" htmlFor="deliverycartdrawer-field-1">
                Bairro de Entrega:
              </label>
              <select
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-muted border border-line text-ink text-xs focus:ring-1 focus:ring-brand-600 focus:outline-none"
               aria-label="Bairro de Entrega:" id="deliverycartdrawer-field-1">
                {NEIGHBORHOOD_FEES.map((n) => (
                  <option key={n.name} value={n.name}>
                    {n.name} — Taxa: {formatBRL(n.fee)}
                  </option>
                ))}
              </select>
            </div>

            {/* Rua e Número */}
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 relative">
                <span className="absolute left-3 top-2.5 text-ink-muted">
                  <MapPin className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  placeholder="Rua / Avenida"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-surface-muted border border-line text-ink text-xs focus:ring-1 focus:ring-brand-600 focus:outline-none"
                  required
                 aria-label="Rua ou avenida"/>
              </div>

              <div>
                <input
                  type="text"
                  placeholder="Número"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-muted border border-line text-ink text-xs focus:ring-1 focus:ring-brand-600 focus:outline-none"
                  required
                 aria-label="Número do endereço"/>
              </div>
            </div>

            {/* Complemento & Referência */}
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Complemento (Apto, Bloco)"
                value={complement}
                onChange={(e) => setComplement(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-muted border border-line text-ink text-xs focus:ring-1 focus:ring-brand-600 focus:outline-none"
               aria-label="Complemento"/>
              <input
                type="text"
                placeholder="Ponto de Referência"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-muted border border-line text-ink text-xs focus:ring-1 focus:ring-brand-600 focus:outline-none"
               aria-label="Ponto de referência"/>
            </div>

            {/* Meio de Pagamento */}
            <div className="space-y-1.5 pt-1">
              <span className="font-bold text-ink text-xs block font-sans">
                Forma de Pagamento:
              </span>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('PIX')}
                  className={`py-2.5 rounded-xl font-bold flex flex-col items-center gap-1 transition ${
                    paymentMethod === 'PIX'
                      ? 'btn-success text-white shadow-sm'
                      : 'bg-surface-muted text-ink-muted hover:bg-surface-muted'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  <span>PIX Online</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('CARTAO_ENTREGA')}
                  className={`py-2.5 rounded-xl font-bold flex flex-col items-center gap-1 transition ${
                    paymentMethod === 'CARTAO_ENTREGA'
                      ? 'bg-sky-700 text-white font-bold shadow-sm'
                      : 'bg-surface-muted text-ink-muted hover:bg-surface-muted'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Cartão Entrega</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('DINHEIRO')}
                  className={`py-2.5 rounded-xl font-bold flex flex-col items-center gap-1 transition ${
                    paymentMethod === 'DINHEIRO'
                      ? 'btn-primary shadow-sm'
                      : 'bg-surface-muted text-ink-muted hover:bg-surface-muted'
                  }`}
                >
                  <Banknote className="w-4 h-4" />
                  <span>Dinheiro</span>
                </button>
              </div>

              {paymentMethod === 'DINHEIRO' && (
                <div className="p-3 rounded-2xl bg-surface-muted border border-line flex items-center justify-between gap-2">
                  <span className="text-ink text-xs">Precisa de troco para quanto?</span>
                  <input
                    type="text"
                    placeholder="Ex: 50,00"
                    value={cashChangeFor}
                    onChange={(e) => setCashChangeFor(e.target.value)}
                    className="w-24 px-2.5 py-1.5 rounded-xl bg-surface-muted border border-line text-ink tabular-nums text-xs text-right focus:outline-none focus:ring-1 focus:ring-brand-600"
                   aria-label="Troco para qual valor" inputMode="decimal"/>
                </div>
              )}
            </div>

            {/* Observações Gerais */}
            <div>
              <input
                type="text"
                placeholder="Observação para o pedido (opcional)..."
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-muted border border-line text-ink text-xs focus:ring-1 focus:ring-brand-600 focus:outline-none"
               aria-label="Observações do pedido"/>
            </div>
          </form>

        </div>

        {/* Resumo Financeiro & Botão de Envio */}
        <div className="border-t border-line pt-3.5 space-y-2 text-xs">
          <div className="flex justify-between text-ink-muted">
            <span>Subtotal dos Itens:</span>
            <span className="tabular-nums text-ink font-bold">{formatBRL(subtotal)}</span>
          </div>
          <div className="flex justify-between text-ink-muted">
            <span>Taxa de Entrega ({neighborhood}):</span>
            <span className="tabular-nums text-ink font-bold">{formatBRL(currentFee)}</span>
          </div>
          <div className="flex justify-between items-baseline pt-1.5 border-t border-line font-bold text-ink text-sm">
            <span className="font-sans">TOTAL DO PEDIDO:</span>
            <span className="text-2xl font-bold text-brand-700 tabular-nums">
              {formatBRL(total)}
            </span>
          </div>

          <button
            form="delivery-form"
            type="submit"
            disabled={cart.length === 0 || isSubmitting}
            className="btn-primary w-full py-4 rounded-2xl text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm"
          >
            <Send className="w-4 h-4" />
            <span>{isSubmitting ? 'Enviando Pedido...' : 'Confirmar e Enviar Pedido'}</span>
          </button>
        </div>

      </div>
    </Dialog>
  );
};
