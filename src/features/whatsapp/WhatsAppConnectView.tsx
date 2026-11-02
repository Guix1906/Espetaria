import { ExternalLink, MessageCircle, QrCode, RefreshCw, Unplug } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { PageHeader } from '../../components/ui/PageHeader';
import { isSupabaseConfigured } from '../../lib/supabase';
import { useWhatsAppStatus, whatsAppAction } from './useWhatsAppStatus';

/** O QR do WhatsApp vence em cerca de 40 s; pedimos outro antes disso. */
const QR_REFRESH_MS = 30000;
const STATUS_WHILE_SCANNING_MS = 4000;

const formatPhone = (n: string) => {
  const m = n.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : n;
};

/** Liga o celular da loja ao sistema: é este WhatsApp que envia os avisos e atende pelo robô. */
export function WhatsAppConnectView({ embedded = false }: { embedded?: boolean }) {
  const confirm = useConfirm();
  const [qr, setQr] = useState<{ image: string | null; pairingCode: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { status, refresh } = useWhatsAppStatus(true, qr ? STATUS_WHILE_SCANNING_MS : 30000);
  const connected = !!status?.connected;

  const requestQr = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await whatsAppAction<{ qr: string | null; pairingCode: string | null }>('connect');
      setQr({ image: data.qr, pairingCode: data.pairingCode });
      if (!data.qr) void refresh();
    } catch (err) {
      setQr(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  // Celular leu o código: some o QR
  useEffect(() => { if (connected) setQr(null); }, [connected]);

  const scanning = !!qr && !connected;
  useEffect(() => {
    if (!scanning) return;
    const id = window.setInterval(() => void requestQr(), QR_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [scanning, requestQr]);

  const disconnect = async () => {
    const ok = await confirm({ title: 'Desconectar WhatsApp', message: 'Os clientes param de receber os avisos do pedido e o robô para de responder até você ler o QR Code de novo.', confirmText: 'Desconectar', variant: 'danger' });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await whatsAppAction('logout');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={embedded ? 'space-y-4' : 'page-layout'}>
      {!embedded && <PageHeader eyebrow="Atendimento" title="WhatsApp" description="Ligue o celular da loja ao sistema para enviar os avisos de pedido e atender pelo robô." icon={MessageCircle} />}

      <section className="surface-card max-w-3xl space-y-4 p-4 sm:p-5" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${connected ? 'bg-emerald-600' : 'bg-rose-600'}`} aria-hidden="true" />
            <div>
              <p className="text-base font-semibold text-ink">{!isSupabaseConfigured ? 'Modo demonstração' : !status ? 'Verificando...' : connected ? 'Conectado' : 'Desconectado'}</p>
              {connected && status?.number && <p className="font-mono text-sm text-ink-muted">{formatPhone(status.number)}{status.profileName ? ` · ${status.profileName}` : ''}</p>}
            </div>
          </div>
          {connected && <button type="button" className="btn-secondary min-h-[44px] text-rose-700" onClick={disconnect} disabled={busy}><Unplug className="h-4 w-4" aria-hidden="true" />Desconectar</button>}
        </div>

        {error && <p className="notice border-rose-200 bg-rose-50 text-rose-900" role="alert">Não foi possível falar com o WhatsApp. {error}</p>}

        {!isSupabaseConfigured && <p className="text-sm text-ink-muted">Na demonstração não há servidor, então o QR Code não é gerado.</p>}

        {isSupabaseConfigured && status && !connected && (
          <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
            <div className="flex h-64 w-64 max-w-full items-center justify-center rounded-md border border-line bg-white">
              {qr?.image ? <img src={qr.image} alt="QR Code para conectar o WhatsApp" className="h-full w-full object-contain p-2" /> : (
                <button type="button" className="btn-primary min-h-[44px]" onClick={requestQr} disabled={busy}><QrCode className="h-4 w-4" aria-hidden="true" />{busy ? 'Gerando...' : 'Gerar QR Code'}</button>
              )}
            </div>
            <div className="space-y-3 text-sm text-ink-secondary">
              <ol className="list-decimal space-y-2 pl-5">
                <li>Abra o WhatsApp no celular da loja.</li>
                <li>Toque em Aparelhos conectados e depois em Conectar um aparelho.</li>
                <li>Aponte a câmera para o código ao lado.</li>
              </ol>
              {qr?.pairingCode && <p>Código de conexão: <span className="font-mono font-semibold text-ink">{qr.pairingCode}</span></p>}
              {qr?.image && <p className="flex items-center gap-1.5 text-[13px] text-ink-muted"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />O código é trocado sozinho a cada 30 segundos.</p>}
            </div>
          </div>
        )}
      </section>

      {!embedded && <section className="surface-card flex max-w-3xl flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-ink">Ler e responder conversas</h2>
          <p className="text-sm text-ink-muted">O WhatsApp Web abre em outra aba, porque o WhatsApp não permite que ele fique dentro de outro sistema. Lá você lê um QR Code próprio.</p>
        </div>
        <a href="https://web.whatsapp.com" target="_blank" rel="noreferrer" className="btn-secondary min-h-[44px]"><ExternalLink className="h-4 w-4" aria-hidden="true" />Abrir WhatsApp Web</a>
      </section>}
    </div>
  );
}
