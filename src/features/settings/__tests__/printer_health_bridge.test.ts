import { describe, expect, it } from 'vitest';
import { isBridgeAliveAt, sectorPrinterHealth } from '../PrintBridgeStatus';

const NOW = new Date('2026-11-20T12:00:00Z').getTime();

describe('Impressoras: mesma regra da janela de diagnóstico', () => {
  it('computador da loja sem sinal deixa as impressoras "Sem sinal", mesmo com a fila vazia', () => {
    expect(isBridgeAliveAt(new Date(NOW - 8 * 3600_000).toISOString(), NOW)).toBe(false);
    expect(sectorPrinterHealth([], 'GRILL', NOW, false)).toBe('NO_SIGNAL');
  });
  it('sinal recente e fila limpa = conectada', () => {
    expect(isBridgeAliveAt(new Date(NOW - 20_000).toISOString(), NOW)).toBe(true);
    expect(sectorPrinterHealth([], 'KITCHEN', NOW, true)).toBe('ON');
  });
  it('sem nenhum sinal registrado = sem sinal', () => {
    expect(isBridgeAliveAt(null, NOW)).toBe(false);
  });
});
