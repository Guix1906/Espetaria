// ============================================================================
// Módulo da Evolution API v2 (só roda no servidor, dentro das Edge Functions).
// A chave fica nos secrets do Supabase e nunca vai para o navegador.
//
// Secrets: EVOLUTION_URL (ex.: https://evolution-api-...hstgr.cloud),
//          EVOLUTION_INSTANCE (Ponto), EVOLUTION_API_KEY
// ============================================================================

/**
 * Deixa o telefone no formato que o WhatsApp espera: só dígitos, com 55 na frente.
 * "(85) 9 9999-8888" -> "5585999998888"; "085 99999-8888" -> "5585999998888".
 */
export function normalizePhone(phone: string): string {
  let digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  digits = digits.replace(/^0+/, ''); // tira o 0 de "0 85 ..." (DDD com zero)
  return digits ? `55${digits}` : '';
}

function config() {
  const url = (Deno.env.get('EVOLUTION_URL') || Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/$/, '');
  const key = Deno.env.get('EVOLUTION_API_KEY') || '';
  const instance = Deno.env.get('EVOLUTION_INSTANCE') || '';
  if (!url || !key || !instance) throw new Error('Evolution API não configurada (EVOLUTION_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE).');
  return { url, key, instance: encodeURIComponent(instance) };
}

/**
 * Diagnóstico só de leitura (09/11): todas as instâncias do servidor (nome, número, estado),
 * configurações e as últimas mensagens recebidas guardadas pela própria Evolution (sem texto).
 */
// deno-lint-ignore no-explicit-any
export async function diagnostics(): Promise<any> {
  const { url, key, instance } = config();
  const get = async (path: string, init?: RequestInit) => {
    try {
      const res = await fetch(`${url}${path}`, { ...init, headers: { apikey: key, 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
      return { status: res.status, body: await res.json().catch(() => null) };
    } catch (err) {
      return { status: 0, body: { error: err instanceof Error ? err.message : String(err) } };
    }
  };
  const [all, settings, msgs] = await Promise.all([
    get('/instance/fetchInstances'),
    get(`/settings/find/${instance}`),
    get(`/chat/findMessages/${instance}`, { method: 'POST', body: JSON.stringify({ where: { key: { fromMe: false } }, limit: 15 }) }),
  ]);
  // deno-lint-ignore no-explicit-any
  const list: any[] = Array.isArray(all.body) ? all.body : [];
  // deno-lint-ignore no-explicit-any
  const records: any[] = msgs.body?.messages?.records ?? (Array.isArray(msgs.body) ? msgs.body : []);
  return {
    instances: list.map((i) => ({
      name: i?.name ?? i?.instance?.instanceName,
      number: i?.ownerJid ?? i?.number ?? i?.instance?.owner ?? null,
      state: i?.connectionStatus ?? i?.instance?.status ?? null,
      integration: i?.integration ?? null,
      clientName: i?.clientName ?? null,
      updatedAt: i?.updatedAt ?? null,
      disconnectionReasonCode: i?.disconnectionReasonCode ?? null,
      disconnectionAt: i?.disconnectionAt ?? null,
      counts: i?._count ?? null,
    })),
    settings: settings.body,
    lastIncoming: records.slice(0, 15).map((m) => ({
      at: m?.messageTimestamp ? new Date(Number(m.messageTimestamp) * 1000).toISOString() : null,
      jidEnd: String(m?.key?.remoteJid ?? '').split('@')[0].slice(-4),
      type: m?.messageType ?? null,
      stub: m?.messageStubType ?? null,
    })),
    messagesStatus: msgs.status,
  };
}

/** Envia texto. Devolve o id da mensagem; lança erro se a Evolution recusar. */
export async function sendText(phone: string, text: string): Promise<string | null> {
  const { url, key, instance } = config();
  const number = normalizePhone(phone);
  if (number.length < 12) throw new Error(`Telefone inválido: ${phone}`);
  const res = await fetch(`${url}/message/sendText/${instance}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key },
    body: JSON.stringify({ number, text }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Evolution ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body?.key?.id ?? null;
}

/** Garante que a instância na Evolution API fique sempre com presença ativa (alwaysOnline: true) para o WhatsApp não desconectar por inatividade. */
export async function ensureAlwaysOnline(): Promise<void> {
  try {
    const { url, key, instance } = config();
    await fetch(`${url}/settings/set/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify({
        rejectCall: false,
        msgCall: '',
        groupsIgnore: true,
        alwaysOnline: true,
        readMessages: false,
        readStatus: false,
        syncFullHistory: false,
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    // silencioso
  }
}

/** Pede um QR Code novo para ligar o celular. Lança erro se a Evolution recusar. */
export async function connectQr(): Promise<{ qr: string | null; pairingCode: string | null }> {
  const { url, key, instance } = config();
  await ensureAlwaysOnline();
  const res = await fetch(`${url}/instance/connect/${instance}`, {
    headers: { apikey: key },
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Evolution ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  const raw = String(body?.base64 ?? body?.qrcode?.base64 ?? '');
  const qr = raw ? (raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`) : null;
  return { qr, pairingCode: body?.pairingCode ?? body?.qrcode?.pairingCode ?? null };
}

/** Desliga o celular da instância. Lança erro se a Evolution recusar. */
export async function logoutInstance(): Promise<void> {
  const { url, key, instance } = config();
  const res = await fetch(`${url}/instance/logout/${instance}`, {
    method: 'DELETE',
    headers: { apikey: key },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Evolution ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
}

/** Número e nome do WhatsApp ligado à instância. Nunca lança erro (é só informativo). */
export async function connectedAccount(): Promise<{ number: string | null; profileName: string | null }> {
  try {
    const { url, key, instance } = config();
    const res = await fetch(`${url}/instance/fetchInstances?instanceName=${instance}`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(10000),
    });
    const body = await res.json().catch(() => null);
    const row = Array.isArray(body) ? body[0] : body;
    const data = row?.instance ?? row;
    const jid = String(data?.ownerJid ?? data?.owner ?? '');
    return { number: jid ? jid.split('@')[0].split(':')[0] : null, profileName: data?.profileName ?? null };
  } catch {
    return { number: null, profileName: null };
  }
}

/** Estado da conexão da instância: "open" = conectado. Nunca lança erro. */
export async function connectionState(): Promise<{ connected: boolean; state: string; error?: string }> {
  try {
    const { url, key, instance } = config();
    const res = await fetch(`${url}/instance/connectionState/${instance}`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(10000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { connected: false, state: 'error', error: `Evolution ${res.status}` };
    const state = String(body?.instance?.state ?? body?.state ?? 'unknown');
    return { connected: state === 'open', state };
  } catch (err) {
    return { connected: false, state: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

/** Consulta o webhook configurado na Evolution. */
// deno-lint-ignore no-explicit-any
export async function getWebhook(): Promise<any> {
  try {
    const { url, key, instance } = config();
    const res = await fetch(`${url}/webhook/find/${instance}`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(10000),
    });
    return await res.json().catch(() => null);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Reinicia a instância na Evolution API para renovar a escuta de mensagens sem perder o login. */
// deno-lint-ignore no-explicit-any
export async function restartInstance(): Promise<any> {
  const { url, key, instance } = config();
  const res = await fetch(`${url}/instance/restart/${instance}`, {
    method: 'POST',
    headers: { apikey: key },
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Evolution ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

/** Configura o webhook na Evolution para repassar mensagens recebidas e status de conexão. */
// deno-lint-ignore no-explicit-any
export async function setWebhook(webhookUrl: string): Promise<any> {
  const { url, key, instance } = config();
  const res = await fetch(`${url}/webhook/set/${instance}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key },
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
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Evolution ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

