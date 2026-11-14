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

/** O banco respondeu e recusou o perfil (não existe ou está inativo): só nesse caso a sessão é encerrada. */
class ProfileRejected extends Error {}

const PROFILE_CACHE_KEY = 'ponto_profile_cache';

function cacheProfile(profile: Profile) {
  try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile)); } catch { /* sem armazenamento */ }
}

function cachedProfile(userId: string): Profile | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) ?? 'null') as Profile | null;
    return parsed && parsed.id === userId && parsed.is_active ? parsed : null;
  } catch {
    return null;
  }
}

async function loadActiveProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle();
  // Erro de rede ou servidor fora do ar não é motivo para tirar ninguém do sistema.
  if (error) throw new Error(`Não foi possível carregar o perfil agora: ${error.message}`);
  if (!data) throw new ProfileRejected('Perfil não encontrado. Solicite o cadastro à gerência.');
  if (!data.is_active) throw new ProfileRejected('Seu perfil está inativo. Solicite a ativação à gerência.');
  cacheProfile(data as Profile);
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
        try {
          const profile = await loadActiveProfile(user.id);
          set({ currentProfile: profile, availableProfiles: [profile], isAuthenticated: true });
        } catch (err) {
          if (err instanceof ProfileRejected) throw err;
          // Servidor fora do ar ou sem internet: segue logado com o perfil guardado neste aparelho
          // e confere de novo em segundo plano. O login só cai se a gerência desativar o perfil.
          const cached = cachedProfile(user.id);
          if (!cached) throw err;
          set({ currentProfile: cached, availableProfiles: [cached], isAuthenticated: true });
          logger.warn({ context: 'AuthStore', message: 'Perfil carregado do aparelho (servidor indisponível)', error: err });
          const retry = (delay: number) => setTimeout(() => {
            loadActiveProfile(user.id)
              .then((fresh) => set({ currentProfile: fresh, availableProfiles: [fresh] }))
              .catch((retryErr) => {
                if (retryErr instanceof ProfileRejected) void get().signOut();
                else retry(Math.min(delay * 2, 60_000));
              });
          }, delay);
          retry(5_000);
        }
      }
    } catch (err) {
      logger.warn({ context: 'AuthStore', message: 'Sessão persistida inválida', error: err });
      // Só encerra a sessão quando o perfil foi recusado; falha de rede apenas mostra o login, sem apagar a sessão.
      if (err instanceof ProfileRejected) await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
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
      if (err instanceof ProfileRejected) await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      throw err;
    }
  },

  signOut: async () => {
    if (isSupabaseConfigured) {
      // Sair vale SÓ neste aparelho. A mesma conta fica aberta no PC da loja, no celular do dono
      // e nos celulares dos garçons: o "Sair" padrão (global) derrubava todos de uma vez (14/11).
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }
    set({ isAuthenticated: !isSupabaseConfigured, availableProfiles: isSupabaseConfigured ? [] : INITIAL_PROFILES });
  },
}));
