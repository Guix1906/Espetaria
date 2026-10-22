import { describe, it, expect } from 'vitest';
import { buildTicket } from '../tickets.js';
import { loadConfig } from '../config.js';

const config = loadConfig({ PRINT_MODE: 'live', PRINTER_CASHIER: '10.0.0.4', RESTAURANT_NAME: 'Espetaria Sabor da Carne' });

const order = (extra) => ({
  id: 'd1', kind: 'DRIVER', sector: 'NONE', origin: 'DELIVERY', order_number: 1005, customer_name: 'Marina Silva',
  created_at: '2026-10-22T23:00:00Z', is_reprint: false,
  items: [{ name: 'Picanha', quantity: 2, unit_price: 20, notes: 'sem sal' }],
  payload: {
    driver_name: 'Carlos', customer_name: 'Marina Silva', phone: '11999990000', address_street: 'Rua A', address_number: '10',
    address_neighborhood: 'Centro', address_reference: 'portão azul', subtotal: 40, delivery_fee: 5, total: 45, ...extra,
  },
});

describe('Via do entregador (DRIVER)', () => {
  it('traz motoboy, cliente, endereço, itens e total', () => {
    const text = buildTicket(order({ payment_method: 'DINHEIRO', cash_change_for: 50 }), config).toText();
    for (const part of ['VIA DO ENTREGADOR', 'MOTOBOY: Carlos', 'Marina Silva', '11999990000', 'Rua A, 10', 'BAIRRO: Centro', 'portão azul', '2x Picanha', 'sem sal', 'R$ 45,00', 'levar R$ 5,00', 'COBRAR DINHEIRO', 'Recebido por']) {
      expect(text).toContain(part);
    }
  });

  it('diz se o PIX foi pago ou não', () => {
    expect(buildTicket(order({ payment_method: 'PIX', paid_at: '2026-10-22T23:01:00Z' }), config).toText()).toContain('PIX PAGO - NÃO COBRAR');
    expect(buildTicket(order({ payment_method: 'PIX', paid_at: null }), config).toText()).toContain('PIX NÃO CONFIRMADO');
  });
});
