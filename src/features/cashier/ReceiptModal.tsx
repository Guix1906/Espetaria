import { CheckCircle2,Printer,X } from 'lucide-react';
import React from 'react';
import { Dialog } from '../../components/ui/Dialog';
import { formatBRL,formatDoneness } from '../../lib/formatters';
import { OrderItem,Payment,RestaurantTable,Tab } from '../../types/domain';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  tab: Tab;
  table?: RestaurantTable;
  items: OrderItem[];
  payments: Payment[];
  cashChange?: number;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  onClose,
  tab,
  table,
  items,
  payments,
  cashChange = 0,
}) => {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const activeItems = items.filter((i) => i.status !== 'CANCELLED');

  return (
    <Dialog label="Cupom da comanda" onClose={onClose}>
      <div className="dialog-panel bg-surface-muted border border-line rounded-2xl w-full max-w-md p-5 sm:p-6 shadow-card space-y-4 max-h-[95vh] flex flex-col fade-in zoom-in-95">
        
        {/* Topo do Modal */}
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-700" />
            <span className="font-sans">Conta Encerrada com Sucesso</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-muted transition"
           type="button" aria-label="Fechar janela">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cupom Térmico Formatado (Estilo Impressora 80mm / Recibo Não Fiscal) */}
        <div className="overflow-y-auto flex-1 bg-amber-50/95 text-stone-900 rounded-2xl p-5 font-mono text-xs shadow-inner select-all print-section space-y-3 border border-stone-300">
          
          {/* Cabeçalho do Cupom */}
          <div className="text-center space-y-0.5 border-b border-dashed border-stone-400 pb-3">
            <h2 className="font-black text-base tracking-wider uppercase font-brand text-stone-950">
              ESPETARIA SABOR DA CARNE
            </h2>
            <p className="text-[11px] text-stone-700 font-sans font-medium">
              O autêntico espetinho na brasa & acompanhamentos
            </p>
            <p className="text-[10px] text-stone-500">
              CNPJ: 12.345.678/0001-90 • Inscr. Est.: Isento
            </p>
            <p className="text-[10px] text-stone-500">
              Av. Principal dos Espetos, 1500 — Centro
            </p>
            <p className="text-[10px] text-stone-700 font-bold">
              WhatsApp / Pedidos: (11) 98765-4321
            </p>
          </div>

          {/* Dados da Operação */}
          <div className="border-b border-dashed border-stone-400 pb-2 space-y-0.5 text-[11px]">
            <div className="flex justify-between font-bold">
              <span>CUPOM NÃO FISCAL</span>
              <span>MESA {table ? String(table.number).padStart(2, '0') : '??'}</span>
            </div>
            <div className="flex justify-between">
              <span>Comanda: #{tab.id.slice(0, 8)}</span>
              <span>{tab.customer_name}</span>
            </div>
            <div className="flex justify-between text-stone-600 text-[10px]">
              <span>Data: {new Date(tab.closed_at || tab.opened_at).toLocaleDateString('pt-BR')}</span>
              <span>Hora: {new Date(tab.closed_at || tab.opened_at).toLocaleTimeString('pt-BR')}</span>
            </div>
          </div>

          {/* Discriminação dos Itens */}
          <div className="border-b border-dashed border-stone-400 pb-2.5 space-y-1 text-[11px]">
            <div className="flex justify-between font-bold border-b border-stone-300 pb-1 text-[10px]">
              <span>ITEM / DESCRIÇÃO</span>
              <span>TOTAL</span>
            </div>
            {activeItems.map((item, idx) => (
              <div key={item.id} className="space-y-0.5">
                <div className="flex justify-between items-start">
                  <span className="pr-2 leading-tight">
                    {String(idx + 1).padStart(2, '0')} {item.quantity}x {item.product_name}
                  </span>
                  <span className="font-bold whitespace-nowrap font-mono">
                    {formatBRL(item.unit_price * item.quantity)}
                  </span>
                </div>
                {item.doneness && (
                  <div className="text-[10px] text-stone-600 pl-4">
                    Ponto: {formatDoneness(item.doneness)}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Resumo Financeiro */}
          <div className="border-b border-dashed border-stone-400 pb-2.5 space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span>SUBTOTAL:</span>
              <span className="font-bold">{formatBRL(tab.subtotal)}</span>
            </div>
            {tab.service_fee > 0 && (
              <div className="flex justify-between text-stone-700">
                <span>TAXA DE SERVIÇO (10%):</span>
                <span>{formatBRL(tab.service_fee)}</span>
              </div>
            )}
            {tab.discount > 0 && (
              <div className="flex justify-between text-rose-700 font-semibold">
                <span>DESCONTO CONCEDIDO:</span>
                <span>- {formatBRL(tab.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-black pt-1 border-t border-stone-400">
              <span>TOTAL A PAGAR:</span>
              <span>{formatBRL(tab.total)}</span>
            </div>
          </div>

          {/* Formas de Pagamento Registradas */}
          <div className="border-b border-dashed border-stone-400 pb-2 space-y-1 text-[11px]">
            <div className="font-bold text-[10px] uppercase text-stone-700">
              Formas de Pagamento Recebidas:
            </div>
            {payments.map((p) => (
              <div key={p.id} className="flex justify-between">
                <span>{p.method}:</span>
                <span className="font-bold">{formatBRL(p.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold pt-0.5 text-stone-900">
              <span>TOTAL PAGO:</span>
              <span>{formatBRL(totalPaid)}</span>
            </div>
            {cashChange > 0 && (
              <div className="flex justify-between text-emerald-800 font-bold bg-emerald-100/70 px-1 py-0.5 rounded">
                <span>TROCO DEVOLVIDO:</span>
                <span>{formatBRL(cashChange)}</span>
              </div>
            )}
          </div>

          {/* Rodapé do Cupom */}
          <div className="text-center pt-2 text-[10px] text-stone-600 space-y-1">
            <p className="font-bold text-stone-800">OBRIGADO PELA PREFERÊNCIA!</p>
            <p>Volte sempre à Espetaria Sabor da Carne!</p>
            <p className="text-[9px] text-stone-400 font-mono">Sistema Espetaria Pro • Sabor da Carne</p>
          </div>

        </div>

        {/* Botões de Ação */}
        <div className="flex gap-2.5 pt-1">
          <button
            onClick={handlePrint}
            className="btn-primary flex-1 py-3 rounded-2xl text-xs flex items-center justify-center gap-2"
           type="button">
            <Printer className="w-4 h-4" />
            <span>Imprimir Cupom Térmico</span>
          </button>
          <button
            onClick={onClose}
            className="btn-secondary px-5 py-3 rounded-2xl text-xs font-bold"
           type="button">
            Concluir
          </button>
        </div>

      </div>
    </Dialog>
  );
};
