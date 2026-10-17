import { describe, expect, it } from 'vitest';
import { tabsForRole } from '../navigation';

describe('Permissões de telas por papel', () => {
  it('Master acessa todas as telas e começa na visão geral', () => {
    const tabs = tabsForRole('MASTER');
    expect(tabs[0]).toBe('master');
    expect(tabs).toContain('team');
    expect(tabs).toContain('settings');
  });

  it('papéis operacionais não acessam equipe, auditoria nem configurações', () => {
    for (const role of ['GARCOM', 'CAIXA', 'CHURRASQUEIRA', 'COZINHA', 'BAR', 'ENTREGADOR'] as const) {
      const tabs = tabsForRole(role);
      expect(tabs).not.toContain('team');
      expect(tabs).not.toContain('audit');
      expect(tabs).not.toContain('settings');
    }
  });

  it('cada papel começa na sua tela principal', () => {
    expect(tabsForRole('CHURRASQUEIRA')[0]).toBe('kds');
    expect(tabsForRole('CAIXA')[0]).toBe('cashier');
    expect(tabsForRole('ENTREGADOR')).toEqual(['delivery']);
    expect(tabsForRole('GARCOM')[0]).toBe('waiter');
  });
});
