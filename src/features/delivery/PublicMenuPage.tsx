import { useEffect, useState } from 'react';
import { isSupabaseConfigured } from '../../lib/supabase';
import { useDeliveryStore } from '../../stores/useDeliveryStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { PublicMenuApp } from './PublicMenuApp';

/**
 * Cardápio digital público (link enviado pelo WhatsApp).
 * Não exige login: lê o cardápio e envia pedidos por funções públicas do banco,
 * que validam preço, bairro e estoque no servidor.
 */
export function PublicMenuPage() {
  const { loadPublicMenu, refreshTrackingStatus } = useDeliveryStore();
  const restaurant = useSettingsStore((s) => s.settings.name);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    document.title = `Cardápio | ${restaurant}`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', `Peça online: espetos na brasa, porções e bebidas de ${restaurant}. Entrega ou retirada.`);
  }, [restaurant]);

  useEffect(() => {
    void useSettingsStore.getState().loadRemoteSettings();
    const load = () => loadPublicMenu().then(() => setError(null)).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
    void load();
    // Mantém disponibilidade de produtos e status do pedido atualizados
    const menuTimer = window.setInterval(load, 60_000);
    const trackingTimer = window.setInterval(() => void refreshTrackingStatus(), 15_000);
    return () => { window.clearInterval(menuTimer); window.clearInterval(trackingTimer); };
  }, [loadPublicMenu, refreshTrackingStatus]);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#FBF8F3] text-[16px] text-[#6B5D53]" role="status">Carregando cardápio...</div>;
  return (
    <>
      {error && <p role="alert" className="bg-[#FBEDED] px-5 py-3 text-[14px] text-[#9B2C2C]">{error}</p>}
      <PublicMenuApp />
    </>
  );
}
