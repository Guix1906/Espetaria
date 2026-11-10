// ============================================================================
// EDGE FUNCTION: whatsapp-monitor (09/11)
// "Foto" do WhatsApp a cada 2 minutos (pg_cron → net.http_post), para descobrir
// quando e por que o robô fica "conectado mas surdo". Só LÊ a Evolution e grava
// uma linha em public.whatsapp_monitor. Compara com a outra instância do mesmo
// servidor (que nunca travou). Não guarda texto de mensagem nem telefone.
// Deploy: supabase functions deploy whatsapp-monitor --no-verify-jwt
// Senha: header x-monitor-token = public.whatsapp_monitor_config.token
// ============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

import { connectionState } from '../_shared/dapi.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: cfg } = await db.from('whatsapp_monitor_config').select('token').eq('id', 1).maybeSingle();
  const sent = req.headers.get('x-monitor-token') || '';
  if (!cfg?.token || sent !== cfg.token) return json({ error: 'unauthorized' }, 401);

  // D-API (10/11): grava só o estado da sessão e a última mensagem que chegou pelo webhook
  if ((Deno.env.get('WHATSAPP_PROVIDER') || '').toLowerCase() === 'dapi') {
    const t0 = Date.now();
    const st = await connectionState();
    const { data: hook } = await db.from('audit_logs').select('created_at').eq('action', 'WHATSAPP_MENSAGEM_RECEBIDA')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    await db.from('whatsapp_monitor').insert({
      evolution_ok: st.state !== 'error', evolution_ms: Date.now() - t0, ponto_state: st.state,
      webhook_last_msg: hook?.created_at ?? null, ponto_last_in: hook?.created_at ?? null, error: st.error ?? null,
    });
    await db.from('whatsapp_monitor').delete().lt('at', new Date(Date.now() - 10 * 86_400_000).toISOString());
    return json({ ok: true, provider: 'dapi' });
  }

  const base = (Deno.env.get('EVOLUTION_URL') || '').replace(/\/$/, '');
  const key = Deno.env.get('EVOLUTION_API_KEY') || '';
  const ours = Deno.env.get('EVOLUTION_INSTANCE') || 'Ponto';
  const call = async (path: string, init?: RequestInit) => {
    const t0 = Date.now();
    try {
      const res = await fetch(`${base}${path}`, {
        ...init,
        headers: { apikey: key, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      return { ok: res.ok, status: res.status, ms: Date.now() - t0, body: await res.json().catch(() => null) };
    } catch (err) {
      return { ok: false, status: 0, ms: Date.now() - t0, body: { error: err instanceof Error ? err.message : String(err) } };
    }
  };
  const lastIncoming = async (instance: string): Promise<string | null> => {
    const r = await call(`/chat/findMessages/${encodeURIComponent(instance)}`, {
      method: 'POST',
      body: JSON.stringify({ where: { key: { fromMe: false } }, limit: 3 }),
    });
    // deno-lint-ignore no-explicit-any
    const recs: any[] = r.body?.messages?.records ?? (Array.isArray(r.body) ? r.body : []);
    const ts = recs.map((m) => Number(m?.messageTimestamp) || 0).reduce((a, b) => Math.max(a, b), 0);
    return ts ? new Date(ts * 1000).toISOString() : null;
  };

  const all = await call('/instance/fetchInstances');
  // deno-lint-ignore no-explicit-any
  const list: any[] = Array.isArray(all.body) ? all.body : [];
  const mine = list.find((i) => i?.name === ours);
  const other = list.find((i) => i?.name && i.name !== ours);
  const [mineIn, otherIn, state] = await Promise.all([
    lastIncoming(ours),
    other ? lastIncoming(other.name) : Promise.resolve(null),
    call(`/instance/connectionState/${encodeURIComponent(ours)}`),
  ]);
  const { data: hook } = await db.from('audit_logs').select('created_at').eq('action', 'WHATSAPP_MENSAGEM_RECEBIDA')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  const row = {
    evolution_ok: all.ok,
    evolution_ms: all.ms,
    ponto_state: state.body?.instance?.state ?? mine?.connectionStatus ?? null,
    ponto_updated_at: mine?.updatedAt ?? null,
    ponto_disc_code: mine?.disconnectionReasonCode ?? null,
    ponto_disc_at: mine?.disconnectionAt ?? null,
    ponto_msg_count: mine?._count?.Message ?? null,
    ponto_last_in: mineIn,
    other_state: other?.connectionStatus ?? null,
    other_msg_count: other?._count?.Message ?? null,
    other_last_in: otherIn,
    webhook_last_msg: hook?.created_at ?? null,
    error: all.ok ? null : JSON.stringify(all.body).slice(0, 300),
  };
  await db.from('whatsapp_monitor').insert(row);
  // Guarda só 10 dias
  await db.from('whatsapp_monitor').delete().lt('at', new Date(Date.now() - 10 * 86_400_000).toISOString());
  return json({ ok: true });
});
