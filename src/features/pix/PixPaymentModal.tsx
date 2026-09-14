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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="card-carbon border border-carbon-700 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Cabeçalho PIX */}
        <div className="bg-gradient-to-r from-emerald-700 via-teal-800 to-carbon-900 p-5 text-white flex items-center justify-between border-b border-carbon-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center backdrop-blur-xs shadow-md">
              <QrCode className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <h2 className="text-base font-black flex items-center gap-2 font-serif">
                PIX Dinâmico Instantâneo
                <span className="text-[10px] bg-emerald-400 text-obsidian-950 font-black px-2 py-0.5 rounded-full">BACEN</span>
              </h2>
              <p className="text-xs text-emerald-200/80 font-mono">TxID: {txId}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/10 text-emerald-200 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-6 overflow-y-auto space-y-4 text-center custom-scrollbar">
          
          {/* Valor a Pagar */}
          <div>
            <div className="text-xs font-semibold text-obsidian-400 uppercase tracking-wider">Valor do Pagamento</div>
            <div className="text-3xl font-black font-mono text-gold-400 mt-0.5 drop-shadow-md">
              {formatBRL(amount)}
            </div>
            {tableNumber && (
              <div className="text-xs text-obsidian-400 mt-1">
                Mesa {tableNumber} {customerName ? `• ${customerName}` : ''}
              </div>
            )}
          </div>

          {/* QR Code SVG Interativo */}
          <div className="flex justify-center my-2">
            <div className="bg-white p-4 rounded-3xl shadow-2xl border-2 border-emerald-500/40 inline-block relative">
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
                        fill="#064e3b" // Verde escuro elegante
                      />
                    ) : null
                  )
                )}
              </svg>

              {/* Logo / Badge central */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center shadow-lg border-2 border-white">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* Timer de Expiração */}
          <div className="flex items-center justify-center gap-2 text-xs text-obsidian-400">
            <Clock className="w-4 h-4 text-gold-400 animate-spin" style={{ animationDuration: '6s' }} />
            <span>Este QR Code expira em: </span>
            <span className="font-mono font-bold text-gold-400">{formattedTimer}</span>
          </div>

          {/* Botão PIX Copia e Cola */}
          <div className="space-y-1.5">
            <button
              onClick={handleCopy}
              className={`w-full py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition active:scale-98 shadow-md ${
                copied
                  ? 'btn-emerald text-white'
                  : 'btn-carbon text-gold-400 hover:text-white'
              }`}
            >
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
            <p className="text-[11px] text-obsidian-500">
              Cole no aplicativo do seu banco na opção "PIX Copia e Cola".
            </p>
          </div>

          {/* Notificação via WhatsApp */}
          <div className="pt-3 border-t border-carbon-800 text-left space-y-2">
            <label className="block text-xs font-semibold text-obsidian-300 font-serif">
              Enviar cobrança com QR Code no WhatsApp:
            </label>
            <div className="flex gap-2">
              <input
                type="tel"
                value={phoneForZap}
                onChange={(e) => setPhoneForZap(e.target.value)}
                placeholder="(DDD) 99999-9999"
                className="flex-1 bg-obsidian-900 border border-carbon-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-obsidian-500 focus:outline-none focus:border-emerald-500 font-mono"
              />
              <button
                type="button"
                onClick={handleSendZap}
                disabled={!phoneForZap}
                className="px-4 py-2.5 btn-emerald text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 shadow-md"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Zap</span>
              </button>
            </div>
          </div>

          {/* Webhook & Confirmação Instantânea */}
          <div className="pt-3 border-t border-carbon-800 space-y-2.5">
            <div className="flex items-center justify-center gap-2 text-xs text-obsidian-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Aguardando liquidação BACEN em tempo real...</span>
            </div>

            <button
              type="button"
              onClick={handleSimulateWebhook}
              disabled={isSimulatingPayment}
              className="btn-emerald w-full py-3.5 px-4 rounded-2xl text-white font-bold text-sm shadow-xl flex items-center justify-center gap-2 transition active:scale-98 disabled:opacity-50"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>{isSimulatingPayment ? 'Confirmando no Banco...' : 'Confirmar Pagamento Imediato'}</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
