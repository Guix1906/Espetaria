import { describe, expect, it } from 'vitest';
import { normalizeAddress, readEnvValue, upsertEnv } from '../setup.js';

const ENV = '# comentário\nPRINT_MODE=simulate\nSUPABASE_SERVICE_ROLE_KEY=segredo\nPRINTER_GRILL=\n';

describe('assistente de configuração', () => {
  it('lê valores do .env ignorando comentários', () => {
    expect(readEnvValue(ENV, 'PRINT_MODE')).toBe('simulate');
    expect(readEnvValue(ENV, 'PRINTER_GRILL')).toBe('');
    expect(readEnvValue(ENV, 'PRINTER_BAR')).toBeUndefined();
  });

  it('troca valores existentes, acrescenta os novos e preserva a chave do Supabase', () => {
    const out = upsertEnv(ENV, { PRINTER_GRILL: '192.168.1.50:9100', PRINTER_BAR: '', PRINT_MODE: 'live' });
    expect(readEnvValue(out, 'PRINTER_GRILL')).toBe('192.168.1.50:9100');
    expect(readEnvValue(out, 'PRINTER_BAR')).toBe('');
    expect(readEnvValue(out, 'PRINT_MODE')).toBe('live');
    expect(readEnvValue(out, 'SUPABASE_SERVICE_ROLE_KEY')).toBe('segredo');
    expect(out).toContain('# comentário');
  });

  it('aceita IP com ou sem porta e recusa valores inválidos', () => {
    expect(normalizeAddress('192.168.1.50')).toBe('192.168.1.50:9100');
    expect(normalizeAddress(' 192.168.1.50:9101 ')).toBe('192.168.1.50:9101');
    expect(normalizeAddress('192.168.0.10')).toBe('192.168.0.10:9100');
    expect(() => normalizeAddress('impressora')).toThrow();
    expect(() => normalizeAddress('192.168.0.0')).toThrow();
    expect(() => normalizeAddress('192.168.1.300')).toThrow();
  });
});
