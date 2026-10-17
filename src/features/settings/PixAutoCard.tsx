import { BadgeCheck } from 'lucide-react';
import { useSettingsStore } from '../../stores/useSettingsStore';

/**
 * PIX automático do cardápio digital (Mercado Pago, Edge Function pix-mercadopago).
 * Ligado: pedido por PIX só imprime e vai para a brasa depois que o pagamento cai.
 */
export function PixAutoCard() {
  const { settings, updateSettings } = useSettingsStore();
  const enabled = !!settings.pix_auto_enabled;
  const minutes = settings.pix_auto_minutes ?? 15;

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="icon-tile"><BadgeCheck className="h-5 w-5" aria-hidden="true" /></span>
          <div>
            <h3 className="text-base font-bold text-ink">PIX automático no delivery (Mercado Pago)</h3>
            <p className="text-xs text-ink-muted">O cliente recebe um QR Code exclusivo do pedido. Quando o pagamento cai, o pedido imprime e vai para a brasa sozinho, sem precisar conferir no banco.</p>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-brand-900">
          <input type="checkbox" checked={enabled} onChange={(e) => updateSettings({ pix_auto_enabled: e.target.checked })} className="h-5 w-5 rounded border-line text-brand-700" />
          <span>{enabled ? 'Ativado' : 'Desativado'}</span>
        </label>
      </div>
      <label className="flex flex-wrap items-center gap-2 text-sm text-ink">
        <span>Prazo para pagar</span>
        <input
          type="number"
          min={5}
          max={60}
          value={minutes}
          onChange={(e) => updateSettings({ pix_auto_minutes: Math.min(60, Math.max(5, Number(e.target.value) || 15)) })}
          className="w-20 rounded-xl border border-line bg-surface px-3 py-2 text-sm tabular-nums"
          aria-label="Minutos para pagar o PIX"
        />
        <span>minutos. Depois disso o pedido é cancelado e os itens voltam ao estoque.</span>
      </label>
      <p className="text-xs text-ink-muted">Só ligue depois de cadastrar a chave do Mercado Pago (arquivo <strong>ATIVAR-PIX-MERCADOPAGO.bat</strong>). Desligado, o PIX continua como antes: QR Code da chave da loja e o caixa marca "PIX recebido".</p>
    </div>
  );
}
