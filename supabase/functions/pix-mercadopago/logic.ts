// Lógica pura do PIX automático (testada em src/lib/__tests__/pix_mercadopago.test.ts).
// Sem dependências do Deno: o teste importa este arquivo direto.

export interface PixOrder {
  id: string;
  order_number: number;
  total: number;
  status: string;
  customer_name: string;
  phone: string;
}

export interface MpPayment {
  id?: number | string;
  status?: string;
  transaction_amount?: number;
  external_reference?: string;
  date_of_expiration?: string;
  point_of_interaction?: { transaction_data?: { qr_code?: string } };
}

/** Data no formato que o Mercado Pago aceita (com fuso de Brasília). */
export function mpDate(date: Date): string {
  const local = new Date(date.getTime() - 3 * 3_600_000);
  return `${local.toISOString().slice(0, 23)}-03:00`;
}

/** Corpo do POST /v1/payments para um PIX no valor exato do pedido. */
export function buildPaymentBody(order: PixOrder, opts: { notificationUrl: string; payerEmail: string; minutes: number; now?: Date; storeName?: string }) {
  const now = opts.now ?? new Date();
  const [firstName, ...rest] = order.customer_name.trim().split(/\s+/);
  return {
    transaction_amount: Math.round(Number(order.total) * 100) / 100,
    description: `${opts.storeName || 'Pedido'} #${order.order_number}`.slice(0, 60),
    payment_method_id: 'pix',
    external_reference: order.id,
    notification_url: opts.notificationUrl,
    date_of_expiration: mpDate(new Date(now.getTime() + opts.minutes * 60_000)),
    payer: { email: opts.payerEmail, first_name: firstName || 'Cliente', last_name: rest.join(' ') || undefined },
  };
}

/** Id do pagamento num aviso do Mercado Pago (corpo JSON ou parâmetros da URL). */
export function parseWebhookPaymentId(url: URL, body: unknown): string | null {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const type = (b.type ?? b.topic ?? url.searchParams.get('type') ?? url.searchParams.get('topic')) as string | null;
  if (type && type !== 'payment') return null;
  const data = (b.data && typeof b.data === 'object' ? b.data : {}) as Record<string, unknown>;
  const id = data.id ?? url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? b.id;
  return id == null || id === '' ? null : String(id);
}

/** Pagamento aprovado, do pedido certo e no valor certo. */
export function isApprovedFor(payment: MpPayment, order: Pick<PixOrder, 'id' | 'total'>): boolean {
  return payment.status === 'approved'
    && payment.external_reference === order.id
    && Number(payment.transaction_amount ?? 0) + 0.01 >= Number(order.total);
}
