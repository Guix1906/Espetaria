import { describe, expect, it } from 'vitest';
import { isValidWhatsApp } from '../PublicMenuApp';

describe('isValidWhatsApp', () => {
  it('aceita celular com DDD, com ou sem 55', () => {
    expect(isValidWhatsApp('(11) 99999-1234')).toBe(true);
    expect(isValidWhatsApp('+55 11 99999-1234')).toBe(true);
  });

  it('recusa número sem DDD e repetido', () => {
    expect(isValidWhatsApp('99999-1234')).toBe(false);
    expect(isValidWhatsApp('(11) 3333-4444')).toBe(false);
    expect(isValidWhatsApp('00000000000')).toBe(false);
  });
});
