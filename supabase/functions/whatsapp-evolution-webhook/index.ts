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
  // Toda chamada exige o token (09/11: o GET estava aberto e um "?logout=1" derrubou o robô às 08:04).
  if (!expected || token !== expected) {
    return new Response('unauthorized', { status: 401 });
  }

  // GET com o token: diagnóstico (como o webhook está cadastrado na Evolution; a chave não aparece)
  if (req.method !== 'POST') {
    try {
      const base = (Deno.env.get('EVOLUTION_URL') || '').replace(/\/$/, '');
      const instance = encodeURIComponent(Deno.env.get('EVOLUTION_INSTANCE') || '');
      const apiKey = Deno.env.get('EVOLUTION_API_KEY') || '';
      const urlObj = new URL(req.url);
      if (urlObj.searchParams.get('update_webhook') === '1') {
        const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-evolution-webhook?token=${encodeURIComponent(expected)}`;
        const setRes = await fetch(`${base}/webhook/set/${instance}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: apiKey },
          body: JSON.stringify({
            webhook: {
              enabled: true,
              url: webhookUrl,
              webhook_by_events: false,
              webhookByEvents: false,
              byEvents: false,
              base64: false,
              events: [
                'CONNECTION_UPDATE',
                'MESSAGES_UPSERT',
                'MESSAGES_UPDATE',
                'SEND_MESSAGE',
              ],
            },
          }),
        });
        const setBody = await setRes.json().catch(() => null);
        return ok({ update_webhook: true, status: setRes.status, response: setBody });
      }
      if (urlObj.searchParams.get('get_qr') === '1') {
        const qrRes = await fetch(`${base}/instance/connect/${instance}`, { headers: { apikey: apiKey } });
        const qrBody = await qrRes.json().catch(() => null);
        return ok({ get_qr: true, status: qrRes.status, response: qrBody });
      }
      // Sem "logout" aqui: desconectar só pela tela (Configurações → WhatsApp, Master/Gerente, com confirmação).
      if (urlObj.searchParams.get('restart') === '1') {
        const restartRes = await fetch(`${base}/instance/restart/${instance}`, {
          method: 'POST',
          headers: { apikey: apiKey },
        });
        const restartBody = await restartRes.json().catch(() => null);
        return ok({ restart: true, status: restartRes.status, response: restartBody });
      }
      if (urlObj.searchParams.get('update_settings') === '1') {
        const setRes = await fetch(`${base}/settings/set/${instance}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: apiKey },
          body: JSON.stringify({
            rejectCall: false,
            msgCall: '',
            groupsIgnore: true,
            alwaysOnline: true,
            readMessages: false,
            readStatus: false,
            syncFullHistory: false,
          }),
        });
        const setBody = await setRes.json().catch(() => null);
        return ok({ update_settings: true, status: setRes.status, response: setBody });
      }
      const [res, stateRes, messagesRes, settingsRes, fetchInstRes] = await Promise.all([
        fetch(`${base}/webhook/find/${instance}`, { headers: { apikey: apiKey } }),
        fetch(`${base}/instance/connectionState/${instance}`, { headers: { apikey: apiKey } }),
        fetch(`${base}/chat/findMessages/${instance}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: apiKey },
          body: JSON.stringify({
            where: {
              key: {
                fromMe: false,
              },
            },
            take: 10,
          }),
        }),
        fetch(`${base}/settings/find/${instance}`, { headers: { apikey: apiKey } }),
        fetch(`${base}/instance/fetchInstances?instanceName=${instance}`, { headers: { apikey: apiKey } }),
      ]);
      const body = await res.json().catch(() => null);
      const stateBody = await stateRes.json().catch(() => null);
      const messagesBody = await messagesRes.json().catch(() => null);
      const settingsBody = await settingsRes.json().catch(() => null);
      const fetchInstBody = await fetchInstRes.json().catch(() => null);
      const url = String(body?.url ?? body?.webhook?.url ?? '');
      const urlToken = new URL(url).searchParams.get('token') || '';
      return ok({
        status: res.status,
        connectionState: stateBody,
        webhook: body,
        settings: settingsBody,
        instanceInfo: fetchInstBody,
        recentMessages: messagesBody,
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
    // Rastro de todos os eventos (só o nome e de quem é a mensagem): mostra o que para quando o robô fica "surdo"
    {
      const d0 = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
      console.log(JSON.stringify({ tag: 'evolution-event', event, fromMe: d0?.key?.fromMe ?? null, status: d0?.status ?? d0?.update?.status ?? null }));
    }
    if (event !== 'messages.upsert' && event !== 'send.message') return ok({ ignored: payload?.event ?? null });

    const list = Array.isArray(payload?.data) ? payload.data : [payload?.data];
    const first = list[0] ?? {};
    const rawRemoteJid = String(first?.key?.remoteJid ?? '');
    // Grupos (@g.us), transmissões (@broadcast) e canais (@newsletter) são ignorados pelo gateway
    if (
      rawRemoteJid.includes('@g.us') ||
      rawRemoteJid.includes('@broadcast') ||
      rawRemoteJid.includes('@newsletter')
    ) {
      return ok({ ignored: 'group_or_broadcast' });
    }

    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (url && key) {
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
