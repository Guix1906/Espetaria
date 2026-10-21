// ============================================================================
// EDGE FUNCTION: manage-staff
// Cadastro de colaboradores pelo próprio sistema.
// A chave service_role fica apenas aqui (variável automática do Supabase);
// o navegador envia só o JWT do usuário logado.
//
// Regras:
//  * Apenas MASTER ou GERENTE ativos podem usar.
//  * GERENTE não cria, altera nem vê senha de MASTER, e não promove ninguém a MASTER.
//  * Ninguém desativa ou rebaixa a si mesmo (evita ficar sem admin).
// ============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeadersFor } from '../_shared/cors.ts';

const ROLES = ['MASTER', 'GERENTE', 'GARCOM', 'CHURRASQUEIRA', 'COZINHA', 'BAR', 'CAIXA', 'ENTREGADOR'] as const;
type Role = typeof ROLES[number];

// CORS: ALLOWED_ORIGIN nos secrets (um ou vários endereços separados por vírgula);
// os cabeçalhos são aplicados em toda resposta no Deno.serve, conforme a origem do pedido.
const corsHeaders = {};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function assertRole(value: unknown): Role {
  if (typeof value !== 'string' || !ROLES.includes(value as Role)) {
    throw new HttpError(400, 'Papel inválido.');
  }
  return value as Role;
}

function assertPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8) {
    throw new HttpError(400, 'A senha precisa ter pelo menos 8 caracteres.');
  }
  return value;
}

function assertText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `Campo "${field}" obrigatório.`);
  return value.trim();
}

Deno.serve(async (req) => {
  const res = await handle(req);
  for (const [k, v] of Object.entries(corsHeadersFor(req))) res.headers.set(k, v);
  return res;
});

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string;

    // 0. PRIMEIRO ACESSO: sem nenhum Master com login, permite cadastrar o primeiro
    //    administrador pela própria tela do sistema. Depois disso fica bloqueado.
    const needsSetup = async () => {
      const { data: masters } = await admin.from('profiles').select('id').eq('role', 'MASTER').eq('is_active', true);
      for (const m of masters ?? []) {
        const { data } = await admin.auth.admin.getUserById(m.id);
        if (data?.user) return false;
      }
      return true;
    };

    if (action === 'setup_status') {
      return json({ needs_setup: await needsSetup() });
    }

    if (action === 'setup_first_admin') {
      if (!(await needsSetup())) throw new HttpError(403, 'O sistema já possui um administrador. Faça login.');
      const email = assertText(body.email, 'email').toLowerCase();
      const name = assertText(body.name, 'nome');
      const password = assertPassword(body.password);

      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      });
      if (error) throw new HttpError(400, /already/i.test(error.message) ? 'Já existe um usuário com este e-mail.' : error.message);

      // A trigger criou ou vinculou o perfil; promove a Master ativo
      const { error: profileError } = await admin
        .from('profiles')
        .upsert({ id: created.user.id, email, name, role: 'MASTER', is_active: true, updated_at: new Date().toISOString() });
      if (profileError) throw profileError;

      await admin.from('audit_logs').insert({
        user_id: created.user.id,
        action: 'PRIMEIRO_ADMINISTRADOR',
        entity_type: 'profiles',
        entity_id: created.user.id,
        new_data: { email, name, role: 'MASTER' },
      });
      return json({ ok: true }, 201);
    }

    // 1. Identifica quem está chamando pelo JWT
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) throw new HttpError(401, 'Sessão ausente.');
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) throw new HttpError(401, 'Sessão inválida. Faça login novamente.');
    const callerId = userData.user.id;

    const { data: caller } = await admin.from('profiles').select('id, role, is_active').eq('id', callerId).single();
    if (!caller?.is_active || !['MASTER', 'GERENTE'].includes(caller.role)) {
      throw new HttpError(403, 'Somente Master ou Gerente podem gerenciar a equipe.');
    }
    const callerIsMaster = caller.role === 'MASTER';

    const audit = (actionName: string, entityId: string, newData: Record<string, unknown>) =>
      admin.from('audit_logs').insert({
        user_id: callerId,
        action: actionName,
        entity_type: 'profiles',
        entity_id: entityId,
        new_data: newData,
      });

    const loadTarget = async (id: unknown) => {
      if (typeof id !== 'string') throw new HttpError(400, 'Colaborador inválido.');
      const { data } = await admin.from('profiles').select('*').eq('id', id).single();
      if (!data) throw new HttpError(404, 'Colaborador não encontrado.');
      if (data.role === 'MASTER' && !callerIsMaster) {
        throw new HttpError(403, 'Somente o Master pode alterar outro Master.');
      }
      return data;
    };

    switch (action) {
      // ---------------------------------------------------------------- LIST
      case 'list': {
        const { data: profiles, error } = await admin.from('profiles').select('*').order('name');
        if (error) throw error;
        const lastSignIn = new Map<string, string | null>();
        for (let page = 1; ; page++) {
          const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          if (usersError) throw usersError;
          users.users.forEach((u) => lastSignIn.set(u.id, u.last_sign_in_at ?? null));
          if (users.users.length < 1000) break;
        }
        return json({
          staff: profiles.map((p) => ({
            ...p,
            has_login: lastSignIn.has(p.id),
            last_sign_in_at: lastSignIn.get(p.id) ?? null,
          })),
        });
      }

      // -------------------------------------------------------------- CREATE
      case 'create': {
        const email = assertText(body.email, 'email').toLowerCase();
        const name = assertText(body.name, 'nome');
        const role = assertRole(body.role);
        const password = assertPassword(body.password);
        if (role === 'MASTER' && !callerIsMaster) throw new HttpError(403, 'Somente o Master pode criar outro Master.');

        const { data: created, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name },
        });
        if (error) {
          throw new HttpError(400, /already/i.test(error.message) ? 'Já existe um usuário com este e-mail.' : error.message);
        }

        // A trigger on_auth_user_created criou/vinculou o perfil; definimos papel e ativamos.
        const { data: profile, error: profileError } = await admin
          .from('profiles')
          .update({ name, role, is_active: true, updated_at: new Date().toISOString() })
          .eq('id', created.user.id)
          .select()
          .single();
        if (profileError) throw profileError;

        await audit('CRIAR_COLABORADOR', created.user.id, { email, name, role });
        return json({ staff: profile }, 201);
      }

      // -------------------------------------------------------------- UPDATE
      case 'update': {
        const target = await loadTarget(body.id);
        const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };

        if (body.name !== undefined) changes.name = assertText(body.name, 'nome');
        if (body.role !== undefined) {
          const role = assertRole(body.role);
          if (role === 'MASTER' && !callerIsMaster) throw new HttpError(403, 'Somente o Master pode promover a Master.');
          if (target.id === callerId && role !== target.role) throw new HttpError(400, 'Você não pode alterar o próprio papel.');
          changes.role = role;
        }
        if (body.is_active !== undefined) {
          if (typeof body.is_active !== 'boolean') throw new HttpError(400, 'Status inválido.');
          if (target.id === callerId && !body.is_active) throw new HttpError(400, 'Você não pode desativar a si mesmo.');
          changes.is_active = body.is_active;
          // Bloqueia/desbloqueia o login no Auth (encerra acesso imediatamente ao expirar o token)
          const { error: banError } = await admin.auth.admin.updateUserById(target.id, {
            ban_duration: body.is_active ? 'none' : '876000h',
          });
          if (banError) throw new HttpError(500, `Falha ao ${body.is_active ? 'liberar' : 'bloquear'} o login: ${banError.message}`);
        }

        const { data: profile, error } = await admin.from('profiles').update(changes).eq('id', target.id).select().single();
        if (error) throw error;

        await audit('ALTERAR_COLABORADOR', target.id, changes);
        return json({ staff: profile });
      }

      // ------------------------------------------------------ RESET PASSWORD
      case 'reset_password': {
        const target = await loadTarget(body.id);
        const password = assertPassword(body.password);
        const { error } = await admin.auth.admin.updateUserById(target.id, { password });
        if (error) throw new HttpError(400, error.message);
        await audit('REDEFINIR_SENHA', target.id, { email: target.email });
        return json({ ok: true });
      }

      // -------------------------------------------------------------- DELETE
      case 'delete': {
        const target = await loadTarget(body.id);
        if (target.id === callerId) throw new HttpError(400, 'Você não pode excluir a si mesmo.');

        // Remove o login (se existir). Usuário inexistente no Auth não é erro.
        const { error: authError } = await admin.auth.admin.deleteUser(target.id);
        if (authError && !/not.?found/i.test(authError.message)) throw new HttpError(500, `Falha ao remover o login: ${authError.message}`);

        // Tenta apagar o perfil; se houver histórico (pedidos, pagamentos...), mantém inativo para auditoria
        const { error: deleteError } = await admin.from('profiles').delete().eq('id', target.id);
        let keptForHistory = false;
        if (deleteError) {
          if (deleteError.code !== '23503') throw deleteError;
          keptForHistory = true;
          const { error: deactivateError } = await admin
            .from('profiles')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', target.id);
          if (deactivateError) throw deactivateError;
        }

        await audit('EXCLUIR_COLABORADOR', target.id, { email: target.email, name: target.name, role: target.role, kept_for_history: keptForHistory });
        return json({ ok: true, kept_for_history: keptForHistory });
      }

      default:
        throw new HttpError(400, 'Ação inválida.');
    }
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'Erro inesperado.';
    if (status === 500) console.error(err);
    return json({ error: message }, status);
  }
}
