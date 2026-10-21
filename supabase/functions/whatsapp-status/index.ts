// ============================================================================
// EDGE FUNCTION: whatsapp-status
// Diz ao painel se a instância da Evolution API está conectada, sem expor a chave.
// Só Master/Gerente logados. Deploy normal (com JWT):
//   supabase functions deploy whatsapp-status
// ============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeadersFor } from '../_shared/cors.ts';
import { connectionState } from '../_shared/evolution.ts';

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
  const state = await connectionState();
  return json({ provider, instance: Deno.env.get('EVOLUTION_INSTANCE') || null, ...state });
});
