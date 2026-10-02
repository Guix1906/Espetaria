import { supabase, isSupabaseConfigured } from './supabase';
import { generateId } from './utils';
import { useAuthStore } from '../stores/useAuthStore';
import type { Profile } from '../types/domain';
import type { AppRole } from '../types/enums';

export interface StaffMember extends Profile {
  has_login?: boolean;
  last_sign_in_at?: string | null;
}

export interface NewStaffInput {
  name: string;
  email: string;
  role: AppRole;
  password: string;
}

export type StaffChanges = Partial<Pick<Profile, 'name' | 'role' | 'is_active'>>;

/**
 * Chama a Edge Function `manage-staff`. A chave de administrador fica no servidor;
 * aqui vai apenas o token da sessão do usuário logado.
 */
async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('manage-staff', { body });
  if (error) {
    // Extrai a mensagem amigável devolvida pela função
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === 'function') {
      const payload = await context.json().catch(() => null);
      if (payload?.error) throw new Error(payload.error);
    }
    throw new Error(error.message || 'Falha ao comunicar com o servidor.');
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Modo demonstração (sem Supabase): opera sobre os perfis locais
// ---------------------------------------------------------------------------
function localProfiles() {
  return useAuthStore.getState().availableProfiles;
}

function saveLocal(profiles: Profile[]) {
  useAuthStore.setState({ availableProfiles: profiles });
}

export const staffApi = {
  async list(): Promise<StaffMember[]> {
    if (!isSupabaseConfigured) return localProfiles().map((p) => ({ ...p, has_login: false }));
    const { staff } = await invoke<{ staff: StaffMember[] }>({ action: 'list' });
    return staff;
  },

  async create(input: NewStaffInput): Promise<StaffMember> {
    if (input.password.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
    if (!isSupabaseConfigured) {
      const email = input.email.trim().toLowerCase();
      if (localProfiles().some((p) => p.email.toLowerCase() === email)) throw new Error('Já existe um usuário com este e-mail.');
      const now = new Date().toISOString();
      const profile: Profile = { id: generateId(), name: input.name.trim(), email, role: input.role, is_active: true, created_at: now, updated_at: now };
      saveLocal([...localProfiles(), profile]);
      return profile;
    }
    const { staff } = await invoke<{ staff: StaffMember }>({ action: 'create', ...input });
    return staff;
  },

  async update(id: string, changes: StaffChanges): Promise<StaffMember> {
    if (!isSupabaseConfigured) {
      const updated = localProfiles().map((p) => (p.id === id ? { ...p, ...changes, updated_at: new Date().toISOString() } : p));
      saveLocal(updated);
      return updated.find((p) => p.id === id)!;
    }
    const { staff } = await invoke<{ staff: StaffMember }>({ action: 'update', id, ...changes });
    return staff;
  },

  async resetPassword(id: string, password: string): Promise<void> {
    if (password.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
    if (!isSupabaseConfigured) return;
    await invoke({ action: 'reset_password', id, password });
  },
};
