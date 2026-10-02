import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../lib/supabase', () => ({ isSupabaseConfigured: false, supabase: {} }));

import { staffApi } from '../../../lib/staffApi';
import { useAuthStore } from '../../../stores/useAuthStore';
import { INITIAL_PROFILES } from '../../../lib/mockData';

describe('Gestão de equipe (modo demonstração)', () => {
  beforeEach(() => {
    useAuthStore.setState({ availableProfiles: INITIAL_PROFILES });
  });

  it('cadastra, edita e desativa colaborador', async () => {
    const created = await staffApi.create({ name: 'Paulo Bar', email: 'Paulo@Teste.com', role: 'BAR', password: '12345678' });
    expect(created.email).toBe('paulo@teste.com');
    expect(created.is_active).toBe(true);

    const edited = await staffApi.update(created.id, { role: 'CAIXA', is_active: false });
    expect(edited.role).toBe('CAIXA');
    expect(edited.is_active).toBe(false);
    expect((await staffApi.list()).some((m) => m.id === created.id)).toBe(true);
  });

  it('recusa e-mail duplicado e senha curta', async () => {
    await expect(staffApi.create({ name: 'X', email: INITIAL_PROFILES[0]!.email, role: 'BAR', password: '12345678' })).rejects.toThrow(/e-mail/);
    await expect(staffApi.create({ name: 'Y', email: 'y@t.com', role: 'BAR', password: '123' })).rejects.toThrow(/8 caracteres/);
  });
});
