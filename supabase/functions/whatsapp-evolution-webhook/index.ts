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
  if (req.method === 'POST' && (!expected || token !== expected)) {
    return new Response('unauthorized', { status: 401 });
  }

  // GET com o token: diagnóstico (como o webhook está cadastrado na Evolution; a chave não aparece)
  if (req.method !== 'POST') {
    try {
      const base = (Deno.env.get('EVOLUTION_URL') || '').replace(/\/$/, '');
      const instance = encodeURIComponent(Deno.env.get('EVOLUTION_INSTANCE') || '');
      const apiKey = Deno.env.get('EVOLUTION_API_KEY') || '';
      const urlObj = new URL(req.url);
      if (urlObj.searchParams.get('restart') === '1') {
        const restartRes = await fetch(`${base}/instance/restart/${instance}`, {
          method: 'POST',
          headers: { apikey: apiKey },
        });
        const restartBody = await restartRes.json().catch(() => null);
        return ok({ restart: true, status: restartRes.status, response: restartBody });
      }
      const [res, stateRes] = await Promise.all([
        fetch(`${base}/webhook/find/${instance}`, { headers: { apikey: apiKey } }),
        fetch(`${base}/instance/connectionState/${instance}`, { headers: { apikey: apiKey } }),
      ]);
      const body = await res.json().catch(() => null);
      const stateBody = await stateRes.json().catch(() => null);
      const url = String(body?.url ?? body?.webhook?.url ?? '');
      const sameToken = url.includes(`token=${expected}`);
      return ok({
        status: res.status,
        connectionState: stateBody,
        enabled: body?.enabled ?? body?.webhook?.enabled ?? null,
        url: url.replace(/token=[^&]+/, 'token=***'),
        token_ok: sameToken,
        events: body?.events ?? body?.webhook?.events ?? null,
      });
    } catch (err) {
      return ok({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  try {
    // deno-lint-ignore no-explicit-any
    const payload: any = await req.json();
    const event = String(payload?.event ?? '').toLowerCase().replace(/_/g, '.');
    if (event === 'connection.update') {
      // Grava cada mudança de conexão: a Visão geral e o aviso automático leem daqui (06/11)
      const state = String(payload?.data?.state ?? '');
      console.log(JSON.stringify({ tag: 'evolution-connection', state }));
      const url = Deno.env.get('SUPABASE_URL');
      const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (url && key && state) {
        await fetch(`${url}/rest/v1/audit_logs`, {
          method: 'POST',
          headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ action: 'WHATSAPP_CONEXAO', entity_type: 'whatsapp_bot', entity_id: crypto.randomUUID(), new_data: { state, reason: payload?.data?.statusReason ?? null } }),
        }).catch(() => undefined);
      }
      return ok({ state });
    }
    if (event !== 'messages.upsert') return ok({ ignored: payload?.event ?? null });

    const list = Array.isArray(payload?.data) ? payload.data : [payload?.data];
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (url && key) {
      const first = list[0] ?? {};
      let m = first?.message ?? {};
      if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
      if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
      if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
      const textPreview = m.conversation ?? m.extendedTextMessage?.text ?? m.imageMessage?.caption ?? (first?.messageType ? `[${first.messageType}]` : null);

      await fetch(`${url}/rest/v1/audit_logs`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          action: 'WHATSAPP_MENSAGEM_RECEBIDA',
          entity_type: 'whatsapp_bot',
          entity_id: crypto.randomUUID(),
          new_data: {
            fromMe: !!first?.key?.fromMe,
            remoteJid: first?.key?.remoteJid,
            remoteJidAlt: first?.key?.remoteJidAlt,
            senderPn: first?.key?.senderPn,
            sender: payload?.sender ?? first?.sender,
            pushName: first?.pushName ?? payload?.pushName,
            text: textPreview,
          },
        }),
      }).catch(() => undefined);
    }

    // Repassa ao robô de atendimento (ele decide se responde: modo OFF/TEST/ALL).
    // Mensagens da própria loja também vão, para o robô pausar quando a equipe responde.
    const botToken = Deno.env.get('WHATSAPP_BOT_TOKEN');
    if (botToken && url) {
      const botUrl = `${url}/functions/v1/whatsapp-bot?token=${encodeURIComponent(botToken)}`;
      try {
        const res = await fetch(botUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) console.error(`[whatsapp-evolution-webhook] robô respondeu ${res.status}`);
      } catch (err) {
        console.error('[whatsapp-evolution-webhook] robô:', err instanceof Error ? err.message : String(err));
      }
    }
  } catch (err) {
    // Nunca devolve erro para a Evolution não ficar reenviando; só registra.
    console.error('[whatsapp-evolution-webhook]', err instanceof Error ? err.message : String(err));
  }
  return ok();
});
