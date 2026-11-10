// ============================================================================
// EDGE FUNCTION: whatsapp-dapi-webhook (10/11/2026)
// Recebe os eventos da D-API: mensagens (repassa ao robô whatsapp-bot) e
// mudanças de conexão (grava em audit_logs WHATSAPP_CONEXAO, que o painel e o vigia leem).
// Deploy: supabase functions deploy whatsapp-dapi-webhook --no-verify-jwt
// URL na D-API: https://<projeto>.supabase.co/functions/v1/whatsapp-dapi-webhook?token=<DAPI_WEBHOOK_TOKEN>
// A D-API não assina os webhooks: a senha na URL + o sessionId conferem a origem.
// ============================================================================
const ok = (body: unknown = { ok: true }) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

const STATE: Record<string, string> = { connected: 'open', disconnected: 'close', logged_out: 'close', qrcode_timeout: 'close' };

Deno.serve(async (req) => {
  const expected = Deno.env.get('DAPI_WEBHOOK_TOKEN') || '';
  const token = new URL(req.url).searchParams.get('token') || '';
  if (!expected || token !== expected) return new Response('unauthorized', { status: 401 });
  if (req.method !== 'POST') return ok({ ok: true, hint: 'POST only' });

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const audit = (action: string, new_data: unknown) =>
    url && key
      ? fetch(`${url}/rest/v1/audit_logs`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ action, entity_type: 'whatsapp_bot', entity_id: crypto.randomUUID(), new_data }),
      }).catch(() => undefined)
      : Promise.resolve(undefined);

  try {
    // deno-lint-ignore no-explicit-any
    const payload: any = await req.json();
    const session = Deno.env.get('DAPI_SESSION_ID') || '';
    if (session && payload?.sessionId && payload.sessionId !== session) return ok({ ignored: 'other_session' });
    const event = String(payload?.event ?? '');
    const data = payload?.data ?? {};
    console.log(JSON.stringify({ tag: 'dapi-event', event, fromMe: data?.fromMe ?? null, type: data?.type ?? null, status: data?.status ?? null }));

    if (event === 'connection.status') {
      const raw = String(data.status ?? '');
      await audit('WHATSAPP_CONEXAO', { state: STATE[raw] ?? raw, raw, reason: data.reason ?? null, provider: 'dapi' });
      return ok({ state: raw });
    }
    if (event !== 'messages.received' && event !== 'messages.sent') return ok({ ignored: event });
    if (data.is_group) return ok({ ignored: 'group' });

    if (event === 'messages.received') {
      await audit('WHATSAPP_MENSAGEM_RECEBIDA', {
        provider: 'dapi',
        fromMe: !!data.fromMe,
        jid: data.fromMe ? data.to?.jid : data.from?.jid,
        pushName: data.from_name ?? data.from?.name ?? null,
        type: data.type ?? null,
        text: data.message ? String(data.message).slice(0, 300) : (data.type ? `[${data.type}]` : null),
      });
    }

    // Repassa ao robô (ele decide pelo modo OFF/TEST/ALL e pausa quando a equipe responde)
    const botToken = Deno.env.get('WHATSAPP_BOT_TOKEN');
    if (botToken && url) {
      const res = await fetch(`${url}/functions/v1/whatsapp-bot?token=${encodeURIComponent(botToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch((err) => { console.error('[whatsapp-dapi-webhook] robô:', err instanceof Error ? err.message : String(err)); return null; });
      if (res && !res.ok) console.error(`[whatsapp-dapi-webhook] robô respondeu ${res.status}`);
    }
  } catch (err) {
    // Sempre 200: a D-API reenviaria até 7 vezes.
    console.error('[whatsapp-dapi-webhook]', err instanceof Error ? err.message : String(err));
  }
  return ok();
});
