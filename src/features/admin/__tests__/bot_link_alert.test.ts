import { describe, expect, it } from 'vitest';
import { botLinkAlert } from '../dashboardMetrics';

const NOW = new Date('2026-11-06T23:00:00Z').getTime();
const ago = (min: number) => new Date(NOW - min * 60000).toISOString();

describe('Alerta do robô do WhatsApp sem conexão', () => {
  it('desconectado vira alerta vermelho na hora', () => {
    const a = botLinkAlert({ connected: false, lastIncomingAt: ago(1), botOn: true, shiftOpenedAt: null }, NOW);
    expect(a?.tone).toBe('danger');
  });
  it('robô desligado não alerta', () => {
    expect(botLinkAlert({ connected: false, lastIncomingAt: null, botOn: false, shiftOpenedAt: ago(200) }, NOW)).toBeNull();
  });
  it('turno aberto há 2 h sem nenhuma mensagem de cliente alerta', () => {
    const a = botLinkAlert({ connected: true, lastIncomingAt: ago(24 * 60), botOn: true, shiftOpenedAt: ago(120) }, NOW);
    expect(a?.tone).toBe('warning');
    expect(a?.text).toContain('2 h');
  });
  it('mensagem recente ou turno recém-aberto não alerta', () => {
    expect(botLinkAlert({ connected: true, lastIncomingAt: ago(10), botOn: true, shiftOpenedAt: ago(300) }, NOW)).toBeNull();
    expect(botLinkAlert({ connected: null, lastIncomingAt: ago(24 * 60), botOn: true, shiftOpenedAt: ago(30) }, NOW)).toBeNull();
    expect(botLinkAlert({ connected: true, lastIncomingAt: null, botOn: true, shiftOpenedAt: null }, NOW)).toBeNull();
  });
});
