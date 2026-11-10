// ============================================================================
// Módulo da D-API (https://docs.d-api.cloud) — só roda nas Edge Functions.
// Substitui a Evolution API desde 10/11/2026 (WHATSAPP_PROVIDER=dapi).
//
// Secrets: DAPI_API_KEY (chave do painel D-API), DAPI_SESSION_ID (id da sessão),
//          DAPI_WEBHOOK_TOKEN (senha na URL do webhook whatsapp-dapi-webhook)
// Autenticação: header "Authorization: <API_KEY>" (sem "Bearer").
// ============================================================================
import { normalizePhone } from './evolution.ts';

const BASE = 'https://api.d-api.cloud/api/v1';

function config() {
  const key = Deno.env.get('DAPI_API_KEY') || '';
  const session = Deno.env.get('DAPI_SESSION_ID') || '';
  if (!key || !session) throw new Error('D-API não configurada (DAPI_API_KEY, DAPI_SESSION_ID).');
  return { key, session, sid: encodeURIComponent(session) };
}

// deno-lint-ignore no-explicit-any
async function call(path: string, init: RequestInit = {}, timeout = 15000): Promise<{ ok: boolean; status: number; body: any }> {
  const { key } = config();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: key, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(timeout),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

const fail = (status: number, body: unknown) => new Error(`D-API ${status}: ${JSON.stringify(body).slice(0, 300)}`);

/** URL do nosso webhook (com a senha). */
export function dapiWebhookUrl(): string {
  const token = Deno.env.get('DAPI_WEBHOOK_TOKEN') || '';
  return `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-dapi-webhook?token=${encodeURIComponent(token)}`;
}

/** Status da sessão, em qualquer um dos formatos que a D-API devolve. */
// deno-lint-ignore no-explicit-any
export function dapiStatusOf(body: any): string {
  const s = body?.status ?? body?.session?.status ?? body?.data?.status ?? body?.connectionStatus ?? body?.state ?? '';
  return String(s).toLowerCase();
}

export const isDapiConnected = (status: string) => ['connected', 'open', 'online', 'working', 'ready'].includes(status.toLowerCase());

/** Envia texto. Devolve o id da mensagem; lança erro se a D-API recusar. */
export async function sendText(phone: string, text: string): Promise<string | null> {
  const { session } = config();
  const to = normalizePhone(phone);
  if (to.length < 12) throw new Error(`Telefone inválido: ${phone}`);
  const r = await call('/messages/send/text', { method: 'POST', body: JSON.stringify({ sessionId: session, to, text }) });
  if (!r.ok || r.body?.success === false) throw fail(r.status, r.body);
  const id = r.body?.id ?? r.body?.messageId ?? r.body?.data?.id ?? r.body?.data?.messageId ?? r.body?.key?.id ?? null;
  return id ? String(id) : null;
}

/** Estado da conexão. "open" quando conectado (mesmo nome da Evolution, o painel já entende). Nunca lança erro. */
export async function connectionState(): Promise<{ connected: boolean; state: string; error?: string }> {
  try {
    const { sid } = config();
    let r = await call(`/sessions/${sid}`, {}, 10000);
    let status = r.ok ? dapiStatusOf(r.body) : '';
    if (!status) {
      r = await call(`/sessions/${sid}/qr`, {}, 10000);
      status = r.ok ? dapiStatusOf(r.body) : '';
    }
    if (!r.ok && !status) return { connected: false, state: 'error', error: `D-API ${r.status}` };
    const connected = isDapiConnected(status);
    return { connected, state: connected ? 'open' : (status === 'connecting' || status === 'qrcode' ? 'connecting' : status === '' ? 'unknown' : 'close') };
  } catch (err) {
    return { connected: false, state: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

/** Número e nome ligados à sessão (informativo, nunca lança erro). */
export async function connectedAccount(): Promise<{ number: string | null; profileName: string | null }> {
  try {
    const { sid } = config();
    const r = await call(`/sessions/${sid}`, {}, 10000);
    const b = r.body?.session ?? r.body?.data ?? r.body ?? {};
    const raw = String(b.phone ?? b.phoneNumber ?? b.jid ?? b.me?.id ?? b.wid ?? '');
    const number = raw ? raw.split('@')[0].split(':')[0].replace(/\D/g, '') || null : null;
    return { number, profileName: b.name ?? b.pushName ?? b.profileName ?? b.me?.name ?? null };
  } catch {
    return { number: null, profileName: null };
  }
}

/** Pede o QR Code para ligar o celular (data URL PNG). */
export async function connectQr(): Promise<{ qr: string | null; pairingCode: string | null }> {
  const { sid } = config();
  // Garante que o webhook aponta para nós antes de ligar o celular
  await setWebhook(dapiWebhookUrl()).catch(() => undefined);
  const r = await call(`/sessions/${sid}/qr`, {}, 20000);
  if (!r.ok) throw fail(r.status, r.body);
  const raw = String(r.body?.qrCodeImage ?? r.body?.qrImage ?? '');
  const qr = raw ? (raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`) : null;
  return { qr, pairingCode: r.body?.pairCode ?? r.body?.pairingCode ?? null };
}

/** Desliga o celular da sessão. */
export async function logoutInstance(): Promise<void> {
  const { sid } = config();
  const r = await call(`/sessions/${sid}/disconnect`, { method: 'POST' });
  if (!r.ok) throw fail(r.status, r.body);
}

/** Aponta o webhook da sessão para o whatsapp-dapi-webhook, com os eventos que usamos. */
// deno-lint-ignore no-explicit-any
export async function setWebhook(webhookUrl: string): Promise<any> {
  const { sid } = config();
  const a = await call(`/sessions/${sid}/webhook`, { method: 'POST', body: JSON.stringify({ webhookUrl }) });
  const events = Object.fromEntries(['messages.received', 'messages.sent', 'connection.status'].map((e) => [e, { enabled: true, webhookUrl }]));
  const b = await call(`/sessions/${sid}/webhook-config`, { method: 'POST', body: JSON.stringify({ enabled: true, type: 'single', events }) });
  if (!a.ok && !b.ok) throw fail(a.status, a.body);
  return { webhook: a.status, config: b.status, configBody: b.ok ? undefined : b.body };
}

/** Dados da sessão (diagnóstico, sem a chave). */
// deno-lint-ignore no-explicit-any
export async function getWebhook(): Promise<any> {
  try {
    const { sid } = config();
    return (await call(`/sessions/${sid}`, {}, 10000)).body;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// deno-lint-ignore no-explicit-any
export async function diagnostics(): Promise<any> {
  try {
    const { sid } = config();
    const [session, limits] = await Promise.all([call(`/sessions/${sid}`, {}, 10000), call(`/limits/${sid}`, {}, 10000)]);
    return { provider: 'dapi', session: session.body, sessionStatus: session.status, limits: limits.body };
  } catch (err) {
    return { provider: 'dapi', error: err instanceof Error ? err.message : String(err) };
  }
}

/** A D-API não tem "reiniciar": reaponta o webhook (o que de fato importa para receber). */
// deno-lint-ignore no-explicit-any
export async function restartInstance(): Promise<any> {
  return setWebhook(dapiWebhookUrl());
}

export async function ensureAlwaysOnline(): Promise<void> {
  // Não existe na D-API.
}
