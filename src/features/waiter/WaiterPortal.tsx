import { AccessTabs, AuthShell, ForgotPassword, PasswordField, authButton, authError, authInput, authLabel, friendlyAuthError, rememberEmail, rememberedEmail } from '../auth/AuthShell';
import { PontoLogo } from '../../components/layout/BrandMark';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { LogOut, Volume2, VolumeX } from 'lucide-react';
import { audioService } from '../../lib/audio';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAuthStore } from '../../stores/useAuthStore';
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

/** Master e Gerente também podem usar a área do garçom com o próprio login. */
function isManagerProfile(value: unknown): value is Profile {
  return !!value && typeof value === 'object' && 'role' in value && (value.role === 'MASTER' || value.role === 'GERENTE')
    && 'is_active' in value && value.is_active === true;
}

/** Volta ao painel administrativo (garante a troca de tela mesmo se o evento de hash não disparar). */
function goToPanel() {
  if (window.location.hash !== '#/') window.location.hash = '#/';
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function WaiterPortal() {
  const { currentProfile, availableProfiles, setProfile, signIn, signOut, isAuthenticated } = useAuthStore();
  const previousProfile = useRef(currentProfile);
  const headerRef = useRef<HTMLElement>(null);
  // Gerência logada no painel entra direto, sem novo login
  // (na demonstração local continua a escolha de garçom de exemplo)
  const isManager = isSupabaseConfigured && isAuthenticated && isManagerProfile(previousProfile.current);
  const [identified, setIdentified] = useState(() => isManager || (isSupabaseConfigured && isAuthenticated && isWaiterProfile(currentProfile)));
  const [email, setEmail] = useState(() => rememberedEmail('waiter'));
  const [password, setPassword] = useState('');
  const [profileId, setProfileId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [audio, setAudio] = useState(() => audioService.getAudioEnabled());
  const [menuOpen, setMenuOpen] = useState(false);
  const profiles = availableProfiles.filter(isWaiterProfile);
  const toggleAudio = () => { audioService.setAudioEnabled(!audio); setAudio(!audio); if (!audio) audioService.playOrderReadySound(); };

  // Só a demonstração local troca o perfil da tela. Com Supabase, o perfil exibido
  // é SEMPRE o da sessão real: restaurar o anterior deixava a tela como "Master"
  // enquanto o login ativo era o do garçom (ações recusadas pelo banco).
  const restoreDemoProfile = useCallback(() => {
    if (!isSupabaseConfigured) setProfile(previousProfile.current);
  }, [setProfile]);

  useEffect(() => {
    document.title = 'Garçom | Ponto';
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      restoreDemoProfile();
    };
  }, [restoreDemoProfile]);

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
        restoreDemoProfile();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [restoreDemoProfile]);

  const enter = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      let profile: unknown;
      if (isSupabaseConfigured) {
        await signIn(email, password);
        profile = useAuthStore.getState().currentProfile;
        if (!isWaiterProfile(profile)) await signOut();
      } else {
        profile = profiles.find((staff) => staff.id === profileId);
      }
      if (!isWaiterProfile(profile)) throw new Error(isSupabaseConfigured ? 'Esta conta não é de garçom. Use a aba Proprietário.' : 'Selecione seu nome para entrar.');
      if (isSupabaseConfigured) rememberEmail('waiter', email);
      setProfile(profile);
      setPassword('');
      setIdentified(true);
    } catch (failure: unknown) {
      setError(friendlyAuthError(failure, 'Não foi possível entrar no atendimento.'));
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    // Gerência: só volta ao painel, mantendo a sessão
    if (isManager) {
      goToPanel();
      return;
    }
    setBusy(true);
    setError(null);
    if (isSupabaseConfigured) {
      try {
        await signOut();
      } catch (failure: unknown) {
        setError(failure instanceof Error ? failure.message : 'Não foi possível sair.');
        setBusy(false);
        return;
      }
    }
    setIdentified(false);
    restoreDemoProfile();
    setBusy(false);
    // Volta para a entrada do garçom (mesmo se o login foi feito pela aba Proprietário)
    if (window.location.hash !== '#/garcom') window.location.hash = '#/garcom';
  };

  if (!(identified && (isWaiterProfile(currentProfile) || isManager))) {
    return (
      <AuthShell>
        <form onSubmit={enter} className="space-y-5" aria-labelledby="waiter-login-title">
          <AccessTabs active="waiter" />
          <div className="pt-2">
            <h1 id="waiter-login-title" className="text-[30px] font-semibold leading-tight tracking-[-0.02em] text-[#2B211C]">Entrar</h1>
            <p className="mt-1.5 text-sm text-[#6B5D53]">Atendimento no celular: mesas, pedidos e conta.</p>
          </div>
          {!isSupabaseConfigured && <p className="rounded-[10px] bg-[#FBF4E6] px-3.5 py-3 text-xs text-[#734E0F]">Demonstração local: pedidos não são sincronizados com outros aparelhos.</p>}
          {!online && <p className="rounded-[10px] bg-[#F8ECEC] px-3.5 py-3 text-xs text-[#9B2C2C]">Sem conexão com a internet.</p>}
          {error && <p role="alert" className={authError}>{error}</p>}
          {isSupabaseConfigured ? <>
            <div><label htmlFor="waiter-email" className={authLabel}>E-mail</label><input id="waiter-email" className={authInput} type="email" inputMode="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
            <div><label htmlFor="waiter-password" className={authLabel}>Senha</label><PasswordField id="waiter-password" value={password} onChange={setPassword} /></div>
          </> : <div><label htmlFor="waiter-profile" className={authLabel}>Seu nome (demonstração, sem senha)</label><select id="waiter-profile" className={authInput} required value={profileId} onChange={(event) => setProfileId(event.target.value)}><option value="">Selecione</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></div>}
          <button type="submit" disabled={busy} className={authButton}>{busy ? 'Entrando...' : 'Entrar no atendimento'}</button>
          {isSupabaseConfigured && <ForgotPassword />}
        </form>
      </AuthShell>
    );
  }

  return (
    <div className="waiter-portal min-h-screen bg-canvas">
      <a href="#waiter-content" onClick={(event) => { event.preventDefault(); document.getElementById('waiter-content')?.focus(); }} className="skip-link">Pular para o atendimento</a>
      <header ref={headerRef} className="app-header">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="min-w-0">
            <PontoLogo size={22} />
            <p className="flex min-w-0 items-center gap-1.5 truncate text-xs text-ink-muted">
              <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${!online ? 'bg-rose-600' : isSupabaseConfigured ? 'bg-emerald-600' : 'bg-amber-500'}`} aria-hidden="true" />
              <span className="truncate">{identified ? currentProfile.name : 'Área do garçom'}{!online ? ' · sem conexão' : ''}</span>
            </p>
          </div>
          {identified && (
            <div className="relative shrink-0">
              <button type="button" className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#2A201B] text-lg font-semibold text-white" aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Menu do garçom: som e sair" onClick={() => setMenuOpen((open) => !open)}>
                {(currentProfile.name.trim()[0] ?? 'G').toLocaleUpperCase('pt-BR')}
              </button>
              {menuOpen && <>
                <button type="button" className="fixed inset-0 z-40 cursor-default" aria-label="Fechar menu" tabIndex={-1} onClick={() => setMenuOpen(false)} />
                <div role="menu" className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-lg border border-[#E3D9CE] bg-[#FBF8F4] shadow-lg">
                  <p className="truncate border-b border-[#E3D9CE] px-4 py-2.5 text-sm font-semibold text-[#2A201B]">{currentProfile.name}</p>
                  <button type="button" role="menuitem" className="flex min-h-[48px] w-full items-center gap-3 px-4 text-left text-sm text-[#2A201B] active:bg-[#F4E6DE]" onClick={toggleAudio}>{audio ? <Volume2 className="h-5 w-5" aria-hidden="true" /> : <VolumeX className="h-5 w-5" aria-hidden="true" />}{audio ? 'Som ligado' : 'Som desligado'}</button>
                  <button type="button" role="menuitem" className="flex min-h-[48px] w-full items-center gap-3 border-t border-[#E3D9CE] px-4 text-left text-sm text-[#2A201B] active:bg-[#F4E6DE]" disabled={busy} onClick={() => { setMenuOpen(false); void leave(); }}><LogOut className="h-5 w-5" aria-hidden="true" />{isManager ? 'Voltar ao painel' : 'Sair'}</button>
                </div>
              </>}
            </div>
          )}
        </div>
      </header>
      <main id="waiter-content" tabIndex={-1} className="mx-auto max-w-5xl outline-none">
        {(!isSupabaseConfigured || !online) && (
          <div className="mx-3 mt-3 space-y-2 sm:mx-4" role="status">
            {!isSupabaseConfigured && <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-900">Demonstração local: pedidos não são sincronizados com outros aparelhos.</p>}
            {!online && <p className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-800">Sem conexão. Os pedidos não chegam à produção até a internet voltar.</p>}
          </div>
        )}
        {error && <p role="alert" className="mx-3 mt-3 rounded bg-rose-50 px-3 py-2 text-sm text-rose-800 sm:mx-4">{error}</p>}
        <WaiterModule dedicated settings={
          <div className="divide-y divide-[#E3D9CE] overflow-hidden rounded-xl border border-[#E3D9CE] bg-[#FBF8F4]">
            <button type="button" className="flex min-h-[56px] w-full items-center gap-3 px-4 text-left text-[15px] text-[#2A201B]" aria-pressed={audio} onClick={toggleAudio}>{audio ? <Volume2 className="h-5 w-5" aria-hidden="true" /> : <VolumeX className="h-5 w-5" aria-hidden="true" />}<span className="flex-1">Alertas sonoros</span><span className="text-sm text-[#7A6C62]">{audio ? 'Ligado' : 'Desligado'}</span></button>
            <button type="button" className="flex min-h-[56px] w-full items-center gap-3 px-4 text-left text-[15px] text-[#2A201B]" disabled={busy} onClick={() => void leave()}><LogOut className="h-5 w-5" aria-hidden="true" /><span className="flex-1">{isManager ? 'Voltar ao painel' : 'Sair da conta'}</span></button>
          </div>
        } />
      </main>
    </div>
  );
}
