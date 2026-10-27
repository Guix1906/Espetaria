import { describe, expect, it } from 'vitest';
import { isFreshReady, isPendingProduction } from '../productionStatus';

describe('productionStatus', () => {
  it('só espeto na brasa conta como pendente; cozinha e bar trabalham pelo papel', () => {
    expect(isPendingProduction({ sector: 'GRILL', status: 'IN_PREPARATION' })).toBe(true);
    expect(isPendingProduction({ sector: 'KITCHEN', status: 'RECEIVED' })).toBe(false);
    expect(isPendingProduction({ sector: 'BAR', status: 'RECEIVED' })).toBe(false);
  });

  it('aviso de pronto some depois de 10 minutos', () => {
    const now = Date.parse('2026-10-27T20:00:00Z');
    expect(isFreshReady({ status: 'READY', prepared_at: '2026-10-27T19:55:00Z', updated_at: null as never }, now)).toBe(true);
    expect(isFreshReady({ status: 'READY', prepared_at: '2026-10-27T19:49:00Z', updated_at: null as never }, now)).toBe(false);
    expect(isFreshReady({ status: 'DELIVERED', prepared_at: '2026-10-27T19:59:00Z', updated_at: null as never }, now)).toBe(false);
  });
});
