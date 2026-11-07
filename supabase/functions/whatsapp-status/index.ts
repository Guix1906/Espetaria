// ============================================================================
// EDGE FUNCTION: whatsapp-status
// Diz ao painel se a instância da Evolution API está conectada, sem expor a chave.
// Só Master/Gerente logados. Deploy normal (com JWT):
//   supabase functions deploy whatsapp-status
// ============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeadersFor } from '../_shared/cors.ts';
import { connectedAccount, connectionState, connectQr, ensureAlwaysOnline, logoutInstance, sendText } from '../_shared/evolution.ts';

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: userData } = await admin.auth.getUser(token);
  if (!userData?.user) return json({ error: 'Sessão inválida.' }, 401);
  const { data: caller } = await admin.from('profiles').select('role, is_active').eq('id', userData.user.id).single();
  if (!caller?.is_active || !['MASTER', 'GERENTE'].includes(caller.role)) return json({ error: 'Sem permissão.' }, 403);

  const provider = (Deno.env.get('WHATSAPP_PROVIDER') || '').toLowerCase();
  const { action, phone, text } = await req.json().catch(() => ({ action: null, phone: null, text: null }));
  try {
    if (action === 'send') {
      const body = String(text ?? '').trim().slice(0, 4000);
      const to = String(phone ?? '');
      if (provider !== 'evolution') return json({ error: 'Envio pelo painel exige a Evolution API.' }, 400);
      if (!to || !body) return json({ error: 'Conversa ou mensagem vazia.' }, 400);
      const { data: known } = await admin.from('whatsapp_conversations').select('phone').eq('phone', to).maybeSingle();
      if (!known) return json({ error: 'Conversa não encontrada.' }, 404);
      const id = await sendText(to, body);
      await admin.from('whatsapp_bot_messages').upsert(
        { phone: to, direction: 'HUMAN', body, provider_message_id: id },
        { onConflict: 'provider_message_id', ignoreDuplicates: true },
      );
      // Mesma regra de responder pelo celular: a equipe assumiu, o robô sai da conversa
      const { data: settings } = await admin.from('restaurant_settings').select('whatsapp_bot').limit(1).maybeSingle();
      const bot = settings?.whatsapp_bot ?? {};
      const hours = Number(bot.pause_hours) || 4;
      await admin.from('whatsapp_conversations').update({
        last_message_at: new Date().toISOString(),
        last_message_preview: body.slice(0, 120),
        ...(bot.pause_on_human === false ? {} : { bot_paused_until: new Date(Date.now() + hours * 3_600_000).toISOString(), pause_reason: 'HUMAN' }),
      }).eq('phone', to);
      return json({ ok: true });
    }
    if (action === 'connect') return json(await connectQr());
    if (action === 'logout') {
      await logoutInstance();
      return json({ ok: true });
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
  const state = await connectionState();
  if (state.connected) void ensureAlwaysOnline();
  const account = state.connected ? await connectedAccount() : { number: null, profileName: null };
  return json({ provider, instance: Deno.env.get('EVOLUTION_INSTANCE') || null, ...state, ...account });
});
