import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

// Lógica da Edge Function pix-mercadopago (pasta supabase/, fora do build da Vercel)
let pix: any;
beforeAll(async () => {
  pix = await import(/* @vite-ignore */ resolve(__dirname, '../../../supabase/functions/pix-mercadopago/logic.ts'));
});

const order = { id: '11111111-2222-3333-4444-555555555555', order_number: 1042, total: 86.5, status: 'AWAITING_PAYMENT', customer_name: 'Maria Souza Lima', phone: '11987654321' };

describe('PIX automático (Mercado Pago)', () => {
  it('monta a cobrança PIX no valor exato, ligada ao pedido e com prazo', () => {
    const now = new Date('2026-10-14T23:00:00Z');
    const body = pix.buildPaymentBody(order, { notificationUrl: 'https://x/fn?action=webhook&token=t', payerEmail: 'a@b.com', minutes: 14, now, storeName: 'Sabor da Carne' });
    expect(body).toMatchObject({
      transaction_amount: 86.5,
      payment_method_id: 'pix',
      external_reference: order.id,
      description: 'Sabor da Carne #1042',
      notification_url: 'https://x/fn?action=webhook&token=t',
      date_of_expiration: '2026-10-14T20:14:00.000-03:00',
      payer: { email: 'a@b.com', first_name: 'Maria', last_name: 'Souza Lima' },
    });
  });

  it('lê o id do pagamento no aviso (corpo ou URL) e ignora outros tipos', () => {
    const url = new URL('https://x/fn?action=webhook&token=t');
    expect(pix.parseWebhookPaymentId(url, { type: 'payment', data: { id: '123' } })).toBe('123');
    expect(pix.parseWebhookPaymentId(new URL('https://x/fn?type=payment&data.id=456'), {})).toBe('456');
    expect(pix.parseWebhookPaymentId(url, { type: 'merchant_order', data: { id: '9' } })).toBeNull();
    expect(pix.parseWebhookPaymentId(url, {})).toBeNull();
  });

  it('só libera pagamento aprovado, do pedido certo e no valor certo', () => {
    const ok = { status: 'approved', external_reference: order.id, transaction_amount: 86.5 };
    expect(pix.isApprovedFor(ok, order)).toBe(true);
    expect(pix.isApprovedFor({ ...ok, status: 'pending' }, order)).toBe(false);
    expect(pix.isApprovedFor({ ...ok, external_reference: 'outro' }, order)).toBe(false);
    expect(pix.isApprovedFor({ ...ok, transaction_amount: 50 }, order)).toBe(false);
  });
});
