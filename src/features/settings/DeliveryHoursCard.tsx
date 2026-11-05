import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { isOverrideActive, isWithinStoreHours, localDateKey } from '../../lib/storeHours';

/**
 * Horário do delivery (18h–23h, fechado às quartas) e a exceção "só hoje".
 * O banco recusa pedido fora do horário (00058); este botão libera o dia inteiro, uma vez.
 */
export function DeliveryHoursCard() {
  const override = useSettingsStore((s) => s.settings.delivery_open_override_date);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(id); }, []);

  const overrideOn = isOverrideActive(now, override);
  const inHours = isWithinStoreHours(now);

  return (
    <section className="surface-card max-w-2xl space-y-3 p-4 sm:p-5" aria-labelledby="delivery-hours-title">
      <div>
        <h3 id="delivery-hours-title" className="text-base font-bold text-ink">Horário do delivery</h3>
        <p className="text-sm text-ink-muted">
          O cardápio só aceita pedido das 18h às 23h e fica fechado às quartas, mesmo se o turno ficar aberto.
        </p>
      </div>
      <p className="text-base text-ink">
        {overrideOn
          ? 'Hoje o delivery está liberado o dia todo (exceção). Amanhã volta ao horário normal sozinho.'
          : inHours ? 'Agora: dentro do horário.' : 'Agora: fora do horário — o cardápio está fechado para pedidos.'}
      </p>
      {overrideOn ? (
        <Button variant="secondary" onClick={() => updateSettings({ delivery_open_override_date: null })}>
          Voltar ao horário normal
        </Button>
      ) : (
        <Button variant="secondary" onClick={() => updateSettings({ delivery_open_override_date: localDateKey(now) })}>
          Abrir delivery hoje mesmo assim
        </Button>
      )}
      <p className="text-sm text-ink-muted">O turno também precisa estar aberto para o cardápio aceitar pedidos.</p>
    </section>
  );
}
