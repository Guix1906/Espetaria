import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { useDeliveryStore } from '../../stores/useDeliveryStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import type { DeliveryOrder } from '../../types/domain';
import { OrderStatusView } from './OrderStatusView';

const REFRESH_MS = 15_000;

/** Converte a resposta pública (sem telefone nem dados internos) no formato do pedido. */
function toOrder(data: Record<string, unknown>): DeliveryOrder {
  const d = data as Partial<DeliveryOrder> & { items?: Partial<DeliveryOrder['items'][number]>[] };
  return {
    id: String(d.id),
    order_number: Number(d.order_number),
    shift_id: '',
    order_type: d.order_type ?? 'DELIVERY',
    customer_name: d.customer_name ?? '',
    phone: '',
    address_street: d.address_street ?? '',
    address_number: d.address_number ?? '',
    address_neighborhood: d.address_neighborhood ?? '',
    address_complement: d.address_complement ?? null,
    address_reference: d.address_reference ?? null,
    delivery_fee: Number(d.delivery_fee ?? 0),
    subtotal: Number(d.subtotal ?? 0),
    total: Number(d.total ?? 0),
    payment_method: d.payment_method ?? 'PIX',
    cash_change_for: d.cash_change_for != null ? Number(d.cash_change_for) : null,
    status: d.status ?? 'CONFIRMED',
    notes: null,
    driver_name: d.driver_name ?? null,
    created_at: d.created_at ?? new Date().toISOString(),
    confirmed_at: null,
    ready_at: d.ready_at ?? null,
    dispatched_at: d.dispatched_at ?? null,
    delivered_at: d.delivered_at ?? null,
    paid_at: d.paid_at ?? null,
    cancel_reason: d.cancel_reason ?? null,
    pix_qr_code: d.pix_qr_code ?? null,
    pix_expires_at: d.pix_expires_at ?? null,
    items: (d.items ?? []).map((i, index) => ({
      id: String(i.id ?? index),
      delivery_order_id: String(d.id),
      product_id: '',
      product_name: i.product_name ?? '',
      unit_price: Number(i.unit_price ?? 0),
      quantity: Number(i.quantity ?? 0),
      doneness: i.doneness ?? null,
      notes: i.notes ?? null,
      sector: 'KITCHEN',
    })),
  };
}

/**
 * Página pública de acompanhamento (#/pedido/<id>), aberta pelo link da mensagem
 * de WhatsApp. Funciona em qualquer aparelho, sem login e sem ter feito o pedido nele.
 */
export function PublicOrderTrackingPage({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<DeliveryOrder | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'not_found' | 'error'>('loading');
  const restaurant = useSettingsStore((s) => s.settings.name);

  useEffect(() => {
    document.title = 'Seu pedido | Ponto';
    void useSettingsStore.getState().loadRemoteSettings();
    if (!isSupabaseConfigured) {
      // Demonstração local: procura nos pedidos deste aparelho
      const local = useDeliveryStore.getState().deliveryOrders.find((o) => o.id === orderId);
      setOrder(local ?? null);
      setState(local ? 'ready' : 'not_found');
      return;
    }
    let stopped = false;
    let timer = 0;
    const load = async () => {
      const { data, error } = await supabase.rpc('get_delivery_tracking', { p_order_id: orderId });
      if (stopped) return;
      if (error) {
        // UUID inválido também cai aqui: trata como pedido não encontrado
        // Falha passageira com o pedido já na tela: mantém o que já foi mostrado
        setState((prev) => (error.code === '22P02' ? 'not_found' : prev === 'ready' ? 'ready' : 'error'));
      } else if (!data) {
        setState('not_found');
      } else {
        const next = toOrder(data as Record<string, unknown>);
        setOrder(next);
        setState('ready');
        if (next.status === 'DELIVERED' || next.status === 'CANCELLED') return;
      }
      timer = window.setTimeout(() => void load(), REFRESH_MS);
    };
    void load();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [orderId]);

  return (
    <div className="min-h-screen bg-[#FBF8F3] text-[#2B211C]">
      <header className="border-b border-[#E4DACB]">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between gap-3 px-5">
          <span className="truncate text-[17px] font-semibold">{restaurant}</span>
          <span className="text-[13px] text-[#6B5D53]">Acompanhar pedido</span>
        </div>
      </header>
      <main className="mx-auto max-w-xl space-y-5 px-5 pb-10 pt-6">
        {state === 'loading' && <p className="p-8 text-center text-[#6B5D53]" role="status">Carregando seu pedido...</p>}
        {state === 'error' && <p role="alert" className="rounded-[10px] bg-[#FBEDED] p-3 text-[14px] text-[#9B2C2C]">Não foi possível carregar o pedido agora. Verifique sua internet e tente de novo.</p>}
        {state === 'not_found' && (
          <div className="space-y-3 rounded-[12px] border border-[#E4DACB] bg-white p-6 text-center">
            <h1 className="text-[20px] font-semibold">Pedido não encontrado</h1>
            <p className="text-[15px] text-[#6B5D53]">Confira se o link está completo ou fale com a gente pelo WhatsApp.</p>
            <a href="/cardapio" className="inline-flex h-12 items-center rounded-[12px] bg-[#B5502E] px-5 text-[16px] font-semibold text-white">Ver cardápio</a>
          </div>
        )}
        {state !== 'not_found' && order && (
          <>
            <OrderStatusView order={order} />
            <a href="/cardapio" className="flex h-[52px] w-full items-center justify-center rounded-[12px] text-[16px] font-semibold text-[#8E3C20]">Ver cardápio</a>
          </>
        )}
      </main>
    </div>
  );
}
