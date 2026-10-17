import { create } from 'zustand';
import { Profile } from '../types/domain';
import { AppRole } from '../types/enums';
import { INITIAL_PROFILES } from '../lib/mockData';
import { logger } from '../lib/logger';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const PROFILE_COLUMNS = 'id,name,email,role,is_active,created_at,updated_at';

interface AuthState {
  currentProfile: Profile;
  availableProfiles: Profile[];
  /** true quando há sessão Supabase válida com perfil ativo (ou em modo demonstração). */
  isAuthenticated: boolean;
  /** true enquanto a sessão persistida está sendo verificada na inicialização. */
  isInitializing: boolean;
  /** Troca de perfil: permitida apenas no modo demonstração local. */
  canSwitchProfile: boolean;
  switchProfile: (role: AppRole) => void;
  setProfile: (profile: Profile) => void;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

async function loadActiveProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).single();
  if (error || !data) throw new Error('Perfil não encontrado. Solicite o cadastro à gerência.');
  if (!data.is_active) throw new Error('Seu perfil está inativo. Solicite a ativação à gerência.');
  return data as Profile;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // Em modo demonstração inicia como MASTER; com Supabase, exige login.
  currentProfile: INITIAL_PROFILES[0]!,
  availableProfiles: isSupabaseConfigured ? [] : INITIAL_PROFILES,
  isAuthenticated: !isSupabaseConfigured,
  isInitializing: isSupabaseConfigured,
  canSwitchProfile: !isSupabaseConfigured,

  switchProfile: (role: AppRole) => {
    if (!get().canSwitchProfile) {
      logger.warn({ context: 'AuthStore', message: 'Troca de perfil bloqueada: use login individual.' });
      return;
    }
    const target = get().availableProfiles.find(p => p.role === role);
    if (target) {
      logger.info({
        context: 'AuthStore',
        message: `Perfil alterado para: ${target.name} (${target.role})`
      });
      set({ currentProfile: target });
    }
  },

  setProfile: (profile: Profile) => {
    set({ currentProfile: profile });
  },

  initialize: async () => {
    if (!isSupabaseConfigured) return;
    try {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (user) {
        const profile = await loadActiveProfile(user.id);
        set({ currentProfile: profile, availableProfiles: [profile], isAuthenticated: true });
      }
    } catch (err) {
      logger.warn({ context: 'AuthStore', message: 'Sessão persistida inválida', error: err });
      await supabase.auth.signOut();
      set({ isAuthenticated: false });
    } finally {
      set({ isInitializing: false });
    }

    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') set({ isAuthenticated: false, availableProfiles: [] });
    });
  },

  signIn: async (email, password) => {
    if (!isSupabaseConfigured) {
      set({ isAuthenticated: true });
      return;
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mail ou senha inválidos.' : error.message);
    try {
      const profile = await loadActiveProfile(data.user.id);
      set({ currentProfile: profile, availableProfiles: [profile], isAuthenticated: true });
      logger.info({ context: 'AuthStore', message: `Login: ${profile.name} (${profile.role})` });
    } catch (err) {
      await supabase.auth.signOut();
      throw err;
    }
  },

  signOut: async () => {
    if (isSupabaseConfigured) {
      // Sair nunca pode prender o usuário: se o servidor falhar ou demorar,
      // encerra a sessão só neste aparelho e segue.
      try {
        const result = await Promise.race([
          supabase.auth.signOut(),
          new Promise<{ error: Error }>((resolve) => setTimeout(() => resolve({ error: new Error('timeout') }), 5000)),
        ]);
        if (result.error) await supabase.auth.signOut({ scope: 'local' });
      } catch {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      }
    }
    set({ isAuthenticated: !isSupabaseConfigured, availableProfiles: isSupabaseConfigured ? [] : INITIAL_PROFILES });
  },
}));
