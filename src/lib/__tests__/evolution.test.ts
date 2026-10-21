import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

// Módulo da Evolution API (pasta supabase/, fora do build da Vercel)
let evo: any;
beforeAll(async () => {
  evo = await import(/* @vite-ignore */ resolve(__dirname, '../../../supabase/functions/_shared/evolution.ts'));
});

describe('normalizePhone (Evolution)', () => {
  it('tira espaços, traços e parênteses e põe o 55', () => {
    expect(evo.normalizePhone('(85) 9 9999-8888')).toBe('5585999998888');
    expect(evo.normalizePhone('85 99999 8888')).toBe('5585999998888');
  });
  it('mantém quem já tem 55', () => {
    expect(evo.normalizePhone('+55 (85) 99999-8888')).toBe('5585999998888');
    expect(evo.normalizePhone('558533334444')).toBe('558533334444');
  });
  it('tira o zero do DDD', () => {
    expect(evo.normalizePhone('085 99999-8888')).toBe('5585999998888');
  });
  it('DDD 55 sem código do país ganha o 55', () => {
    expect(evo.normalizePhone('55 99999-8888')).toBe('5555999998888');
  });
  it('vazio continua vazio', () => {
    expect(evo.normalizePhone('')).toBe('');
  });
});
