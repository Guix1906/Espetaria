// ============================================================================
// EDGE FUNCTION: pix-mercadopago
// PIX automático do cardápio digital: gera o QR Code do pedido no Mercado Pago e,
// quando o pagamento é aprovado, libera o pedido para a produção (imprime e vai
// para a brasa) via release_paid_delivery_order.
// Deploy: supabase functions deploy pix-mercadopago --no-verify-jwt
//
// Chamadas:
//   POST ?action=create   { order_id }  -> QR Code (cria no Mercado Pago na 1ª vez)
//   POST ?action=check    { order_id }  -> consulta o pagamento (reserva se o aviso falhar)
//   POST ?action=webhook&token=<PIX_WEBHOOK_TOKEN>  -> aviso do Mercado Pago
//
// Secrets (Edge Functions > Secrets):
//   MP_ACCESS_TOKEN     Access Token de PRODUÇÃO do Mercado Pago (Suas integrações > Credenciais)
//   PIX_WEBHOOK_TOKEN   senha do aviso (qualquer texto longo; vai na URL de notificação)
//   MP_PAYER_EMAIL      opcional; e-mail usado como pagador (o Mercado Pago exige um)
// ============================================================================
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { buildPaymentBody, isApprovedFor, type MpPayment, parseWebhookPaymentId, type PixOrder } from './logic.ts';

const MP_API = 'https://api.mercadopago.com/v1/payments';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function admin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function mp(path: string, init: RequestInit = {}): Promise<MpPayment> {
  const res = await fetch(`${MP_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${Deno.env.get('MP_ACCESS_TOKEN')}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Mercado Pago ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body as MpPayment;
}

async function loadOrder(db: SupabaseClient, id: string) {
  const { data, error } = await db.from('delivery_orders')
    .select('id, order_number, total, status, customer_name, phone, paid_at, pix_provider_id, pix_qr_code, pix_expires_at')
    .eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as (PixOrder & { paid_at: string | null; pix_provider_id: string | null; pix_qr_code: string | null; pix_expires_at: string | null }) | null;
}

/** Libera o pedido se o pagamento estiver aprovado. Devolve true quando pago. */
async function settle(db: SupabaseClient, payment: MpPayment): Promise<boolean> {
  const orderId = payment.external_reference;
  if (!orderId) return false;
  const order = await loadOrder(db, orderId);
  if (!order || !isApprovedFor(payment, order)) return false;
  const { error } = await db.rpc('release_paid_delivery_order', {
    p_order_id: order.id, p_provider_id: String(payment.id), p_amount: payment.transaction_amount,
  });
  if (error) throw new Error(error.message);
  return true;
}

async function create(db: SupabaseClient, orderId: string, functionUrl: string) {
  await db.rpc('expire_unpaid_pix_orders');
  const order = await loadOrder(db, orderId);
  if (!order) return json({ error: 'Pedido não encontrado.' }, 404);
  if (order.status !== 'AWAITING_PAYMENT') return json({ status: order.status, paid: !!order.paid_at });
  if (order.pix_qr_code && order.pix_expires_at && new Date(order.pix_expires_at) > new Date()) {
    return json({ status: order.status, qr_code: order.pix_qr_code, expires_at: order.pix_expires_at });
  }

  const { data: settings } = await db.from('restaurant_settings').select('name, pix_auto_minutes').limit(1).maybeSingle();
  // Expira 1 min antes do cancelamento automático do pedido
  const minutes = Math.max(5, Number(settings?.pix_auto_minutes ?? 15)) - 1;
  const body = buildPaymentBody(order, {
    notificationUrl: `${functionUrl}?action=webhook&token=${encodeURIComponent(Deno.env.get('PIX_WEBHOOK_TOKEN') ?? '')}`,
    payerEmail: Deno.env.get('MP_PAYER_EMAIL') || 'cliente@sabordacarne.com.br',
    minutes,
    storeName: settings?.name,
  });
  const payment = await mp('', { method: 'POST', headers: { 'X-Idempotency-Key': `pix-${order.id}` }, body: JSON.stringify(body) });
  const qr = payment.point_of_interaction?.transaction_data?.qr_code;
  if (!qr) throw new Error('Mercado Pago não devolveu o QR Code.');
  const expiresAt = payment.date_of_expiration ?? new Date(Date.now() + minutes * 60_000).toISOString();
  await db.from('delivery_orders')
    .update({ pix_provider_id: String(payment.id), pix_qr_code: qr, pix_expires_at: expiresAt })
    .eq('id', order.id);
  return json({ status: order.status, qr_code: qr, expires_at: expiresAt });
}

async function check(db: SupabaseClient, orderId: string) {
  await db.rpc('expire_unpaid_pix_orders');
  const order = await loadOrder(db, orderId);
  if (!order) return json({ error: 'Pedido não encontrado.' }, 404);
  if (order.status === 'AWAITING_PAYMENT' && order.pix_provider_id) {
    const payment = await mp(`/${order.pix_provider_id}`);
    if (await settle(db, payment)) return json({ status: 'PREPARING', paid: true });
  }
  return json({ status: order.status, paid: !!order.paid_at });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const db = admin();
  try {
    if (!Deno.env.get('MP_ACCESS_TOKEN')) return json({ error: 'PIX automático não configurado (MP_ACCESS_TOKEN).' }, 503);

    if (action === 'webhook') {
      if (url.searchParams.get('token') !== Deno.env.get('PIX_WEBHOOK_TOKEN')) return json({ error: 'unauthorized' }, 401);
      const body = await req.json().catch(() => ({}));
      const paymentId = parseWebhookPaymentId(url, body);
      // Nunca confia no conteúdo do aviso: consulta o pagamento direto no Mercado Pago
      if (paymentId) await settle(db, await mp(`/${encodeURIComponent(paymentId)}`));
      return json({ ok: true });
    }

    const { order_id: orderId } = await req.json().catch(() => ({}));
    if (typeof orderId !== 'string' || !/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: 'Pedido inválido.' }, 400);
    // URL pública da função (req.url dentro do Supabase é interna)
    if (action === 'create') return await create(db, orderId, `${Deno.env.get('SUPABASE_URL')}/functions/v1/pix-mercadopago`);
    if (action === 'check') return await check(db, orderId);
    return json({ error: 'Ação inválida.' }, 400);
  } catch (err) {
    console.error('[pix-mercadopago]', err);
    return json({ error: err instanceof Error ? err.message : 'Erro no PIX.' }, 500);
  }
});
