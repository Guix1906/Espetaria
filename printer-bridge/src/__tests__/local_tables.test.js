import { describe, it, expect } from 'vitest';
import { buildTicket } from '../tickets.js';

const config = { paperColumns: 42, restaurantName: 'Loja', templates: null };
const job = (tableNumber, kind = 'ORDER') => ({
  id: 'j', kind, sector: 'GRILL', origin: 'SALAO', order_number: 12, table_number: tableNumber, customer_name: 'Ruana Alves',
  created_at: '2026-11-28T23:00:00Z', payload: {},
  items: [{ name: 'Alcatra', quantity: 1, unit_price: 20, doneness: 'AO_PONTO', notes: null }],
});

describe('cupom do consumo local (mesa interna 900+)', () => {
  it('sai como CONSUMO LOCAL com o nome do cliente, nunca "MESA 901"', () => {
    const text = buildTicket(job(901), config).toText();
    expect(text).toContain('CONSUMO LOCAL');
    expect(text).toContain('Ruana Alves');
    expect(text).not.toMatch(/MESA 901/i);
  });
  it('cancelamento também', () => {
    const text = buildTicket(job(902, 'CANCEL'), config).toText();
    expect(text).toContain('CONSUMO LOCAL');
    expect(text).toContain('Cliente: Ruana Alves');
  });
  it('mesa do salão continua MESA', () => {
    expect(buildTicket(job(7), config).toText()).toMatch(/Mesa 7/i);
  });
});
