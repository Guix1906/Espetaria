import { describe, expect, it } from 'vitest';
import { maskCnpj, maskPhone, pixKeyError, toPixText } from '../inputMasks';

describe('Máscaras de Configurações', () => {
  it('formata CNPJ e telefone enquanto digita', () => {
    expect(maskCnpj('12345678000190')).toBe('12.345.678/0001-90');
    expect(maskCnpj('12.345')).toBe('12.345');
    expect(maskPhone('11987654321')).toBe('(11) 98765-4321');
    expect(maskPhone('1133334444')).toBe('(11) 3333-4444');
    expect(maskPhone('')).toBe('');
  });

  it('tira acentos do nome e da cidade do PIX', () => {
    expect(toPixText('São Paulo')).toBe('SAO PAULO');
    expect(toPixText('Espetaria Ação')).toBe('ESPETARIA ACAO');
  });

  it('confere a chave PIX pelo tipo', () => {
    expect(pixKeyError('EMAIL', 'loja@exemplo.com')).toBeNull();
    expect(pixKeyError('EMAIL', 'loja')).not.toBeNull();
    expect(pixKeyError('CPF', '123.456.789-09')).toBeNull();
    expect(pixKeyError('CNPJ', '12.345.678/0001-90')).toBeNull();
    expect(pixKeyError('CNPJ', '123')).not.toBeNull();
    expect(pixKeyError('TELEFONE', '+55 11 98765-4321')).toBeNull();
    expect(pixKeyError('ALEATORIA', '123e4567-e89b-12d3-a456-426614174000')).toBeNull();
    expect(pixKeyError('ALEATORIA', 'abc')).not.toBeNull();
    expect(pixKeyError('EMAIL', ' ')).not.toBeNull();
  });
});
