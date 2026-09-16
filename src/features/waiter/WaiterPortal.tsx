import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LogOut, Smartphone, Volume2, VolumeX } from 'lucide-react';
import { audioService } from '../../lib/audio';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAuthStore } from '../../stores/useAuthStore';
import { useShiftStore } from '../../stores/useShiftStore';
import type { Profile } from '../../types/domain';
import { WaiterModule } from './WaiterModule';

export function isWaiterProfile(value: unknown): value is Profile {
  if (!value || typeof value !== 'object') return false;
  return 'id' in value && typeof value.id === 'string'
    && 'name' in value && typeof value.name === 'string'
    && 'email' in value && typeof value.email === 'string'
    && 'role' in value && value.role === 'GARCOM'
    && 'is_active' in value && value.is_active === true
    && 'created_at' in value && typeof value.created_at === 'string'
    && 'updated_at' in value && typeof value.updated_at === 'string';
}

export function WaiterPortal() {
  const { currentProfile, availableProfiles, setProfile } = useAuthStore();
  const { currentShift } = useShiftStore();
  const previousProfile = useRef(currentProfile);
  const headerRef = useRef<HTMLElement>(null);
  const [identified, setIdentified] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [profileId, setProfileId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [audio, setAudio] = useState(() => audioService.getAudioEnabled());
  const profiles = availableProfiles.filter(isWaiterProfile);

  useEffect(() => {
    document.title = 'Garçom | Sabor da Carne';
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      setProfile(previousProfile.current);
    };
  }, [setProfile]);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const measure = () => document.documentElement.style.setProperty('--app-header-height', `${header.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    measure();
    return () => observer.disconnect();
  }, [identified]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setIdentified(false);
        setProfile(previousProfile.current);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [setProfile]);

  const enter = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      let profile: unknown;
      if (isSupabaseConfigured) {
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
        const { data: staff, error: profileError } = await supabase.from('profiles').select('id,name,email,role,is_active,created_at,updated_at').eq('id', data.user.id).single();
        if (profileError) throw profileError;
        profile = staff;
      } else {
        profile = profiles.find((staff) => staff.id === profileId);
      }
      if (!isWaiterProfile(profile)) throw new Error('Selecione ou utilize uma conta ativa de garçom.');
      setProfile(profile);
      setPassword('');
      setIdentified(true);
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível entrar no atendimento.');
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    setBusy(true);
    setError(null);
    if (isSupabaseConfigured) {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setError(signOutError.message);
        setBusy(false);
        return;
      }
    }
    setIdentified(false);
    setProfile(previousProfile.current);
    setBusy(false);
  };

  return (
    <div className="waiter-portal min-h-screen bg-canvas">
      <a href="#waiter-content" onClick={(event) => { event.preventDefault(); document.getElementById('waiter-content')?.focus(); }} className="skip-link">Pular para o atendimento</a>
      <header ref={headerRef} className="app-header">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3"><Smartphone className="h-6 w-6 text-brand-700" /><div><p className="font-bold">Sabor da Carne</p><p className="text-xs text-ink-muted">Área do garçom{identified ? ` · ${currentProfile.name}` : ''}</p></div></div>
          {identified && <div className="flex gap-2"><button type="button" className="icon-button" aria-label={audio ? 'Desativar alertas sonoros' : 'Ativar alertas sonoros'} aria-pressed={audio} onClick={() => { audioService.setAudioEnabled(!audio); setAudio(!audio); if (!audio) audioService.playOrderReadySound(); }}>{audio ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}</button><button type="button" className="btn-secondary" disabled={busy} onClick={leave}><LogOut className="h-4 w-4" />Sair</button></div>}
        </div>
      </header>
      <main id="waiter-content" tabIndex={-1} className="mx-auto max-w-5xl outline-none">
        <div className="m-4 space-y-3" role="status">
          {!isSupabaseConfigured ? (
            <p className="notice border-amber-200 bg-amber-50 text-amber-900">
              Demonstração local: mesas e pedidos desta sessão não são sincronizados com outros aparelhos. Não utilize para atendimento real.
            </p>
          ) : (
            <p className="notice border-emerald-200 bg-emerald-50 text-emerald-900 flex items-center gap-2 font-medium">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Sincronização ativa: pedidos e mesas integrados em tempo real com a produção e o caixa.
            </p>
          )}
          {!online && <p className="notice border-rose-200 bg-rose-50 text-rose-800">Sem conexão. Não há confirmação de envio a outros aparelhos.</p>}
          {identified && <p className="text-sm text-ink-muted">{currentShift?.status === 'ABERTO' ? `Turno aberto: ${currentShift.name}` : 'Turno fechado. Solicite a abertura ao gerente no painel.'}</p>}
        </div>
        {error && <p role="alert" className="notice m-4 border-rose-200 bg-rose-50 text-rose-800">{error}</p>}
        {identified && isWaiterProfile(currentProfile) ? <WaiterModule dedicated /> : (
          <form onSubmit={enter} className="surface-card mx-auto my-6 w-[calc(100%_-_2rem)] max-w-md space-y-5 p-5">
            <div><p className="eyebrow">Atendimento no celular</p><h1 className="text-2xl font-bold">Entrar como garçom</h1><p className="mt-2 text-sm text-ink-muted">Identifique-se para selecionar mesas e lançar pedidos.</p></div>
            {isSupabaseConfigured ? <>
              <div><label htmlFor="waiter-email">E-mail</label><input id="waiter-email" className="mt-1 w-full rounded-xl border p-3" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
              <div><label htmlFor="waiter-password">Senha</label><input id="waiter-password" className="mt-1 w-full rounded-xl border p-3" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
            </> : <div><label htmlFor="waiter-profile">Identificação de demonstração (sem senha)</label><select id="waiter-profile" className="mt-1 w-full rounded-xl border p-3" required value={profileId} onChange={(event) => setProfileId(event.target.value)}><option value="">Selecione seu nome</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select><p className="mt-2 text-xs text-ink-muted">A autenticação individual exige Supabase configurado e um perfil GARCOM ativo.</p></div>}
            <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Entrando...' : 'Entrar no atendimento'}</button>
          </form>
        )}
      </main>
    </div>
  );
}
