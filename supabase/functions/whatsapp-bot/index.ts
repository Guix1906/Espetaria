// ============================================================================
// EDGE FUNCTION: whatsapp-bot
// Robô de atendimento: recebe as mensagens dos clientes (webhook "Ao receber"
// da Z-API, ou repassadas pelo whatsapp-evolution-webhook) e responde com o Gemini (Google), usando os dados reais da loja.
// Deploy: supabase functions deploy whatsapp-bot --no-verify-jwt
// URL no painel da Z-API: https://<projeto>.supabase.co/functions/v1/whatsapp-bot?token=<WHATSAPP_BOT_TOKEN>
//
// Secrets (Edge Functions > Secrets):
//   GEMINI_API_KEY       chave da API do Gemini (aistudio.google.com)
//   GEMINI_MODEL         opcional; padrão gemini-3.5-flash-lite (mais caprichado e mais lento: gemini-3.8-flash)
//   WHATSAPP_BOT_TOKEN   senha do webhook (a mesma que vai na URL acima)
//   ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN (já usados pelo whatsapp-dispatch)
//   APP_URL              https://sabordacarne.vercel.app (links do cardápio e do pedido)
// Configuração (liga/desliga, lista de teste, textos): restaurant_settings.whatsapp_bot
// ============================================================================
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { sendText as evolutionSendText } from '../_shared/evolution.ts';
import {
  buildContextBlock,
  buildGeminiRequest,
  type CustomerOrder,
  HANDOFF_FALLBACK,
  isBotAllowedFor,
  MAX_BOT_REPLIES_PER_HOUR,
  MEDIA_REPLY,
  parseGeminiResponse,
  parseIncoming,
  phoneLookupValues,
  resolveBotSettings,
  type StoredMessage,
} from './logic.ts';

// Flash-Lite: o mais rápido (pensamento mínimo por padrão) para conversa de WhatsApp
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

function admin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Envia texto (Evolution ou Z-API) e devolve o id da mensagem (para reconhecer o eco no webhook). */
async function sendText(phone: string, text: string): Promise<string | null> {
  if ((Deno.env.get('WHATSAPP_PROVIDER') || '').toLowerCase() === 'evolution') return evolutionSendText(phone, text);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');
  if (clientToken) headers['Client-Token'] = clientToken;
  const res = await fetch(
    `https://api.z-api.io/instances/${Deno.env.get('ZAPI_INSTANCE_ID')}/token/${Deno.env.get('ZAPI_TOKEN')}/send-text`,
    { method: 'POST', headers, body: JSON.stringify({ phone, message: text }) },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Z-API ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body.messageId ?? body.id ?? null;
}

/** Falha fica na auditoria (vira alerta na Visão geral) sem expor chaves. */
async function logBotError(db: SupabaseClient, err: unknown) {
  const message = (err instanceof Error ? err.message : String(err))
    .replace(/(api_key:|key=)[A-Za-z0-9._-]+/g, '$1***')
    .replace(/\b(AIza|AQ\.)[A-Za-z0-9._-]+/g, '***');
  console.error('[whatsapp-bot]', message);
  await db.from('audit_logs')
    .insert({ action: 'WHATSAPP_BOT_ERRO', entity_type: 'whatsapp_bot', entity_id: crypto.randomUUID(), new_data: { error: message.slice(0, 1000) } })
    .then(() => undefined, () => undefined);
}

async function pause(db: SupabaseClient, phone: string, hours: number, reason: string) {
  await db.from('whatsapp_conversations')
    .update({ bot_paused_until: new Date(Date.now() + hours * 3_600_000).toISOString(), pause_reason: reason })
    .eq('phone', phone);
}

async function reply(db: SupabaseClient, phone: string, text: string) {
  const id = await sendText(phone, text);
  await db.from('whatsapp_bot_messages').insert({ phone, direction: 'BOT', body: text, provider_message_id: id });
}

/** Dados da loja, cardápio e pedidos do cliente para a IA. */
async function loadContext(db: SupabaseClient, phone: string, settings: Record<string, unknown>, storeInfo: string) {
  const appUrl = (Deno.env.get('APP_URL') || '').replace(/\/$/, '') || null;
  const { data: shift } = await db.from('shifts').select('id').eq('status', 'ABERTO').order('opened_at', { ascending: false }).limit(1).maybeSingle();
  const [{ data: products }, { data: categories }, { data: zones }, { data: stock }, { data: orders }] = await Promise.all([
    db.from('products').select('id, name, price, category_id, tracks_stock, available, allows_doneness, display_order').eq('active', true).order('display_order').order('name'),
    db.from('categories').select('id, name, display_order').eq('active', true),
    db.from('delivery_zones').select('name, fee, display_order').eq('active', true).order('display_order'),
    shift ? db.from('daily_prep_stock').select('product_id, current_quantity, is_exhausted').eq('shift_id', shift.id) : Promise.resolve({ data: [] }),
    db.from('delivery_orders')
      .select('id, order_number, order_type, status, total, created_at, driver_name, items:delivery_order_items(quantity, product_name)')
      .in('phone', phoneLookupValues(phone))
      .gte('created_at', new Date(Date.now() - 24 * 3_600_000).toISOString())
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const categoryName = new Map((categories ?? []).map((c) => [c.id, c.name as string]));
  const categoryOrder = new Map((categories ?? []).map((c) => [c.id, Number(c.display_order ?? 0)]));
  const stockBy = new Map((stock ?? []).map((s: { product_id: string; current_quantity: number; is_exhausted: boolean }) => [s.product_id, s]));
  const sorted = [...(products ?? [])].sort((a, b) => (categoryOrder.get(a.category_id) ?? 99) - (categoryOrder.get(b.category_id) ?? 99));

  return buildContextBlock(
    {
      name: String(settings.name || 'Espetaria'),
      address: (settings.address as string) || null,
      phone: (settings.phone as string) || null,
      pixKey: (settings.pix_key as string) || null,
      isOpen: !!shift,
      menuUrl: appUrl ? `${appUrl}/cardapio` : null,
      now: new Date(),
      storeInfo,
      zones: (zones ?? []).map((z) => ({ name: z.name, fee: Number(z.fee) })),
      products: sorted.map((p) => {
        const s = stockBy.get(p.id);
        return {
          name: p.name,
          price: Number(p.price),
          category: categoryName.get(p.category_id) ?? null,
          exhausted: p.tracks_stock ? !s || s.is_exhausted || s.current_quantity <= 0 : !p.available,
          allowsDoneness: !!p.allows_doneness,
        };
      }),
    },
    (orders ?? []).map((o) => ({ ...o, total: Number(o.total) })) as CustomerOrder[],
    appUrl,
  );
}

async function askGemini(context: string, history: StoredMessage[]): Promise<{ reply: string; handoff: boolean }> {
  const body = buildGeminiRequest(context, history);
  if (body.contents.length === 0) return { reply: HANDOFF_FALLBACK, handoff: true };
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada.');
  const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return parseGeminiResponse(data);
}

async function handle(payload: unknown) {
  const msg = parseIncoming(payload);
  if (msg.kind === 'ignore') return;
  const db = admin();

  const { data: settings } = await db.from('restaurant_settings').select('*').limit(1).maybeSingle();
  const bot = resolveBotSettings(settings?.whatsapp_bot);
  if (!isBotAllowedFor(msg.phone, bot)) return; // fora da lista: nada é gravado

  // Mensagem enviada pelo próprio número da loja
  if (msg.kind === 'self') {
    if (msg.fromApi) return;
    if (msg.messageId) {
      const [{ data: ownBot }, { data: ownStatus }] = await Promise.all([
        db.from('whatsapp_bot_messages').select('id').eq('provider_message_id', msg.messageId).maybeSingle(),
        db.from('whatsapp_outbox').select('id').eq('provider_message_id', msg.messageId).maybeSingle(),
      ]);
      if (ownBot || ownStatus) return; // eco do que o sistema enviou
    }
    // O eco pode chegar antes de gravarmos o id: confere pelo texto dos últimos minutos
    const { data: recentBot } = await db.from('whatsapp_bot_messages').select('id')
      .eq('phone', msg.phone).eq('direction', 'BOT').eq('body', msg.text)
      .gte('created_at', new Date(Date.now() - 3 * 60_000).toISOString()).limit(1);
    if (recentBot?.length) return;

    // Alguém da loja respondeu pelo celular: o robô sai da conversa
    await db.from('whatsapp_conversations').upsert({ phone: msg.phone, last_message_at: new Date().toISOString() }, { onConflict: 'phone' });
    await db.from('whatsapp_bot_messages').upsert(
      { phone: msg.phone, direction: 'HUMAN', body: msg.text || `[${msg.media}]`, provider_message_id: msg.messageId },
      { onConflict: 'provider_message_id', ignoreDuplicates: true },
    );
    if (bot.pause_on_human) await pause(db, msg.phone, bot.pause_hours, 'HUMAN');
    return;
  }

  // Mensagem do cliente (a Z-API pode reenviar o mesmo webhook: grava uma vez só)
  const { data: inserted } = await db.from('whatsapp_bot_messages').upsert(
    { phone: msg.phone, direction: 'IN', body: msg.text || `[${msg.media}]`, provider_message_id: msg.messageId },
    { onConflict: 'provider_message_id', ignoreDuplicates: true },
  ).select('id');
  if (msg.messageId && !inserted?.length) return;

  // Consultas independentes em paralelo (cada ida ao banco custa tempo de resposta)
  const [{ data: conversation }, { count }, { data: history }, context] = await Promise.all([
    db.from('whatsapp_conversations').upsert({
      phone: msg.phone,
      ...(msg.senderName ? { customer_name: msg.senderName } : {}),
      last_message_at: new Date().toISOString(),
      last_message_preview: (msg.text || `[${msg.media}]`).slice(0, 120),
    }, { onConflict: 'phone' }).select('bot_paused_until').maybeSingle(),
    // Freio: robô conversando sem parar (por exemplo, com outro robô)
    db.from('whatsapp_bot_messages').select('id', { count: 'exact', head: true })
      .eq('phone', msg.phone).eq('direction', 'BOT').gte('created_at', new Date(Date.now() - 3_600_000).toISOString()),
    db.from('whatsapp_bot_messages').select('direction, body')
      .eq('phone', msg.phone).gte('created_at', new Date(Date.now() - 24 * 3_600_000).toISOString())
      .order('created_at', { ascending: false }).limit(16),
    msg.media ? Promise.resolve('') : loadContext(db, msg.phone, settings ?? {}, bot.store_info),
  ]);
  if (conversation?.bot_paused_until && new Date(conversation.bot_paused_until).getTime() > Date.now()) return;
  if ((count ?? 0) >= MAX_BOT_REPLIES_PER_HOUR) {
    await pause(db, msg.phone, bot.pause_hours, 'LIMIT');
    return;
  }

  if (msg.media) {
    await reply(db, msg.phone, MEDIA_REPLY);
    return;
  }

  let answer: { reply: string; handoff: boolean };
  try {
    answer = await askGemini(context, ((history ?? []) as StoredMessage[]).reverse());
  } catch (err) {
    // IA fora do ar (chave suspensa, limite, etc.): o cliente não fica sem resposta,
    // a conversa passa para a equipe e a falha vira alerta na Visão geral.
    await logBotError(db, err);
    answer = { reply: HANDOFF_FALLBACK, handoff: true };
  }

  await reply(db, msg.phone, answer.reply);
  if (answer.handoff) await pause(db, msg.phone, bot.pause_hours, 'HANDOFF');

  // Faxina ocasional: histórico só dos últimos 30 dias
  if (Math.random() < 0.02) {
    await db.from('whatsapp_bot_messages').delete().lt('created_at', new Date(Date.now() - 30 * 86_400_000).toISOString());
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  const expected = Deno.env.get('WHATSAPP_BOT_TOKEN');
  if (!expected || new URL(req.url).searchParams.get('token') !== expected) {
    return new Response('unauthorized', { status: 401 });
  }
  const payload = await req.json().catch(() => null);
  // Responde na hora para a Z-API e continua o trabalho em segundo plano
  const work = handle(payload).catch((err) => logBotError(admin(), err));
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work);
  else await work;
  return new Response('ok');
});
