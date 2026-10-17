import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** QR Code real (ISO/IEC 18004) do PIX Copia e Cola, legível por qualquer app de banco. */
export function PixQrCode({ payload, size = 208 }: { payload: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#2B211C', light: '#ffffff' } })
      .then((markup) => { if (active) { setSvg(markup); setFailed(false); } })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [payload]);

  if (failed) return <p className="text-center text-xs text-rose-700" role="alert">Não foi possível gerar o QR Code. Use o PIX Copia e Cola.</p>;

  return (
    <div
      className="mx-auto rounded-2xl border border-line bg-white p-2"
      style={{ width: size, height: size }}
      role="img"
      aria-label="QR Code do pagamento PIX"
      // SVG gerado localmente pela biblioteca qrcode a partir do payload PIX
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
