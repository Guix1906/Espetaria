// ============================================================================
// EDGE FUNCTION: whatsapp-dispatch
// Envia as mensagens pendentes da fila whatsapp_outbox.
// É chamada pelo banco (pg_net) a cada evento do delivery. Não recebe dados de
// fora: só processa o que já está na fila, então roda sem JWT
// (deploy: supabase functions deploy whatsapp-dispatch --no-verify-jwt).
// Textos: restaurant_settings.whatsapp_templates, com padrões em templates.ts.
//
// Secrets (Edge Functions > Secrets):
//   WHATSAPP_PROVIDER   zapi | evolution | meta
//   APP_URL             https://sabordacarne.vercel.app (link de acompanhamento)
//   -- Z-API --
//   ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN (opcional)
//   -- Evolution API --
//   EVOLUTION_URL (ex.: https://evo.seudominio.com), EVOLUTION_INSTANCE, EVOLUTION_API_KEY
//   -- Meta WhatsApp Cloud API --
//   META_PHONE_NUMBER_ID, META_ACCESS_TOKEN
// ============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

import { render, resolveTemplate, variables } from './templates.ts';

const MAX_ATTEMPTS = 5;
// Mensagem que ficou parada na fila (WhatsApp desligado, número desconectado):
// depois desse tempo não faz mais sentido avisar o cliente.
const MAX_AGE_MS = 3 * 60 * 60 * 1000;

type Outbox = { id: string; delivery_order_id: string; event: string; phone: string; attempts: number; created_at: string };

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`;
}

async function send(phone: string, text: string): Promise<string | null> {
  const provider = (Deno.env.get('WHATSAPP_PROVIDER') || '').toLowerCase();
  const to = normalizePhone(phone);

  if (provider === 'zapi') {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');
    if (clientToken) headers['Client-Token'] = clientToken;
    const res = await fetch(
      `https://api.z-api.io/instances/${Deno.env.get('ZAPI_INSTANCE_ID')}/token/${Deno.env.get('ZAPI_TOKEN')}/send-text`,
      { method: 'POST', headers, body: JSON.stringify({ phone: to, message: text }) },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Z-API ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
    return body.messageId ?? body.id ?? null;
  }

  if (provider === 'evolution') {
    const base = (Deno.env.get('EVOLUTION_URL') || '').replace(/\/$/, '');
    const res = await fetch(`${base}/message/sendText/${Deno.env.get('EVOLUTION_INSTANCE')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: Deno.env.get('EVOLUTION_API_KEY') || '' },
      body: JSON.stringify({ number: to, text }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Evolution ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
    return body?.key?.id ?? null;
  }

  if (provider === 'meta') {
    const res = await fetch(`https://graph.facebook.com/v21.0/${Deno.env.get('META_PHONE_NUMBER_ID')}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('META_ACCESS_TOKEN')}` },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Meta ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
    return body?.messages?.[0]?.id ?? null;
  }

  throw new Error('WHATSAPP_PROVIDER não configurado (use zapi, evolution ou meta).');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: jobs, error } = await admin.rpc('claim_whatsapp_messages', { p_limit: 20 });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const { data: settings } = await admin.from('restaurant_settings').select('*').limit(1).maybeSingle();
  const restaurant = settings?.name || 'Espetaria';
  const savedTemplates = settings?.whatsapp_templates ?? null;
  const appUrl = Deno.env.get('APP_URL') || '';
  const results: { id: string; status: string; error?: string }[] = [];

  for (const job of (jobs ?? []) as Outbox[]) {
    if (Date.now() - new Date(job.created_at).getTime() > MAX_AGE_MS) {
      await admin.from('whatsapp_outbox').update({ status: 'SKIPPED', last_error: 'Mensagem antiga: não enviada.' }).eq('id', job.id);
      results.push({ id: job.id, status: 'SKIPPED' });
      continue;
    }
    try {
      const { data: order } = await admin
        .from('delivery_orders')
        .select('*, items:delivery_order_items(product_name, quantity)')
        .eq('id', job.delivery_order_id)
        .single();
      if (!order) throw new Error('Pedido não encontrado.');

      const template = resolveTemplate(job.event, savedTemplates);
      if (!template || !template.enabled) {
        await admin.from('whatsapp_outbox')
          .update({ status: 'SKIPPED', last_error: template ? 'Mensagem desligada nas configurações.' : 'Evento sem mensagem.' })
          .eq('id', job.id);
        results.push({ id: job.id, status: 'SKIPPED' });
        continue;
      }
      const text = render(template.text, variables(order, restaurant, appUrl));

      const messageId = await send(job.phone, text);
      await admin.from('whatsapp_outbox')
        .update({ status: 'SENT', sent_at: new Date().toISOString(), last_error: null, provider_message_id: messageId })
        .eq('id', job.id);
      results.push({ id: job.id, status: 'SENT' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const finalStatus = job.attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING';
      await admin.from('whatsapp_outbox').update({ status: finalStatus, last_error: message.slice(0, 500) }).eq('id', job.id);
      results.push({ id: job.id, status: finalStatus, error: message });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
