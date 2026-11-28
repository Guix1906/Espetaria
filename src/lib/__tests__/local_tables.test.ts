import { describe, expect, it } from 'vitest';
import { isLocalTable, localTabPhone, tableLabel, tableShortLabel, tabCustomerName } from '../localTables';

describe('consumo local (mesas internas 900+)', () => {
  it('separa mesa do salão de comanda de consumo local', () => {
    expect(isLocalTable({ number: 12 })).toBe(false);
    expect(isLocalTable({ number: 900 })).toBe(true);
    expect(isLocalTable({ number: 901 })).toBe(true);
    expect(isLocalTable(null)).toBe(false);
  });
  it('mostra o nome do cliente no lugar do número', () => {
    expect(tableLabel({ number: 5 })).toBe('Mesa 05');
    expect(tableLabel({ number: 901 })).toBe('Consumo local');
    expect(tableShortLabel({ number: 5 }, 'Ana')).toBe('Mesa 05');
    expect(tableShortLabel({ number: 901 }, 'Ana')).toBe('Local · Ana');
    expect(tableShortLabel({ number: 901 }, 'Mesa 901')).toBe('Consumo local');
  });
  it('ignora o nome automático "Mesa N"', () => {
    expect(tabCustomerName({ number: 3 }, 'Mesa 3')).toBeNull();
    expect(tabCustomerName({ number: 3 }, '  Lunna ')).toBe('Lunna');
  });
  it('lê o WhatsApp gravado na comanda', () => {
    expect(localTabPhone('CONSUMO LOCAL · WhatsApp 98999998888')).toBe('(98) 99999-8888');
    expect(localTabPhone('CONSUMO LOCAL · WhatsApp 5598999998888')).toBe('(98) 99999-8888');
    expect(localTabPhone('CONSUMO LOCAL · WhatsApp 9832221111')).toBe('(98) 3222-1111');
    expect(localTabPhone(null)).toBeNull();
  });
});
