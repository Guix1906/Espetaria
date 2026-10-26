import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Lock, MoreHorizontal, Pencil, RefreshCw, Trash2, UserPlus, Users, X } from 'lucide-react';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchField } from '../../components/ui/SearchField';
import { formatDateTime, formatRole } from '../../lib/formatters';
import { isSupabaseConfigured } from '../../lib/supabase';
import { staffApi, type StaffMember } from '../../lib/staffApi';
import { useAuthStore } from '../../stores/useAuthStore';
import type { AppRole } from '../../types/enums';

const ALL_ROLES: AppRole[] = ['MASTER', 'GERENTE', 'GARCOM', 'CHURRASQUEIRA', 'COZINHA', 'BAR', 'CAIXA', 'ENTREGADOR'];

/** Última lista carregada: voltar à tela mostra a equipe na hora, enquanto atualiza. */
let staffCache: StaffMember[] = [];

type ModalState =
  | { kind: 'create' }
  | { kind: 'edit'; member: StaffMember }
  | { kind: 'password'; member: StaffMember }
  | { kind: 'delete'; member: StaffMember }
  | null;

export function TeamManagementView() {
  const { currentProfile } = useAuthStore();
  const canManage = currentProfile.role === 'MASTER' || currentProfile.role === 'GERENTE';
  const isMaster = currentProfile.role === 'MASTER';
  const assignableRoles = isMaster ? ALL_ROLES : ALL_ROLES.filter((role) => role !== 'MASTER');

  const [staff, setStaffState] = useState<StaffMember[]>(() => staffCache);
  const setStaff = useCallback((next: StaffMember[] | ((list: StaffMember[]) => StaffMember[])) => {
    setStaffState((list) => { staffCache = typeof next === 'function' ? next(list) : next; return staffCache; });
  }, []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<ModalState>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    // 1) lista da tabela aparece na hora; 2) último acesso chega depois pela Edge Function
    const quick = staffApi.listQuick().then((list) => {
      setStaff((current) => list.map((p) => ({ ...current.find((m) => m.id === p.id), ...p })));
    }).catch(() => undefined);
    try {
      const full = await staffApi.list();
      await quick;
      setStaff(full);
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível carregar a equipe.');
    } finally {
      setLoading(false);
    }
  }, [setStaff]);

  useEffect(() => {
    if (canManage) void load();
  }, [canManage, load]);

  if (!canManage) {
    return (
      <div className="page-layout">
        <EmptyState title="Acesso restrito" description="Somente o Master ou o Gerente podem gerenciar a equipe." />
      </div>
    );
  }

  const query = search.trim().toLocaleLowerCase('pt-BR');
  const filtered = staff.filter((m) => `${m.name} ${m.email} ${formatRole(m.role)}`.toLocaleLowerCase('pt-BR').includes(query));

  const toggleActive = async (member: StaffMember) => {
    setError(null);
    try {
      const updated = await staffApi.update(member.id, { is_active: !member.is_active });
      setStaff((list) => list.map((m) => (m.id === member.id ? { ...m, ...updated } : m)));
      setNotice(`${member.name} ${updated.is_active ? 'ativado(a)' : 'desativado(a)'}.`);
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível alterar o status.');
    }
  };

  const canEdit = (member: StaffMember) => (isMaster || member.role !== 'MASTER') && !isRemoved(member);

  return (
    <div className="page-layout">
      <PageHeader
        eyebrow="Controle"
        title="Equipe"
        description="Cadastre colaboradores, defina o papel de cada um e controle quem pode acessar o sistema."
        icon={Users}
        actions={<div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => void load()} disabled={loading}><RefreshCw className="h-4 w-4" aria-hidden="true" />Atualizar</button>
          <button type="button" className="btn-primary" onClick={() => setModal({ kind: 'create' })}><UserPlus className="h-4 w-4" aria-hidden="true" />Novo colaborador</button>
        </div>}
      />

      {!isSupabaseConfigured && <p className="notice border-amber-200 bg-amber-50 text-amber-900">Modo demonstração: os colaboradores ficam apenas neste navegador e não recebem login real.</p>}
      {error && <p role="alert" className="notice border-rose-200 bg-rose-50 text-rose-800">{error}</p>}
      {notice && <p role="status" className="notice flex items-center justify-between border-emerald-200 bg-emerald-50 text-emerald-900">{notice}<button type="button" className="icon-button" aria-label="Fechar aviso" onClick={() => setNotice(null)}><X className="h-4 w-4" /></button></p>}

      <SearchField value={search} onChange={setSearch} label="Buscar colaborador" placeholder="Buscar por nome, e-mail ou papel" className="w-full sm:w-80" />

      {loading && staff.length === 0 ? <p className="text-sm text-ink-muted" role="status">Carregando equipe...</p>
        : filtered.length === 0 ? <EmptyState title="Nenhum colaborador encontrado" description="Cadastre o primeiro colaborador pelo botão “Novo colaborador”." />
        : (
          <div className="surface-card overflow-hidden">
            <ul className="divide-y divide-line">
              {filtered.map((member) => {
                const isSelf = member.id === currentProfile.id;
                return (
                  <li key={member.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                        {member.name}
                        {isSelf && <span className="status-badge bg-brand-50 text-brand-800">Você</span>}
                        <span className={`status-badge ${member.is_active ? 'bg-emerald-50 text-emerald-800' : 'border-line bg-surface-muted text-ink-muted'}`}>{member.is_active ? 'Ativo' : isRemoved(member) ? 'Excluído (histórico mantido)' : 'Inativo'}</span>
                      </p>
                      <p className="truncate text-sm text-ink-muted">{member.email} · {formatRole(member.role)}</p>
                      {isSupabaseConfigured && <p className="text-xs text-ink-muted">{member.last_sign_in_at ? `Último acesso: ${formatDateTime(member.last_sign_in_at)}` : member.has_login === undefined ? 'Carregando último acesso...' : member.has_login ? 'Nunca acessou' : 'Sem login criado'}</p>}
                    </div>
                    {canEdit(member) ? (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn-secondary min-h-[44px]" onClick={() => setModal({ kind: 'edit', member })}><Pencil className="h-4 w-4" aria-hidden="true" />Editar</button>
                        {/* No notebook as ações ficam à vista; no celular vão para o menu "mais" */}
                        <span className="hidden flex-wrap gap-2 sm:flex">
                          {isSupabaseConfigured && <button type="button" className="btn-secondary min-h-[44px]" onClick={() => setModal({ kind: 'password', member })}><KeyRound className="h-4 w-4" aria-hidden="true" />Senha</button>}
                          {!isSelf && !isRemoved(member) && <button type="button" className="btn-secondary min-h-[44px]" onClick={() => void toggleActive(member)}>{member.is_active ? 'Desativar' : 'Ativar'}</button>}
                          {!isSelf && !isRemoved(member) && <button type="button" className="btn-secondary min-h-[44px] text-rose-700 hover:bg-rose-50" onClick={() => setModal({ kind: 'delete', member })}><Trash2 className="h-4 w-4" aria-hidden="true" />Excluir</button>}
                        </span>
                        {(isSupabaseConfigured || (!isSelf && !isRemoved(member))) && (
                          <details className="relative sm:hidden">
                            <summary className="btn-secondary min-h-[44px] w-11 list-none px-0 [&::-webkit-details-marker]:hidden" aria-label={`Mais ações para ${member.name}`}><MoreHorizontal className="h-4 w-4" /></summary>
                            <div className="absolute right-0 z-20 mt-1 w-44 rounded-2xl border border-line bg-surface p-1 shadow-floating">
                              {isSupabaseConfigured && <button type="button" className="flex h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium text-ink hover:bg-surface-muted" onClick={() => setModal({ kind: 'password', member })}><KeyRound className="h-4 w-4" aria-hidden="true" />Senha</button>}
                              {!isSelf && !isRemoved(member) && <button type="button" className="flex h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium text-ink hover:bg-surface-muted" onClick={() => void toggleActive(member)}>{member.is_active ? 'Desativar' : 'Ativar'}</button>}
                              {!isSelf && !isRemoved(member) && <button type="button" className="flex h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50" onClick={() => setModal({ kind: 'delete', member })}><Trash2 className="h-4 w-4" aria-hidden="true" />Excluir</button>}
                            </div>
                          </details>
                        )}
                      </div>
                    ) : <span className="flex items-center gap-1 text-xs text-ink-muted"><Lock className="h-3.5 w-3.5" aria-hidden="true" />{isRemoved(member) ? 'Sem acesso ao sistema' : 'Apenas o Master altera'}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

      {modal?.kind === 'create' && (
        <StaffFormModal
          title="Novo colaborador"
          roles={assignableRoles}
          onClose={() => setModal(null)}
          onSubmit={async (values) => {
            const created = await staffApi.create({ ...values, password: values.password! });
            setStaff((list) => [...list.filter((m) => m.id !== created.id), { ...created, has_login: true }].sort((a, b) => a.name.localeCompare(b.name)));
            setNotice(created.email.toLowerCase() !== values.email.trim().toLowerCase()
              ? `${created.name} cadastrado(a) com o e-mail compartilhado. Para entrar: e-mail ${values.email.trim()}, escolher o nome "${created.name}" e a senha dele(a).`
              : `${created.name} cadastrado(a). Informe o e-mail e a senha ao colaborador.`);
          }}
        />
      )}

      {modal?.kind === 'edit' && (
        <StaffFormModal
          title={`Editar ${modal.member.name}`}
          roles={assignableRoles}
          initial={modal.member}
          lockRole={modal.member.id === currentProfile.id}
          onClose={() => setModal(null)}
          onSubmit={async (values) => {
            const emailChanged = values.email.trim().toLowerCase() !== modal.member.email.toLowerCase();
            const updated = await staffApi.update(modal.member.id, { name: values.name, role: values.role, ...(emailChanged ? { email: values.email } : {}) });
            setStaff((list) => list.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
            if (values.password) await staffApi.resetPassword(modal.member.id, values.password);
            setNotice(emailChanged || values.password
              ? `Dados de ${updated.name} atualizados. Informe o novo ${[emailChanged && 'e-mail', values.password && 'senha'].filter(Boolean).join(' e a nova ')} ao colaborador.`
              : `Dados de ${updated.name} atualizados.`);
          }}
        />
      )}

      {modal?.kind === 'delete' && (
        <DeleteModal
          member={modal.member}
          onClose={() => setModal(null)}
          onConfirm={async () => {
            const { kept_for_history } = await staffApi.remove(modal.member.id);
            if (kept_for_history) {
              setStaff((list) => list.map((m) => (m.id === modal.member.id ? { ...m, is_active: false, has_login: false, last_sign_in_at: null } : m)));
              setNotice(`${modal.member.name} excluído(a). O login foi removido; o nome continua apenas no histórico de pedidos e pagamentos.`);
            } else {
              setStaff((list) => list.filter((m) => m.id !== modal.member.id));
              setNotice(`${modal.member.name} excluído(a).`);
            }
          }}
        />
      )}

      {modal?.kind === 'password' && (
        <PasswordModal
          member={modal.member}
          onClose={() => setModal(null)}
          onSubmit={async (password) => {
            await staffApi.resetPassword(modal.member.id, password);
            setNotice(`Senha de ${modal.member.name} redefinida.`);
          }}
        />
      )}
    </div>
  );
}

interface StaffFormValues {
  name: string;
  email: string;
  role: AppRole;
  password?: string;
}

function StaffFormModal({ title, roles, initial, lockRole, onClose, onSubmit }: {
  title: string;
  roles: AppRole[];
  initial?: StaffMember;
  lockRole?: boolean;
  onClose: () => void;
  onSubmit: (values: StaffFormValues) => Promise<void>;
}) {
  const isCreate = !initial;
  const [name, setName] = useState(initial?.name ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [role, setRole] = useState<AppRole>(initial?.role ?? 'GARCOM');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!isCreate && password && password.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
      if (!isCreate && password !== confirm) throw new Error('As senhas não conferem.');
      await onSubmit({ name, email, role, password: password || undefined });
      onClose();
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog label={title} onClose={onClose} placement="sheet">
      <form onSubmit={submit} className="dialog-panel w-full max-w-md space-y-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
          <h2 className="text-xl font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="icon-button" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
        {error && <p role="alert" className="notice border-rose-200 bg-rose-50 text-rose-800">{error}</p>}
        <div><label htmlFor="staff-name">Nome</label><input id="staff-name" className="mt-1 w-full rounded-md border border-line-strong bg-surface p-3 text-base" required value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label htmlFor="staff-email">E-mail (login)</label><input id="staff-email" className="mt-1 w-full rounded-md border border-line-strong bg-surface p-3 text-base" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />{!isCreate && <p className="mt-1 text-xs text-ink-muted">Ao trocar, o colaborador passa a entrar com o e-mail novo.</p>}</div>
        <div>
          <label htmlFor="staff-role">Papel</label>
          <select id="staff-role" className="mt-1 w-full rounded-md border border-line-strong bg-surface p-3 text-base" value={role} disabled={lockRole} onChange={(e) => setRole(e.target.value as AppRole)}>
            {(roles.includes(role) ? roles : [role, ...roles]).map((r) => <option key={r} value={r}>{formatRole(r)}</option>)}
          </select>
          {lockRole && <p className="mt-1 text-xs text-ink-muted">Você não pode alterar o próprio papel.</p>}
        </div>
        {isCreate && (
          <div>
            <label htmlFor="staff-password">Senha inicial</label>
            <input id="staff-password" className="mt-1 w-full rounded-md border border-line-strong bg-surface p-3 text-base" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="mt-1 text-xs text-ink-muted">Mínimo de 8 caracteres. Entregue ao colaborador pessoalmente.</p>
          </div>
        )}
        {!isCreate && isSupabaseConfigured && (
          <>
            <div>
              <label htmlFor="staff-new-password">Nova senha</label>
              <input id="staff-new-password" className="mt-1 w-full rounded-md border border-line-strong bg-surface p-3 text-base" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
              <p className="mt-1 text-xs text-ink-muted">Deixe em branco para manter a senha atual. Mínimo de 8 caracteres.</p>
            </div>
            {password && <div><label htmlFor="staff-confirm-password">Confirmar nova senha</label><input id="staff-confirm-password" className="mt-1 w-full rounded-md border border-line-strong bg-surface p-3 text-base" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>}
          </>
        )}
        <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Salvando...' : isCreate ? 'Cadastrar colaborador' : 'Salvar alterações'}</button>
      </form>
    </Dialog>
  );
}

/** Perfil sem login e inativo: excluído, mantido só pelo histórico. */
function isRemoved(member: StaffMember) {
  return isSupabaseConfigured && !member.is_active && member.has_login === false;
}

function DeleteModal({ member, onClose, onConfirm }: { member: StaffMember; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível excluir.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog label={`Excluir ${member.name}`} onClose={onClose} placement="sheet">
      <div className="dialog-panel w-full max-w-md space-y-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
          <div><p className="eyebrow">Excluir colaborador</p><h2 className="text-xl font-bold">{member.name}</h2></div>
          <button type="button" onClick={onClose} className="icon-button" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
        {error && <p role="alert" className="notice border-rose-200 bg-rose-50 text-rose-800">{error}</p>}
        <p className="text-sm text-ink-secondary">O acesso de <strong>{member.email}</strong> será removido imediatamente e não poderá ser desfeito. Se o colaborador já registrou pedidos, pagamentos ou turnos, o nome continua aparecendo apenas nesses registros.</p>
        <p className="text-xs text-ink-muted">Para afastar alguém temporariamente, prefira <strong>Desativar</strong>.</p>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="btn-primary flex-1 bg-rose-700 hover:bg-rose-800" onClick={() => void confirm()} disabled={busy}><Trash2 className="h-4 w-4" aria-hidden="true" />{busy ? 'Excluindo...' : 'Excluir definitivamente'}</button>
        </div>
      </div>
    </Dialog>
  );
}

function PasswordModal({ member, onClose, onSubmit }: { member: StaffMember; onClose: () => void; onSubmit: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirm) { setError('As senhas não conferem.'); return; }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(password);
      onClose();
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível redefinir a senha.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog label={`Redefinir senha de ${member.name}`} onClose={onClose} placement="sheet">
      <form onSubmit={submit} className="dialog-panel w-full max-w-md space-y-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
          <div><p className="eyebrow">Redefinir senha</p><h2 className="text-xl font-bold">{member.name}</h2></div>
          <button type="button" onClick={onClose} className="icon-button" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
        {error && <p role="alert" className="notice border-rose-200 bg-rose-50 text-rose-800">{error}</p>}
        <div><label htmlFor="new-password">Nova senha</label><input id="new-password" className="mt-1 w-full rounded-md border border-line-strong bg-surface p-3 text-base" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <div><label htmlFor="confirm-password">Confirmar senha</label><input id="confirm-password" className="mt-1 w-full rounded-md border border-line-strong bg-surface p-3 text-base" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
        <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Salvando...' : 'Redefinir senha'}</button>
      </form>
    </Dialog>
  );
}
