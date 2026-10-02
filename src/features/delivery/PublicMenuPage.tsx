import { useEffect, useState } from 'react';
import { BrandMark } from '../../components/layout/BrandMark';
import { isSupabaseConfigured } from '../../lib/supabase';
import { useDeliveryStore } from '../../stores/useDeliveryStore';
import { DeliveryCatalogView } from './DeliveryCatalogView';

/**
 * Cardápio digital público (link enviado pelo WhatsApp).
 * Não exige login: lê o cardápio e envia pedidos por funções públicas do banco,
 * que validam preço, bairro e estoque no servidor.
 */
export function PublicMenuPage() {
  const { loadPublicMenu, refreshTrackingStatus } = useDeliveryStore();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    document.title = 'Cardápio | Sabor da Carne';
    const load = () => loadPublicMenu().then(() => setError(null)).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
    void load();
    // Mantém disponibilidade de produtos e status do pedido atualizados
    const menuTimer = window.setInterval(load, 60_000);
    const trackingTimer = window.setInterval(() => void refreshTrackingStatus(), 15_000);
    return () => { window.clearInterval(menuTimer); window.clearInterval(trackingTimer); };
  }, [loadPublicMenu, refreshTrackingStatus]);

  return (
    <div className="min-h-screen bg-canvas">
      <header className="app-header">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 p-4">
          <BrandMark />
          <span className="text-xs font-semibold text-ink-muted">Delivery</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl">
        {error && <p role="alert" className="notice m-4 border-rose-200 bg-rose-50 text-rose-800">{error}</p>}
        {loading ? <p className="p-8 text-center text-ink-muted" role="status">Carregando cardápio...</p> : <DeliveryCatalogView publicMode />}
      </main>
    </div>
  );
}
