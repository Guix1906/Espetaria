// ============================================================================
// EDGE FUNCTION: whatsapp-evolution-webhook
// Recebe os eventos da Evolution API (Webhook da instância). Por enquanto só
// registra no log as mensagens recebidas dos clientes (MESSAGES_UPSERT).
// Deploy: supabase functions deploy whatsapp-evolution-webhook --no-verify-jwt
// URL na Evolution: https://<projeto>.supabase.co/functions/v1/whatsapp-evolution-webhook?token=<EVOLUTION_WEBHOOK_TOKEN>
// Secret: EVOLUTION_WEBHOOK_TOKEN (impede que outra pessoa mande eventos falsos)
// ============================================================================
const ok = (body: unknown = { ok: true }) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const expected = Deno.env.get('EVOLUTION_WEBHOOK_TOKEN') || '';
  const token = new URL(req.url).searchParams.get('token') || '';
  if (!expected || token !== expected) {
    return req.method === 'POST' ? new Response('unauthorized', { status: 401 }) : ok({ ok: true, info: 'webhook Evolution ativo' });
  }

  // GET com o token: diagnóstico (como o webhook está cadastrado na Evolution; a chave não aparece)
  if (req.method !== 'POST') {
    try {
      const base = (Deno.env.get('EVOLUTION_URL') || '').replace(/\/$/, '');
      const instance = encodeURIComponent(Deno.env.get('EVOLUTION_INSTANCE') || '');
      const res = await fetch(`${base}/webhook/find/${instance}`, { headers: { apikey: Deno.env.get('EVOLUTION_API_KEY') || '' } });
      const body = await res.json().catch(() => null);
      const url = String(body?.url ?? body?.webhook?.url ?? '');
      const sameToken = url.includes(`token=${expected}`);
      return ok({
        status: res.status,
        enabled: body?.enabled ?? body?.webhook?.enabled ?? null,
        url: url.replace(/token=[^&]+/, 'token=***'),
        token_ok: sameToken,
        events: body?.events ?? body?.webhook?.events ?? null,
        byEvents: body?.webhookByEvents ?? body?.webhook?.webhookByEvents ?? null,
        base64: body?.webhookBase64 ?? body?.webhook?.webhookBase64 ?? null,
      });
    } catch (err) {
      return ok({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  try {
    // deno-lint-ignore no-explicit-any
    const payload: any = await req.json();
    const event = String(payload?.event ?? '').toLowerCase().replace(/_/g, '.');
    if (event !== 'messages.upsert') return ok({ ignored: payload?.event ?? null });

    const list = Array.isArray(payload?.data) ? payload.data : [payload?.data];
    for (const msg of list) {
      if (!msg || msg?.key?.fromMe) continue; // ignora o que a própria loja enviou
      const jid = String(msg?.key?.remoteJid ?? '');
      if (jid.endsWith('@g.us')) continue; // ignora grupos
      const text = msg?.message?.conversation ?? msg?.message?.extendedTextMessage?.text ?? `[${msg?.messageType ?? 'mídia'}]`;
      console.log(JSON.stringify({
        tag: 'evolution-message',
        instance: payload?.instance,
        from: jid.split('@')[0],
        name: msg?.pushName ?? null,
        text: String(text).slice(0, 1000),
        at: msg?.messageTimestamp ?? null,
      }));
    }

    // Repassa ao robô de atendimento (ele decide se responde: modo OFF/TEST/ALL).
    // Mensagens da própria loja também vão, para o robô pausar quando a equipe responde.
    const botToken = Deno.env.get('WHATSAPP_BOT_TOKEN');
    if (botToken) {
      const botUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-bot?token=${encodeURIComponent(botToken)}`;
      const forward = fetch(botUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then((r) => { if (!r.ok) console.error(`[whatsapp-evolution-webhook] robô respondeu ${r.status}`); })
        .catch((err) => console.error('[whatsapp-evolution-webhook] robô:', err instanceof Error ? err.message : String(err)));
      // deno-lint-ignore no-explicit-any
      const runtime = (globalThis as any).EdgeRuntime;
      if (runtime?.waitUntil) runtime.waitUntil(forward);
      else await forward;
    }
  } catch (err) {
    // Nunca devolve erro para a Evolution não ficar reenviando; só registra.
    console.error('[whatsapp-evolution-webhook]', err instanceof Error ? err.message : String(err));
  }
  return ok();
});
