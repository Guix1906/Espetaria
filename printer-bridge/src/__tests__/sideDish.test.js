import { describe, expect, it } from 'vitest';
import { sideDishCopy } from '../worker.js';
import { buildTicket } from '../tickets.js';

describe('cupom de delivery compacto', () => {
  it('junta itens, cliente, endereço e pagamento em um único corte', () => {
    const text = buildTicket({
      kind: 'ORDER', sector: 'GRILL', origin: 'DELIVERY', order_number: 5, payload: {},
      items: [{ name: 'Frango', quantity: 1 }],
      delivery: { customer_name: 'Maria', phone: '9999', address_street: 'Rua A', address_number: '1', address_neighborhood: 'Centro', payment_method: 'PIX', total: 18 },
    }, { paperColumns: 48, restaurantName: 'X' }).toText();
    expect(text).toContain('(1) Frango');
    expect(text).toContain('Maria - 9999');
    expect(text).toContain('Bairro: Centro');
    expect(text).toContain('R$ 18,00');
    expect(text.split('✂').length - 1).toBe(1);
  });
});

describe('cópia dos acompanhamentos para a cozinha', () => {
  const base = { id: 'j1', kind: 'ORDER', sector: 'GRILL', order_number: 10 };

  it('gera cópia para a cozinha só com os espetos com acompanhamento', () => {
    const copy = sideDishCopy({ ...base, items: [
      { name: 'Picanha com acompanhamento', quantity: 1, doneness: 'AO_PONTO' },
      { name: 'Frango', quantity: 2 },
    ] });
    expect(copy.sector).toBe('KITCHEN');
    expect(copy.id).toBe('j1-acomp');
    expect(copy.items).toHaveLength(1);
    expect(copy.items[0]).toEqual({ name: 'Picanha com acompanhamento', quantity: 1, doneness: 'AO_PONTO' });
  });

  it('não gera cópia sem acompanhamento, fora da churrasqueira ou para resumo', () => {
    expect(sideDishCopy({ ...base, items: [{ name: 'Frango', quantity: 1 }] })).toBeNull();
    expect(sideDishCopy({ ...base, sector: 'KITCHEN', items: [{ name: 'Picanha com acompanhamento', quantity: 1 }] })).toBeNull();
    expect(sideDishCopy({ ...base, kind: 'DELIVERY_SUMMARY', items: [{ name: 'Picanha com acompanhamento', quantity: 1 }] })).toBeNull();
  });
});
