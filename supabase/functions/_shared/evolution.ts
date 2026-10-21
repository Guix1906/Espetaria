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
