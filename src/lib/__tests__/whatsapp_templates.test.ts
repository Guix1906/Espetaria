import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  renderWhatsAppTemplate,
  resolveWhatsAppTemplates,
  whatsAppVariables,
} from '../whatsappTemplates';

const order = {
  id: 'abc-123',
  customer_name: 'Maria Souza',
  order_number: 1042,
  total: 86.5,
  delivery_fee: 6.5,
  payment_method: 'DINHEIRO' as const,
  cash_change_for: 100,
  address_street: 'Rua das Flores',
  address_number: '120',
  address_neighborhood: 'Centro',
  driver_name: 'Carlos',
  items: [{ quantity: 2, product_name: 'Espeto de picanha' }],
};

describe('Mensagens automáticas de WhatsApp', () => {
  it('preenche as variáveis do pedido', () => {
    const text = renderWhatsAppTemplate(DEFAULT_WHATSAPP_TEMPLATES.OUT_FOR_DELIVERY.text, whatsAppVariables(order, 'Sabor da Carne', 'https://loja.app'));
    expect(text).toContain('Maria, seu pedido *#1042* saiu para entrega com Carlos');
    expect(text).toContain('troco para R$');
    expect(text).toContain('https://loja.app/#/pedido/abc-123');
  });

  it('remove a linha "Acompanhe:" quando não há link', () => {
    const text = renderWhatsAppTemplate(DEFAULT_WHATSAPP_TEMPLATES.CONFIRMED.text, whatsAppVariables(order, 'Loja', ''));
    expect(text).not.toContain('Acompanhe');
    expect(text).toContain('• 2x Espeto de picanha');
  });

  it('retirada no local: sem endereço nem taxa, pagamento "na retirada"', () => {
    const pickup = { ...order, order_type: 'PICKUP' as const, delivery_fee: 0, payment_method: 'CARTAO_ENTREGA' as const, address_street: '', address_number: '', address_neighborhood: '' };
    const vars = whatsAppVariables(pickup, 'Loja', '');
    const confirmed = renderWhatsAppTemplate(DEFAULT_WHATSAPP_TEMPLATES.CONFIRMED.text, vars);
    expect(confirmed).toContain('Retirada no local');
    expect(confirmed).toContain('Cartão na retirada');
    expect(confirmed).not.toContain('taxa');
    expect(renderWhatsAppTemplate(DEFAULT_WHATSAPP_TEMPLATES.READY.text, vars)).toContain('pronto para retirada');
  });

  it('entrega mostra endereço e taxa no pedido recebido', () => {
    const text = renderWhatsAppTemplate(DEFAULT_WHATSAPP_TEMPLATES.CONFIRMED.text, whatsAppVariables(order, 'Loja', ''));
    expect(text).toContain('Entrega em: Rua das Flores, 120 — Centro (taxa R$');
  });

  it('mantém variável desconhecida como está', () => {
    expect(renderWhatsAppTemplate('Oi {nome} {xyz}', { nome: 'Ana' })).toBe('Oi Ana {xyz}');
  });

  it('usa o texto padrão quando o salvo está vazio e respeita o desligado', () => {
    const t = resolveWhatsAppTemplates({ READY: { enabled: false, text: '  ' } });
    expect(t.READY).toEqual({ enabled: false, text: DEFAULT_WHATSAPP_TEMPLATES.READY.text });
    expect(t.CONFIRMED).toEqual(DEFAULT_WHATSAPP_TEMPLATES.CONFIRMED);
  });

  it('textos padrão do app e da função de envio são iguais', () => {
    const fn = readFileSync(resolve(__dirname, '../../../supabase/functions/whatsapp-dispatch/templates.ts'), 'utf8');
    for (const [event, template] of Object.entries(DEFAULT_WHATSAPP_TEMPLATES)) {
      // No código-fonte as quebras de linha aparecem como \n, igual ao JSON
      expect(fn, event).toContain(`${event}: {\n    enabled: true,\n    text: '${JSON.stringify(template.text).slice(1, -1)}'`);
    }
  });
});
