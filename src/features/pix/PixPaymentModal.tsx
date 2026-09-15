import { AlertCircle, Check, CheckCircle2, Clock3, Copy, MessageCircle, QrCode, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Dialog } from '../../components/ui/Dialog';
import { audioService } from '../../lib/audio';
import { formatBRL } from '../../lib/formatters';
import { generatePixPayload, generateQRCodeMatrix } from '../../lib/pix';
import { buildTableBillWhatsAppMessage, buildWhatsAppLink } from '../../lib/whatsapp';

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

function PixPaymentContent({ onClose, amount, tableNumber, customerName, customerPhone, subtotal, serviceFee = 0, txId, onPaymentConfirmed }: Omit<PixPaymentModalProps, 'isOpen'>) {
  const [generatedTxId] = useState(() => `ESP${Date.now().toString().slice(-6)}`);
  const transactionId = txId || generatedTxId;
  const [copied, setCopied] = useState(false);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(900);
  const [isConfirming, setIsConfirming] = useState(false);
  const [phoneForZap, setPhoneForZap] = useState(customerPhone || '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pixKey = 'contato@espetariasabor.com.br';
  const pixPayload = generatePixPayload({ pixKey, merchantName: 'ESPETARIA SABOR DA CARNE', merchantCity: 'SAO PAULO', amount, txId: transactionId, description: tableNumber ? `Mesa ${tableNumber}` : 'Pedido Espetaria' });
  const matrix = generateQRCodeMatrix(pixPayload);
  const amountIsValid = Number.isFinite(amount) && amount > 0;

  useEffect(() => {
    const interval = window.setInterval(() => setTimeLeftSeconds((previous) => Math.max(0, previous - 1)), 1000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const handleCopy = async () => {
    setErrorMessage(null);
    try {
      await navigator.clipboard.writeText(pixPayload);
      setCopied(true);
    } catch {
      setCopied(false);
      setErrorMessage('Não foi possível copiar automaticamente. Selecione e copie o código no campo abaixo.');
    }
  };
  const handleConfirmPayment = () => {
    if (!amountIsValid) { setErrorMessage('Informe um valor de pagamento maior que zero.'); return; }
    setIsConfirming(true);
    setErrorMessage(null);
    try {
      onPaymentConfirmed(amount, transactionId);
      audioService.playPaymentSuccessSound();
      onClose();
    } catch (error: unknown) {
      setIsConfirming(false);
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível registrar o pagamento.');
    }
  };
  const handleSendWhatsApp = () => {
    const message = buildTableBillWhatsAppMessage({ tableNumber: tableNumber || 1, customerName, subtotal: subtotal ?? amount, serviceFee, total: amount, pixPayload, pixKey });
    window.open(buildWhatsAppLink(phoneForZap, message), '_blank', 'noopener,noreferrer');
  };

  return (
    <Dialog label="Pagamento por PIX" onClose={onClose} placement="sheet">
      <div className="dialog-panel flex w-full max-w-md flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-line p-5"><div className="flex items-start gap-3"><span className="icon-tile"><QrCode className="h-5 w-5" aria-hidden="true" /></span><div><h2 className="font-semibold text-ink">Pagamento por PIX</h2><p className="mt-1 break-all text-xs text-ink-muted">Identificador: {transactionId}</p></div></div><button type="button" onClick={onClose} className="icon-button" aria-label="Fechar pagamento PIX"><X className="h-5 w-5" /></button></div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="text-center"><p className="text-sm text-ink-muted">Valor a receber</p><p className="mt-1 text-3xl font-bold text-brand-800 tabular-nums">{formatBRL(amount)}</p>{tableNumber && <p className="mt-2 text-xs text-ink-muted">Mesa {tableNumber}{customerName ? ` · ${customerName}` : ''}</p>}</div>
          <div className="notice border-amber-200 bg-amber-50 text-amber-900"><AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" /><p className="text-xs leading-relaxed">O QR abaixo é uma prévia ilustrativa. Para pagar, use o código <strong>PIX Copia e Cola</strong>. O recebimento deve ser conferido no banco pelo operador.</p></div>
          <div className="mx-auto w-fit rounded-2xl border border-line bg-white p-4"><svg viewBox={`-4 -4 ${matrix.length + 8} ${matrix.length + 8}`} className="h-44 w-44" shapeRendering="crispEdges" role="img" aria-label="Prévia ilustrativa do QR Code; utilize o código PIX Copia e Cola">{matrix.map((row, y) => row.map((isDark, x) => isDark ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#0d2f2c" /> : null))}</svg></div>
          <div className="flex items-center justify-center gap-2 text-xs text-ink-muted"><Clock3 className="h-4 w-4" aria-hidden="true" /><span>Tempo da sessão</span><span className="font-semibold tabular-nums">{String(Math.floor(timeLeftSeconds / 60)).padStart(2, '0')}:{String(timeLeftSeconds % 60).padStart(2, '0')}</span></div>
          {errorMessage && <div className="notice border-rose-200 bg-rose-50 text-rose-800" role="alert">{errorMessage}</div>}
          {!amountIsValid && <div className="notice border-rose-200 bg-rose-50 text-rose-800" role="alert">O valor do pagamento precisa ser maior que zero.</div>}
          <div><button type="button" onClick={handleCopy} className={`${copied ? 'btn-success' : 'btn-primary'} w-full`}>{copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}{copied ? 'Código copiado' : 'Copiar código PIX'}</button><label htmlFor="pix-payload" className="mb-2 mt-4 block text-xs font-medium text-ink-muted">PIX Copia e Cola</label><textarea id="pix-payload" readOnly value={pixPayload} onFocus={(event) => event.currentTarget.select()} rows={3} className="w-full break-all rounded-xl border border-line-strong p-3 font-mono text-xs text-ink-secondary" /><p className="mt-2 text-xs text-ink-muted">Cole o código na opção PIX Copia e Cola do aplicativo do banco.</p></div>
          <div className="border-t border-line pt-4"><label htmlFor="pix-phone" className="mb-2 block text-sm font-medium">Enviar cobrança por WhatsApp</label><div className="flex items-center gap-2"><input id="pix-phone" type="tel" value={phoneForZap} onChange={(event) => setPhoneForZap(event.target.value)} placeholder="(DDD) 99999-9999" className="min-w-0 flex-1 rounded-xl border border-line-strong px-3 py-2.5 text-sm" /><button type="button" disabled={!phoneForZap.trim()} onClick={handleSendWhatsApp} className="btn-success shrink-0 px-3" aria-label="Enviar cobrança por WhatsApp"><MessageCircle className="h-5 w-5" aria-hidden="true" /></button></div></div>
        </div>
        <div className="space-y-3 border-t border-line p-5"><p className="text-xs leading-relaxed text-ink-muted">Confirme apenas após verificar o recebimento. Este botão registra o pagamento manualmente; não consulta o banco.</p><button type="button" disabled={isConfirming || !amountIsValid} onClick={handleConfirmPayment} className="btn-success w-full py-3"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{isConfirming ? 'Registrando pagamento...' : 'Confirmar recebimento manual'}</button></div>
      </div>
    </Dialog>
  );
}

export function PixPaymentModal({ isOpen, ...props }: PixPaymentModalProps) {
  if (!isOpen) return null;
  return <PixPaymentContent {...props} />;
}
