// CORS das Edge Functions chamadas pelo painel.
// ALLOWED_ORIGIN aceita vários endereços separados por vírgula
// (ex.: https://sabordacarne.pontopdv.tech,https://sabordacarne.vercel.app). Vazio = qualquer origem.
export function corsHeadersFor(req: Request): Record<string, string> {
  const allowed = (Deno.env.get('ALLOWED_ORIGIN') || '').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);
  const origin = req.headers.get('Origin') || '';
  const allowOrigin = allowed.length === 0 ? '*' : allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}
