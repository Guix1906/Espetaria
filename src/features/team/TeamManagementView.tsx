import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Lock, Pencil, RefreshCw, UserPlus, Users, X } from 'lucide-react';
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

type ModalState =
  | { kind: 'create' }
  | { kind: 'edit'; member: StaffMember }
  | { kind: 'password'; member: StaffMember }
  | null;

export function TeamManagementView() {
  const { currentProfile } = useAuthStore();
  const canManage = currentProfile.role === 'MASTER' || currentProfile.role === 'GERENTE';
  const isMaster = currentProfile.role === 'MASTER';
  const assignableRoles = isMaster ? ALL_ROLES : ALL_ROLES.filter((role) => role !== 'MASTER');

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<ModalState>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStaff(await staffApi.list());
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível carregar a equipe.');
    } finally {
      setLoading(false);
    }
  }, []);

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

  const canEdit = (member: StaffMember) => isMaster || member.role !== 'MASTER';

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
                        {isSelf && <span className="status-badge border-brand-200 bg-brand-50 text-brand-800">Você</span>}
                        <span className={`status-badge ${member.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-line bg-surface-muted text-ink-muted'}`}>{member.is_active ? 'Ativo' : 'Inativo'}</span>
                      </p>
                      <p className="truncate text-sm text-ink-muted">{member.email} · {formatRole(member.role)}</p>
                      {isSupabaseConfigured && <p className="text-xs text-ink-muted">{member.last_sign_in_at ? `Último acesso: ${formatDateTime(member.last_sign_in_at)}` : member.has_login ? 'Nunca acessou' : 'Sem login criado'}</p>}
                    </div>
                    {canEdit(member) ? (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn-secondary" onClick={() => setModal({ kind: 'edit', member })}><Pencil className="h-4 w-4" aria-hidden="true" />Editar</button>
                        {isSupabaseConfigured && <button type="button" className="btn-secondary" onClick={() => setModal({ kind: 'password', member })}><KeyRound className="h-4 w-4" aria-hidden="true" />Senha</button>}
                        {!isSelf && <button type="button" className="btn-secondary" onClick={() => void toggleActive(member)}>{member.is_active ? 'Desativar' : 'Ativar'}</button>}
                      </div>
                    ) : <span className="flex items-center gap-1 text-xs text-ink-muted"><Lock className="h-3.5 w-3.5" aria-hidden="true" />Apenas o Master altera</span>}
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
            setNotice(`${created.name} cadastrado(a). Informe o e-mail e a senha ao colaborador.`);
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
            const updated = await staffApi.update(modal.member.id, { name: values.name, role: values.role });
            setStaff((list) => list.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
            setNotice(`Dados de ${updated.name} atualizados.`);
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name, email, role, password: isCreate ? password : undefined });
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
        <div><label htmlFor="staff-name">Nome</label><input id="staff-name" className="mt-1 w-full rounded-xl border p-3" required value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label htmlFor="staff-email">E-mail (login)</label><input id="staff-email" className="mt-1 w-full rounded-xl border p-3" type="email" required disabled={!isCreate} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div>
          <label htmlFor="staff-role">Papel</label>
          <select id="staff-role" className="mt-1 w-full rounded-xl border p-3" value={role} disabled={lockRole} onChange={(e) => setRole(e.target.value as AppRole)}>
            {(roles.includes(role) ? roles : [role, ...roles]).map((r) => <option key={r} value={r}>{formatRole(r)}</option>)}
          </select>
          {lockRole && <p className="mt-1 text-xs text-ink-muted">Você não pode alterar o próprio papel.</p>}
        </div>
        {isCreate && (
          <div>
            <label htmlFor="staff-password">Senha inicial</label>
            <input id="staff-password" className="mt-1 w-full rounded-xl border p-3" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="mt-1 text-xs text-ink-muted">Mínimo de 8 caracteres. Entregue ao colaborador pessoalmente.</p>
          </div>
        )}
        <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Salvando...' : isCreate ? 'Cadastrar colaborador' : 'Salvar alterações'}</button>
      </form>
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
        <div><label htmlFor="new-password">Nova senha</label><input id="new-password" className="mt-1 w-full rounded-xl border p-3" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <div><label htmlFor="confirm-password">Confirmar senha</label><input id="confirm-password" className="mt-1 w-full rounded-xl border p-3" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
        <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Salvando...' : 'Redefinir senha'}</button>
      </form>
    </Dialog>
  );
}
