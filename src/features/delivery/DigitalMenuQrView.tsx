import { ClipboardList, Copy, ExternalLink, Printer } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { PixQrCode } from '../pix/PixQrCode';

/** Cardápio digital no painel: link para abrir em outra aba e QR Code para imprimir nas mesas e no balcão. */
export function DigitalMenuQrView() {
  const storeName = useSettingsStore((s) => s.settings.name);
  const url = `${window.location.origin}/cardapio`;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* navegador sem permissão de área de transferência */ }
  };

  return (
    <div className="page-layout">
      <PageHeader
        eyebrow="Delivery e retirada"
        title="Cardápio digital"
        description="O cardápio que o cliente vê. Abra numa aba nova ou imprima o QR Code para as mesas e o balcão."
        icon={ClipboardList}
        actions={<a href={url} target="_blank" rel="noreferrer" className="btn-primary min-h-[44px] text-[15px]"><ExternalLink className="h-4 w-4" />Abrir cardápio</a>}
      />
      <section className="surface-card mx-auto w-full max-w-md p-6 text-center print:border-0 print:shadow-none" aria-label="QR Code do cardápio">
        {storeName && <p className="text-lg font-semibold text-ink">{storeName}</p>}
        <p className="mt-1 text-[15px] text-ink-secondary">Aponte a câmera para pedir pelo cardápio digital</p>
        <div className="mx-auto mt-4 flex w-fit rounded-2xl border border-line bg-white p-4">
          <PixQrCode payload={url} size={240} />
        </div>
        <p className="mt-3 break-all font-mono text-sm text-ink-muted">{url}</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center print:hidden">
          <button type="button" onClick={() => window.print()} className="btn-secondary min-h-[44px]"><Printer className="h-4 w-4" />Imprimir QR Code</button>
          <button type="button" onClick={() => void copy()} className="btn-secondary min-h-[44px]"><Copy className="h-4 w-4" />{copied ? 'Copiado' : 'Copiar link'}</button>
        </div>
      </section>
    </div>
  );
}
