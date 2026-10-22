import { describe, it, expect } from 'vitest';
import { buildTicket } from '../tickets.js';
import { loadConfig, resolvePrinter } from '../config.js';

const config = loadConfig({ PRINT_MODE: 'live', PRINTER_GRILL: '10.0.0.1', RESTAURANT_NAME: 'Espetaria Sabor da Carne' });

const bill = {
  id: 'b1', kind: 'BILL', sector: 'GRILL', origin: 'SALAO', order_number: 7, table_number: 7,
  customer_name: 'Família Souza', created_at: '2026-10-21T23:00:00Z', is_reprint: false,
  items: [
    { name: 'Picanha', quantity: 2, unit_price: 54 },
    { name: 'Heineken 600ml', quantity: 1, unit_price: 16 },
  ],
  payload: { subtotal: 124, service_fee: 12.4, discount: 0, total: 136.4, paid: 0, people_count: 2, waiter: 'Lucas', pix_key: 'chave-pix-teste' },
};

describe('Conta da mesa (BILL)', () => {
  it('lista itens, taxa, total, divisão e PIX', () => {
    const text = buildTicket(bill, config).toText();
    expect(text).toContain('MESA 7');
    expect(text).toContain('CONTA PARA CONFERÊNCIA');
    expect(text).toContain('2x Picanha');
    expect(text).toContain('R$ 108,00');
    expect(text).toContain('Taxa de serviço');
    expect(text).toContain('R$ 136,40');
    expect(text).toContain('Dividido por 2: R$ 68,20 cada');
    expect(text).toContain('PIX: chave-pix-teste');
    expect(text).toContain('Não é documento fiscal');
    expect(text).not.toContain('FALTA PAGAR');
  });

  it('mostra o que falta pagar quando já houve pagamento', () => {
    const text = buildTicket({ ...bill, payload: { ...bill.payload, paid: 50 } }, config).toText();
    expect(text).toContain('Já pago');
    expect(text).toContain('FALTA PAGAR');
    expect(text).toContain('R$ 86,40');
  });

  it('sai na impressora da churrasqueira', () => {
    expect(resolvePrinter(config, bill.sector)).toMatchObject({ target: 'GRILL' });
  });
});
