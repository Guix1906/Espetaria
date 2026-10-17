import { useEffect, useState, type FormEvent } from 'react';
import { LockKeyhole } from 'lucide-react';
import { AccessTabs, AuthShell, ForgotPassword, PasswordField, authButton, authError, authInput, authLabel, friendlyAuthError, rememberEmail, rememberedEmail } from './AuthShell';
import { staffApi } from '../../lib/staffApi';
import { useAuthStore } from '../../stores/useAuthStore';

export function LoginScreen() {
  const { signIn } = useAuthStore();
  const [email, setEmail] = useState(() => rememberedEmail('owner'));
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Primeiro acesso: ainda não existe nenhum administrador com login
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    document.title = 'Entrar | Ponto';
    staffApi.needsSetup().then(setNeedsSetup).catch(() => setNeedsSetup(false));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      rememberEmail('owner', email);
      setPassword('');
    } catch (failure: unknown) {
      setError(friendlyAuthError(failure));
    } finally {
      setBusy(false);
    }
  };

  if (needsSetup) return <FirstAdminSetup onDone={() => setNeedsSetup(false)} />;

  return (
    <AuthShell>
      <form onSubmit={submit} className="space-y-5" aria-labelledby="login-title">
        <AccessTabs active="owner" />
        <div className="pt-2">
          <h1 id="login-title" className="text-[30px] font-semibold leading-tight tracking-[-0.02em] text-[#2B211C]">Entrar</h1>
          <p className="mt-1.5 text-sm text-[#6B5D53]">Gestão completa: proprietário, gerência, caixa e cozinha. Garçons usam a aba <strong className="font-medium text-[#2B211C]">Garçom</strong>.</p>
        </div>
        {error && <p role="alert" className={authError}>{error}</p>}
        <div>
          <label htmlFor="login-email" className={authLabel}>E-mail</label>
          <input id="login-email" className={authInput} type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        <div>
          <label htmlFor="login-password" className={authLabel}>Senha</label>
          <PasswordField id="login-password" value={password} onChange={setPassword} />
        </div>
        <button type="submit" disabled={busy} className={authButton}>{busy ? 'Entrando...' : 'Entrar'}</button>
        <ForgotPassword />
        <p className="flex items-center justify-center gap-1.5 pt-2 text-xs text-[#6B5D53]"><LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />Cada colaborador usa o próprio login.</p>
      </form>
    </AuthShell>
  );
}
/** Cadastro do primeiro administrador (Master). Some assim que ele existir. */
function FirstAdminSetup({ onDone }: { onDone: () => void }) {
  const { signIn } = useAuthStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (password !== confirm) { setError('As senhas não conferem.'); return; }
    setBusy(true);
    setError(null);
    try {
      await staffApi.setupFirstAdmin({ name: name.trim(), email: email.trim(), password });
      await signIn(email, password);
      onDone();
    } catch (failure: unknown) {
      setError(friendlyAuthError(failure, 'Não foi possível concluir o cadastro.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <form onSubmit={submit} className="space-y-4" aria-labelledby="setup-title">
        <div>
          <p className="font-mono text-xs tracking-[0.12em] text-[#B5502E]">PRIMEIRO ACESSO</p>
          <h1 id="setup-title" className="mt-1 text-[30px] font-semibold leading-tight tracking-[-0.02em] text-[#2B211C]">Criar administrador</h1>
          <p className="mt-1.5 text-sm text-[#6B5D53]">Cadastre o responsável pelo sistema. Depois, ele cadastra gerentes, garçons e demais colaboradores em <strong className="font-medium text-[#2B211C]">Equipe</strong>. Esta tela aparece só uma vez.</p>
        </div>
        {error && <p role="alert" className={authError}>{error}</p>}
        <div><label htmlFor="setup-name" className={authLabel}>Nome</label><input id="setup-name" className={authInput} autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label htmlFor="setup-email" className={authLabel}>E-mail (login)</label><input id="setup-email" className={authInput} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="setup-password" className={authLabel}>Senha</label><PasswordField id="setup-password" autoComplete="new-password" minLength={8} value={password} onChange={setPassword} /></div>
          <div><label htmlFor="setup-confirm" className={authLabel}>Confirmar senha</label><PasswordField id="setup-confirm" autoComplete="new-password" minLength={8} value={confirm} onChange={setConfirm} /></div>
        </div>
        <button type="submit" disabled={busy} className={authButton}>{busy ? 'Criando...' : 'Criar administrador e entrar'}</button>
      </form>
    </AuthShell>
  );
}