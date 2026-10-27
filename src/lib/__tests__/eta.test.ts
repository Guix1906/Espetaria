import { describe, expect, it } from 'vitest';
import { DEFAULT_DELIVERY_ETA, etaMaxMinutes, parseEta } from '../eta';

describe('parseEta', () => {
  it('lê faixas com travessão, hífen e número único', () => {
    expect(parseEta('40–55 min', DEFAULT_DELIVERY_ETA)).toEqual([40, 55]);
    expect(parseEta('30-40', DEFAULT_DELIVERY_ETA)).toEqual([30, 40]);
    expect(parseEta('45 min', DEFAULT_DELIVERY_ETA)).toEqual([45, 45]);
  });

  it('texto sem número cai no padrão', () => {
    expect(parseEta('rápido', DEFAULT_DELIVERY_ETA)).toEqual([40, 55]);
    expect(parseEta(undefined, DEFAULT_DELIVERY_ETA)).toEqual([40, 55]);
  });

  it('usa a previsão de retirada ou de entrega', () => {
    expect(etaMaxMinutes({ delivery_eta: '50–70 min', pickup_eta: '20–25 min' }, false)).toBe(70);
    expect(etaMaxMinutes({ delivery_eta: '50–70 min', pickup_eta: '20–25 min' }, true)).toBe(25);
  });
});
