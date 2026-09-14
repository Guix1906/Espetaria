import { Dialog } from '../../components/ui/Dialog';
import React, { useState, useEffect } from 'react';
import { 
  QrCode, 
  Copy, 
  Check, 
  Clock, 
  MessageCircle, 
  Sparkles, 
  ShieldCheck, 
  CheckCircle2,
  X
} from 'lucide-react';
import { generatePixPayload, generateQRCodeMatrix } from '../../lib/pix';
import { formatBRL } from '../../lib/formatters';
import { buildWhatsAppLink, buildTableBillWhatsAppMessage } from '../../lib/whatsapp';
import { audioService } from '../../lib/audio';

interface PixPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  tableNumber?: number;
  customerName?: string | null;
  customerPhone?: string | null;
  subtotal?: number;
  serviceFee?: number;
  txId?: string;
  onPaymentConfirmed: (amount: number, txId: string) => void;
}

export const PixPaymentModal: React.FC<PixPaymentModalProps> = ({
  isOpen,
  onClose,
  amount,
  tableNumber,
  customerName,
  customerPhone,
  subtotal,
  serviceFee = 0,
  txId = `ESP${Date.now().toString().slice(-6)}`,
  onPaymentConfirmed,
}) => {
  const [copied, setCopied] = useState(false);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(900); // 15 minutos
  const [isSimulatingPayment, setIsSimulatingPayment] = useState(false);
  const [phoneForZap, setPhoneForZap] = useState(customerPhone || '');

  const pixKey = 'contato@espetariasabor.com.br';
  const merchantName = 'ESPETARIA SABOR DA CARNE';
  const merchantCity = 'SAO PAULO';

  const pixPayload = generatePixPayload({
    pixKey,
    merchantName,
    merchantCity,
    amount,
    txId,
    description: tableNumber ? `Mesa ${tableNumber}` : 'Pedido Espetaria',
  });

  const matrix = generateQRCodeMatrix(pixPayload);

  // Timer regressivo de expiração do PIX
  useEffect(() => {
    if (!isOpen) {
      setTimeLeftSeconds(900);
      setIsSimulatingPayment(false);
      return;
    }

    const interval = setInterval(() => {
      setTimeLeftSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const minutes = Math.floor(timeLeftSeconds / 60);
  const seconds = timeLeftSeconds % 60;
  const formattedTimer = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pixPayload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback manual se clipboard API falhar
      const textarea = document.createElement('textarea');
      textarea.value = pixPayload;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleSimulateWebhook = () => {
    setIsSimulatingPayment(true);
    audioService.playPaymentSuccessSound();

    setTimeout(() => {
      setIsSimulatingPayment(false);
      onPaymentConfirmed(amount, txId);
      onClose();
    }, 800);
  };

  const handleSendZap = () => {
    if (!phoneForZap) return;
    const msg = buildTableBillWhatsAppMessage({
      tableNumber: tableNumber || 1,
      customerName,
      subtotal: subtotal || amount,
      serviceFee,
      total: amount,
      pixPayload,
      pixKey,
    });
    const link = buildWhatsAppLink(phoneForZap, msg);
    window.open(link, '_blank');
  };

  return (
    <Dialog label="Pagamento por PIX" onClose={onClose}>
      <div className="dialog-panel bg-surface-muted border border-line w-full max-w-md rounded-2xl shadow-card overflow-hidden flex flex-col max-h-[92vh] text-ink zoom-in-95 duration-200">
        
        {/* Cabeçalho PIX */}
        <div className="bg-emerald-700 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-surface-muted flex items-center justify-center backdrop-blur-xs shadow-card">
              <QrCode className="w-5 h-5 text-inherit" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2 font-sans">
                PIX Dinâmico Instantâneo
                <span className="text-xs bg-emerald-700 text-white font-bold px-2 py-0.5 rounded-full">BACEN</span>
              </h2>
              <p className="text-xs text-inherit tabular-nums">TxID: {txId}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-surface-muted text-inherit hover:text-inherit transition"
           type="button" aria-label="Fechar janela">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-6 overflow-y-auto space-y-4 text-center">
          
          {/* Valor a Pagar */}
          <div>
            <div className="text-xs font-semibold text-ink-muted">Valor do Pagamento</div>
            <div className="text-3xl font-bold tabular-nums text-ink mt-0.5">
              {formatBRL(amount)}
            </div>
            {tableNumber && (
              <div className="text-xs text-ink-muted mt-1">
                Mesa {tableNumber} {customerName ? `• ${customerName}` : ''}
              </div>
            )}
          </div>

          {/* QR Code SVG Interativo */}
          <div className="flex justify-center my-2">
            <div className="bg-surface-muted p-4 rounded-2xl shadow-card border-2 border-emerald-200 inline-block relative">
              <svg 
                viewBox={`0 0 ${matrix.length} ${matrix.length}`} 
                className="w-48 h-48 sm:w-52 sm:h-52"
                shapeRendering="crispEdges"
              >
                {matrix.map((row, y) =>
                  row.map((isDark, x) =>
                    isDark ? (
                      <rect
                        key={`${x}-${y}`}
                        x={x}
                        y={y}
                        width="1"
                        height="1"
                        fill="#065f46" // Verde esmeralda escuro e nítido
                      />
                    ) : null
                  )
                )}
              </svg>

              {/* Logo / Badge central */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-emerald-700 w-9 h-9 rounded-xl flex items-center justify-center shadow-card border-2 border-line">
                  <Sparkles className="w-4 h-4 text-ink" />
                </div>
              </div>
            </div>
          </div>

          {/* Timer de Expiração */}
          <div className="flex items-center justify-center gap-2 text-xs text-ink-muted">
            <Clock className="w-4 h-4 text-brand-700" style={{ animationDuration: '6s' }} />
            <span>Este QR Code expira em: </span>
            <span className="tabular-nums font-bold text-brand-700">{formattedTimer}</span>
          </div>

          {/* Botão PIX Copia e Cola */}
          <div className="space-y-1.5">
            <button
              onClick={handleCopy}
              className={`w-full py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition shadow-sm ${
                copied
                  ? 'btn-success text-white'
                  : 'bg-surface-muted hover:bg-surface-muted border border-line text-ink'
              }`}
             type="button">
              {copied ? (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  Código Copiado com Sucesso!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copiar Código PIX (Copia e Cola)
                </>
              )}
            </button>
            <p className="text-xs text-ink-muted">
              Cole no aplicativo do seu banco na opção "PIX Copia e Cola".
            </p>
          </div>

          {/* Notificação via WhatsApp */}
          <div className="pt-3 border-t border-line text-left space-y-2">
            <label className="block text-xs font-semibold text-ink font-sans">
              Enviar cobrança com QR Code no WhatsApp:
            </label>
            <div className="flex gap-2">
              <input
                type="tel"
                value={phoneForZap}
                onChange={(e) => setPhoneForZap(e.target.value)}
                placeholder="(DDD) 99999-9999"
                className="flex-1 bg-surface-muted border border-line rounded-xl px-3.5 py-2.5 text-xs text-ink placeholder-ink-muted focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 tabular-nums"
               aria-label="WhatsApp para envio da cobrança"/>
              <button
                type="button"
                onClick={handleSendZap}
                disabled={!phoneForZap}
                className="px-4 py-2.5 btn-success text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 shadow-sm"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Zap</span>
              </button>
            </div>
          </div>

          {/* Webhook & Confirmação Instantânea */}
          <div className="pt-3 border-t border-line space-y-2.5">
            <div className="flex items-center justify-center gap-2 text-xs text-ink-muted">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              <span>Aguardando liquidação BACEN em tempo real...</span>
            </div>

            <button
              type="button"
              onClick={handleSimulateWebhook}
              disabled={isSimulatingPayment}
              className="btn-success w-full py-3.5 px-4 rounded-2xl text-white font-bold text-sm shadow-card flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>{isSimulatingPayment ? 'Confirmando no Banco...' : 'Confirmar Pagamento Imediato'}</span>
            </button>
          </div>

        </div>

      </div>
    </Dialog>
  );
};
