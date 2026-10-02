import { useEffect, useState, type FormEvent } from 'react';
import { LockKeyhole } from 'lucide-react';
import { BrandMark } from '../../components/layout/BrandMark';
import { useAuthStore } from '../../stores/useAuthStore';

export function LoginScreen() {
  const { signIn } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Entrar | Sabor da Carne';
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      setPassword('');
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <form onSubmit={submit} className="surface-card w-full max-w-md space-y-5 p-6" aria-labelledby="login-title">
        <BrandMark />
        <div>
          <p className="eyebrow">Acesso da equipe</p>
          <h1 id="login-title" className="flex items-center gap-2 text-2xl font-bold"><LockKeyhole className="h-5 w-5 text-brand-700" aria-hidden="true" />Entrar no sistema</h1>
          <p className="mt-2 text-sm text-ink-muted">Cada colaborador usa o próprio login. O perfil (caixa, cozinha, gerência...) é definido pela gerência.</p>
        </div>
        {error && <p role="alert" className="notice border-rose-200 bg-rose-50 text-rose-800">{error}</p>}
        <div>
          <label htmlFor="login-email">E-mail</label>
          <input id="login-email" className="mt-1 w-full rounded-xl border p-3" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        <div>
          <label htmlFor="login-password">Senha</label>
          <input id="login-password" className="mt-1 w-full rounded-xl border p-3" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        </div>
        <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Entrando...' : 'Entrar'}</button>
        <p className="text-center text-xs text-ink-muted">Garçom no celular? Acesse <a className="font-semibold text-brand-700 underline" href="#/garcom">a área do garçom</a>.</p>
      </form>
    </div>
  );
}
