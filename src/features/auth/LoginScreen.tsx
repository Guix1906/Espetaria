import { useEffect, useState, type FormEvent } from 'react';
import { LockKeyhole } from 'lucide-react';
import { AccessTabs, AuthShell, ForgotPassword, PasswordField, authButton, authError, authInput, authLabel, friendlyAuthError, rememberEmail, rememberedEmail } from './AuthShell';
import { useAuthStore } from '../../stores/useAuthStore';

export function LoginScreen() {
  const { signIn } = useAuthStore();
  const [email, setEmail] = useState(() => rememberedEmail('owner'));
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A loja já tem administrador: a tela de "criar administrador" foi retirada (pedido do dono, 14/11).
  useEffect(() => {
    document.title = 'Entrar | Ponto';
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

  return (
    <AuthShell>
      <form onSubmit={submit} className="space-y-5" aria-labelledby="login-title">
        <AccessTabs active="owner" />
        <div className="pt-2">
          <h1 id="login-title" className="text-[30px] font-semibold leading-tight tracking-[-0.02em] text-ink">Entrar</h1>
          <p className="mt-1.5 text-sm text-ink-muted">Gestão completa: proprietário, gerência, caixa e cozinha. Garçons usam a aba <strong className="font-medium text-ink">Garçom</strong>.</p>
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
        <p className="flex items-center justify-center gap-1.5 pt-2 text-xs text-ink-muted"><LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />Cada colaborador usa o próprio login.</p>
      </form>
    </AuthShell>
  );
}
