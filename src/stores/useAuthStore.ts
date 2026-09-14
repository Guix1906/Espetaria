import { create } from 'zustand';
import { Profile } from '../types/domain';
import { AppRole } from '../types/enums';
import { INITIAL_PROFILES } from '../lib/mockData';
import { logger } from '../lib/logger';

interface AuthState {
  currentProfile: Profile;
  availableProfiles: Profile[];
  switchProfile: (role: AppRole) => void;
  setProfile: (profile: Profile) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  currentProfile: INITIAL_PROFILES[0]!, // Inicia como MASTER por padrão
  availableProfiles: INITIAL_PROFILES,

  switchProfile: (role: AppRole) => {
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
  }
}));
