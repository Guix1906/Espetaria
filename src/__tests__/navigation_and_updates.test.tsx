import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useAuthStore } from '../stores/useAuthStore';
import { useTableStore } from '../stores/useTableStore';
import { WaiterModule } from '../features/waiter/WaiterModule';
import { KDSModule } from '../features/kds/KDSModule';
import { FeedbackProvider } from '../components/ui/FeedbackProvider';
import { ConfirmDialogProvider } from '../components/ui/ConfirmDialog';
import { App } from '../App';
import type { Profile } from '../types/domain';

const MOCK_MASTER_PROFILE: Profile = {
  id: 'prof-master-1',
  name: 'Proprietário Teste',
  email: 'admin@espetaria.com',
  role: 'MASTER',
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function createMockStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  };
}

const mockLocalStorage = createMockStorage();
const mockSessionStorage = createMockStorage();

const mockWindow = {
  localStorage: mockLocalStorage,
  sessionStorage: mockSessionStorage,
  location: {
    hash: '',
    pathname: '/',
    origin: 'https://sabordacarne.pontopdv.tech',
    reload: vi.fn(),
  },
  history: {
    pushState: vi.fn(),
    replaceState: vi.fn(),
    back: vi.fn(),
    state: null as any,
  },
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
  setInterval: vi.fn().mockReturnValue(123),
  clearInterval: vi.fn(),
  scrollTo: vi.fn(),
};

vi.stubGlobal('window', mockWindow);
vi.stubGlobal('localStorage', mockLocalStorage);
vi.stubGlobal('sessionStorage', mockSessionStorage);

// Override React.useSyncExternalStore to evaluate getSnapshot() in Node/SSR
(React as any).useSyncExternalStore = (_subscribe: any, getSnapshot: () => any) => getSnapshot();

function renderWithProviders(ui: React.ReactElement): string {
  return renderToStaticMarkup(
    <FeedbackProvider>
      <ConfirmDialogProvider>
        {ui}
      </ConfirmDialogProvider>
    </FeedbackProvider>
  );
}

describe('Testes de Navegação Resiliente e Atualizações PWA', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    mockSessionStorage.clear();
    mockWindow.location.hash = '';
    mockWindow.location.pathname = '/';
    useAuthStore.setState({
      currentProfile: MOCK_MASTER_PROFILE,
      isAuthenticated: true,
      isInitializing: false,
    });
  });

  it('1. Persistência de tela ativa no Painel Admin (restaura aba após reload)', () => {
    // Simula que antes do reload o usuário estava no Caixa
    mockLocalStorage.setItem('ponto_active_admin_tab', 'cashier');
    mockWindow.location.hash = '#/painel/caixa';

    const html = renderWithProviders(<App />);

    // Deve abrir diretamente na tela de Caixa
    expect(html).toContain('Caixa');
    expect(mockLocalStorage.getItem('ponto_active_admin_tab')).toBe('cashier');
  });

  it('2. Persistência de tela ativa no KDS Produção (restaura Cozinha ou Churrasqueira)', () => {
    mockLocalStorage.setItem('ponto_active_kds_sector', 'kitchen');

    const html = renderWithProviders(<KDSModule />);

    // Deve renderizar a Cozinha e cubas
    expect(html).toContain('Cozinha');
    expect(html).toContain('Estoque das cubas');
  });

  it('3. Persistência de mesa selecionada no atendimento do garçom', () => {
    const table = useTableStore.getState().tables[0]!;
    // Garçom estava na mesa 01
    mockSessionStorage.setItem('ponto_selected_table_id', table.id);

    const html = renderWithProviders(<WaiterModule />);

    // Deve abrir diretamente no OrderPad da mesa sem retornar ao grid de mesas
    expect(html).toContain(`Mesa ${String(table.number).padStart(2, '0')}`);
    expect(html).toContain('Voltar às mesas');
  });
});
