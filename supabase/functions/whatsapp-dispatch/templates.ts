// Cópia dos textos padrão de src/lib/whatsappTemplates.ts (o app mostra a prévia
// com aquele arquivo; esta função envia de verdade). Manter os dois iguais.

export type Template = { enabled: boolean; text: string };

export const DEFAULT_TEMPLATES: Record<string, Template> = {
  CONFIRMED: {
    enabled: true,
    text: 'Olá, {nome}! Recebemos seu pedido *#{pedido}* na {loja}.\n\n{itens}\n\nTotal: *{total}*\nPagamento: {pagamento}{troco}\n{modalidade}\n\nJá vamos preparar e avisamos por aqui as próximas etapas.\n\nAcompanhe: {link}',
  },
  PAID: {
    enabled: true,
    text: '{nome}, recebemos o seu PIX de *{total}* do pedido *#{pedido}*. Obrigado!',
  },
  READY: {
    enabled: true,
    text: '{nome}, seu pedido *#{pedido}* está pronto para retirada. Pode vir buscar!\n{loja}',
  },
  OUT_FOR_DELIVERY: {
    enabled: true,
    text: '{nome}, seu pedido *#{pedido}* saiu para entrega com {entregador}.\n\nTotal: *{total}* ({pagamento}){troco}\n\nAcompanhe: {link}',
  },
  DELIVERED: {
    enabled: true,
    text: 'Pedido *#{pedido}* entregue. Obrigado pela preferência, {nome}. Bom apetite!\n{loja}',
  },
  CANCELLED: {
    enabled: true,
    text: 'Olá, {nome}. Seu pedido *#{pedido}* foi cancelado. Motivo: {motivo}.\nQualquer dúvida, é só responder esta mensagem.\n{loja}',
  },
};

export function resolveTemplate(event: string, saved: Record<string, Partial<Template>> | null | undefined): Template | null {
  const base = DEFAULT_TEMPLATES[event];
  if (!base) return null;
  const custom = saved?.[event];
  return {
    enabled: custom?.enabled ?? base.enabled,
    text: custom?.text?.trim() ? custom.text : base.text,
  };
}

const brl = (value: number) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const PAYMENT_LABEL: Record<string, string> = { PIX: 'PIX', DINHEIRO: 'Dinheiro', CARTAO_ENTREGA: 'Cartão na entrega' };

// deno-lint-ignore no-explicit-any
export function variables(order: any, restaurant: string, appUrl: string): Record<string, string> {
  const pickup = order.order_type === 'PICKUP';
  const endereco = pickup ? 'Retirada no local' : `${order.address_street}, ${order.address_number} — ${order.address_neighborhood}`;
  const taxa = brl(order.delivery_fee);
  return {
    nome: String(order.customer_name || '').trim().split(' ')[0] || 'cliente',
    pedido: String(order.order_number),
    itens: (order.items ?? []).map((i: { quantity: number; product_name: string }) => `• ${i.quantity}x ${i.product_name}`).join('\n'),
    total: brl(order.total),
    taxa,
    pagamento: pickup && order.payment_method === 'CARTAO_ENTREGA' ? 'Cartão na retirada' : PAYMENT_LABEL[order.payment_method] ?? order.payment_method,
    troco: order.payment_method === 'DINHEIRO' && order.cash_change_for ? ` — troco para ${brl(order.cash_change_for)}` : '',
    endereco,
    modalidade: pickup ? 'Retirada no local' : `Entrega em: ${endereco} (taxa ${taxa})`,
    entregador: order.driver_name || 'nosso entregador',
    motivo: order.cancel_reason || 'não informado',
    loja: restaurant,
    link: appUrl ? `${appUrl.replace(/\/$/, '')}/#/pedido/${order.id}` : '',
  };
}

export function render(text: string, vars: Record<string, string>): string {
  return text
    .replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? vars[key] : match))
    .replace(/^[ \t]*Acompanhe:[ \t]*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
