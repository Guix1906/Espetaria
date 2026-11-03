import { describe, it, expect } from 'vitest';
import { buildTicket } from '../tickets.js';

const config = { paperColumns: 42, restaurantName: 'Loja', templates: null };
const job = (orderType, delivery, kind = 'ORDER') => ({
  id: 'j', kind, sector: 'GRILL', origin: 'DELIVERY', order_number: 7, created_at: '2026-11-02T23:00:00Z', customer_name: 'Ana',
  payload: { order_type: orderType },
  items: [{ name: 'Alcatra com acompanhamento', quantity: 1, unit_price: 35, doneness: 'AO_PONTO', notes: 'Arroz de Cuxá' }],
  delivery: { customer_name: 'Ana', phone: '99999999999', payment_method: 'CARTAO_ENTREGA', total: 35, created_at: '2026-11-02T23:00:00Z', ...delivery },
});

describe('cupom de cada tipo de pedido', () => {
  it('entrega traz endereço e bairro', () => {
    const text = buildTicket(job('DELIVERY', { address_street: 'Rua A', address_number: '1', address_neighborhood: 'Centro' }), config).toText();
    expect(text).toContain('DELIVERY #7');
    expect(text).toContain('Rua A, 1');
    expect(text).toContain('Bairro: Centro');
    expect(text).not.toContain('RETIRADA');
  });
  it('consumir no local não fala em retirada nem repete a observação', () => {
    const text = buildTicket(job('PICKUP', { notes: 'CONSUMIR NO LOCAL' }), config).toText();
    expect(text).toContain('CONSUMIR NO LOCAL #7');
    expect(text).toContain('CARTÃO NO LOCAL');
    expect(text).toContain('ARROZ DE CUXÁ');
    expect(text).not.toContain('RETIRADA');
    expect(text).not.toContain('OBS DO PEDIDO');
  });
  it('retirada continua retirada', () => {
    const text = buildTicket(job('PICKUP', { notes: null }), config).toText();
    expect(text).toContain('RETIRADA #7');
    expect(text).toContain('RETIRADA NO LOCAL');
    expect(text).toContain('CARTÃO NA RETIRADA');
  });
  it('cancelamento mostra o tipo certo', () => {
    const text = buildTicket(job('PICKUP', { notes: 'CONSUMIR NO LOCAL' }, 'CANCEL'), config).toText();
    expect(text).toContain('CONSUMIR NO LOCAL');
    expect(text).not.toContain('RETIRADA');
  });
});
