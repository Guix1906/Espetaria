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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md">
      <div className="card-carbon border-t sm:border border-carbon-700 rounded-t-3xl sm:rounded-3xl w-full max-w-lg p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
        
        {/* Topo do Carrinho */}
        <div className="flex items-center justify-between border-b border-carbon-800 pb-3">
          <div>
            <h3 className="font-black text-white text-base leading-none font-serif">
              Seu Pedido de Delivery
            </h3>
            <p className="text-xs text-obsidian-400 mt-1">
              {cart.reduce((sum, i) => sum + i.quantity, 0)} itens selecionados
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-obsidian-400 hover:text-white hover:bg-carbon-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensagem de Erro */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-ruby-950/80 border border-ruby-600 text-ruby-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-ruby-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Conteúdo Rolável do Pedido e Cadastro */}
        <div className="overflow-y-auto flex-1 space-y-4 pr-1 text-xs custom-scrollbar">
          
          {/* Lista de Itens do Carrinho */}
          <div className="space-y-2">
            <span className="font-bold text-obsidian-300 uppercase tracking-wider text-[10px] font-serif">
              Itens do Pedido:
            </span>
            {cart.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-2xl bg-carbon-800/80 border border-carbon-700/80 flex items-center justify-between gap-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white truncate text-xs">
                    {item.product.name}
                  </div>
                  {item.doneness && (
                    <div className="text-[10px] text-ember-400 font-mono">
                      Ponto: {formatDoneness(item.doneness)}
                    </div>
                  )}
                  {item.notes && (
                    <div className="text-[10px] text-gold-400 italic">
                      Obs: {item.notes}
                    </div>
                  )}
                  <div className="font-mono text-gold-400 font-bold text-[11px] mt-0.5">
                    {formatBRL(item.product.price * item.quantity)}
                  </div>
                </div>

                {/* Controles de Quantidade */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center border border-carbon-700 rounded-xl bg-obsidian-900 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => updateCartQuantity(item.id, -1)}
                      className="p-1.5 text-obsidian-400 hover:text-white transition"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="px-2 font-mono font-bold text-white text-xs">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateCartQuantity(item.id, 1)}
                      className="p-1.5 text-obsidian-400 hover:text-white transition"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeFromCart(item.id)}
                    className="p-1.5 text-obsidian-500 hover:text-ruby-400 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Dados do Cliente e Endereço */}
          <form id="delivery-form" onSubmit={handleSubmitOrder} className="space-y-3 pt-2 border-t border-carbon-800">
            <span className="font-bold text-obsidian-300 uppercase tracking-wider text-[10px] block font-serif">
              Dados para Entrega:
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-obsidian-500">
                  <User className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  placeholder="Seu Nome Completo"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-obsidian-900 border border-carbon-700 text-white text-xs focus:ring-1 focus:ring-gold-500 focus:outline-none"
                  required
                />
              </div>

              <div className="relative">
                <span className="absolute left-3 top-2.5 text-obsidian-500">
                  <Phone className="w-3.5 h-3.5" />
                </span>
                <input
                  type="tel"
                  placeholder="WhatsApp (ex: 11 98765-4321)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-obsidian-900 border border-carbon-700 text-white text-xs focus:ring-1 focus:ring-gold-500 focus:outline-none"
                  required
                />
              </div>
            </div>

            {/* Bairro & Taxa */}
            <div>
              <label className="text-[11px] text-obsidian-400 font-semibold mb-1 block">
                Bairro de Entrega:
              </label>
              <select
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-obsidian-900 border border-carbon-700 text-white text-xs focus:ring-1 focus:ring-gold-500 focus:outline-none"
              >
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
                <span className="absolute left-3 top-2.5 text-obsidian-500">
                  <MapPin className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  placeholder="Rua / Avenida"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-obsidian-900 border border-carbon-700 text-white text-xs focus:ring-1 focus:ring-gold-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <input
                  type="text"
                  placeholder="Número"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-obsidian-900 border border-carbon-700 text-white text-xs focus:ring-1 focus:ring-gold-500 focus:outline-none"
                  required
                />
              </div>
            </div>

            {/* Complemento & Referência */}
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Complemento (Apto, Bloco)"
                value={complement}
                onChange={(e) => setComplement(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-obsidian-900 border border-carbon-700 text-white text-xs focus:ring-1 focus:ring-gold-500 focus:outline-none"
              />
              <input
                type="text"
                placeholder="Ponto de Referência"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-obsidian-900 border border-carbon-700 text-white text-xs focus:ring-1 focus:ring-gold-500 focus:outline-none"
              />
            </div>

            {/* Meio de Pagamento */}
            <div className="space-y-1.5 pt-1">
              <span className="font-bold text-obsidian-300 uppercase tracking-wider text-[10px] block font-serif">
                Forma de Pagamento:
              </span>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('PIX')}
                  className={`py-2.5 rounded-xl font-bold flex flex-col items-center gap-1 transition ${
                    paymentMethod === 'PIX'
                      ? 'btn-emerald text-white shadow-md shadow-emerald-950/60'
                      : 'bg-carbon-800 text-obsidian-400 hover:bg-carbon-700'
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
                      ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-obsidian-950 font-black shadow-md shadow-cyan-950/60'
                      : 'bg-carbon-800 text-obsidian-400 hover:bg-carbon-700'
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
                      ? 'btn-gold text-obsidian-950 font-black shadow-md shadow-gold-950/60'
                      : 'bg-carbon-800 text-obsidian-400 hover:bg-carbon-700'
                  }`}
                >
                  <Banknote className="w-4 h-4" />
                  <span>Dinheiro</span>
                </button>
              </div>

              {paymentMethod === 'DINHEIRO' && (
                <div className="p-3 rounded-2xl bg-carbon-800/80 border border-carbon-700 flex items-center justify-between gap-2">
                  <span className="text-obsidian-300 text-xs">Precisa de troco para quanto?</span>
                  <input
                    type="text"
                    placeholder="Ex: 50,00"
                    value={cashChangeFor}
                    onChange={(e) => setCashChangeFor(e.target.value)}
                    className="w-24 px-2.5 py-1.5 rounded-xl bg-obsidian-900 border border-carbon-700 text-white font-mono text-xs text-right focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
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
                className="w-full px-3 py-2.5 rounded-xl bg-obsidian-900 border border-carbon-700 text-white text-xs focus:ring-1 focus:ring-gold-500 focus:outline-none"
              />
            </div>
          </form>

        </div>

        {/* Resumo Financeiro & Botão de Envio */}
        <div className="border-t border-carbon-800 pt-3.5 space-y-2 text-xs">
          <div className="flex justify-between text-obsidian-400">
            <span>Subtotal dos Itens:</span>
            <span className="font-mono text-obsidian-300 font-bold">{formatBRL(subtotal)}</span>
          </div>
          <div className="flex justify-between text-obsidian-400">
            <span>Taxa de Entrega ({neighborhood}):</span>
            <span className="font-mono text-obsidian-300 font-bold">{formatBRL(currentFee)}</span>
          </div>
          <div className="flex justify-between items-baseline pt-1.5 border-t border-carbon-800 font-bold text-white text-sm">
            <span className="font-serif">TOTAL DO PEDIDO:</span>
            <span className="text-2xl font-black text-gold-400 font-mono drop-shadow-md">
              {formatBRL(total)}
            </span>
          </div>

          <button
            form="delivery-form"
            type="submit"
            disabled={cart.length === 0 || isSubmitting}
            className="btn-ember w-full py-4 rounded-2xl text-obsidian-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-ember-950/60"
          >
            <Send className="w-4 h-4" />
            <span>{isSubmitting ? 'Enviando Pedido...' : 'Confirmar e Enviar Pedido'}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
