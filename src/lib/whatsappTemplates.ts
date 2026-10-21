/**
 * Mensagens automáticas de WhatsApp do delivery.
 * Os textos padrão e as variáveis precisam ficar iguais aos da Edge Function
 * supabase/functions/whatsapp-dispatch/templates.ts (que envia de verdade).
 */
import type { DeliveryOrder, WhatsAppEvent } from '../types/domain';
import { formatBRL } from './formatters';

export interface WhatsAppTemplate {
  enabled: boolean;
  text: string;
}

export type WhatsAppTemplates = Record<WhatsAppEvent, WhatsAppTemplate>;

export const WHATSAPP_EVENTS: { event: WhatsAppEvent; label: string; when: string }[] = [
  { event: 'CONFIRMED', label: 'Pedido recebido', when: 'Assim que o cliente finaliza o pedido no cardápio.' },
  { event: 'PAID', label: 'Pagamento confirmado', when: 'Quando o caixa marca "PIX recebido".' },
  { event: 'PREPARING', label: 'Pedido em preparo', when: 'Quando um pedido que estava parado (pendente ou confirmado) entra em preparo. Pedido do cardápio já nasce em preparo e recebe só "Pedido recebido".' },
  { event: 'READY', label: 'Pronto para retirada', when: 'Só na retirada no local: quando o churrasqueiro toca em "Espeto pronto". No delivery o cliente não recebe esta mensagem.' },
  { event: 'OUT_FOR_DELIVERY', label: 'Saiu para entrega', when: 'Só no delivery: quando o entregador toca em "Saiu para entrega".' },
  { event: 'DELIVERED', label: 'Entregue', when: 'Só no delivery: quando a entrega é confirmada.' },
  { event: 'CANCELLED', label: 'Cancelado', when: 'Se o pedido for cancelado.' },
];

export const WHATSAPP_VARIABLES: { key: string; label: string }[] = [
  { key: 'nome', label: 'primeiro nome do cliente' },
  { key: 'pedido', label: 'número do pedido' },
  { key: 'itens', label: 'lista de itens' },
  { key: 'total', label: 'valor total' },
  { key: 'taxa', label: 'taxa de entrega' },
  { key: 'pagamento', label: 'forma de pagamento' },
  { key: 'troco', label: 'aviso de troco (vazio se não tiver)' },
  { key: 'endereco', label: 'endereço de entrega ("Retirada no local" na retirada)' },
  { key: 'modalidade', label: 'entrega com endereço e taxa, ou "Retirada no local"' },
  { key: 'entregador', label: 'nome do entregador' },
  { key: 'motivo', label: 'motivo do cancelamento' },
  { key: 'loja', label: 'nome da loja' },
  { key: 'link', label: 'link da página de acompanhamento do pedido' },
];

export const DEFAULT_WHATSAPP_TEMPLATES: WhatsAppTemplates = {
  CONFIRMED: {
    enabled: true,
    text: 'Olá, {nome}! Recebemos seu pedido *#{pedido}* na {loja}.\n\n{itens}\n\nTotal: *{total}*\nPagamento: {pagamento}{troco}\n{modalidade}\n\nJá vamos preparar e avisamos por aqui as próximas etapas.\n\nAcompanhe: {link}',
  },
  PAID: {
    enabled: true,
    text: '{nome}, recebemos o seu PIX de *{total}* do pedido *#{pedido}*. Obrigado!',
  },
  PREPARING: {
    enabled: true,
    text: '{nome}, seu pedido *#{pedido}* já está em preparo na brasa. Avisamos quando ficar pronto!\n{loja}',
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

/** Junta os textos salvos com os padrões (eventos não salvos usam o padrão). */
export function resolveWhatsAppTemplates(saved?: Partial<Record<string, Partial<WhatsAppTemplate>>> | null): WhatsAppTemplates {
  const result = { ...DEFAULT_WHATSAPP_TEMPLATES };
  for (const { event } of WHATSAPP_EVENTS) {
    const custom = saved?.[event];
    if (!custom) continue;
    result[event] = {
      enabled: custom.enabled ?? DEFAULT_WHATSAPP_TEMPLATES[event].enabled,
      text: custom.text?.trim() ? custom.text : DEFAULT_WHATSAPP_TEMPLATES[event].text,
    };
  }
  return result;
}

const PAYMENT_LABEL: Record<string, string> = { PIX: 'PIX', DINHEIRO: 'Dinheiro', CARTAO_ENTREGA: 'Cartão na entrega' };

type OrderForMessage = Pick<DeliveryOrder, 'id' | 'customer_name' | 'order_number' | 'total' | 'delivery_fee' | 'payment_method' | 'cash_change_for' | 'address_street' | 'address_number' | 'address_neighborhood' | 'driver_name' | 'order_type'> & {
  items?: { quantity: number; product_name: string }[];
  cancel_reason?: string | null;
};

export function whatsAppVariables(order: OrderForMessage, restaurant: string, appUrl: string): Record<string, string> {
  const pickup = order.order_type === 'PICKUP';
  const endereco = pickup ? 'Retirada no local' : `${order.address_street}, ${order.address_number} — ${order.address_neighborhood}`;
  const taxa = formatBRL(Number(order.delivery_fee));
  return {
    nome: String(order.customer_name || '').trim().split(' ')[0] || 'cliente',
    pedido: String(order.order_number),
    itens: (order.items ?? []).map((i) => `• ${i.quantity}x ${i.product_name}`).join('\n'),
    total: formatBRL(Number(order.total)),
    taxa,
    pagamento: pickup && order.payment_method === 'CARTAO_ENTREGA' ? 'Cartão na retirada' : PAYMENT_LABEL[order.payment_method] ?? order.payment_method,
    troco: order.payment_method === 'DINHEIRO' && order.cash_change_for ? ` — troco para ${formatBRL(Number(order.cash_change_for))}` : '',
    endereco,
    modalidade: pickup ? 'Retirada no local' : `Entrega em: ${endereco} (taxa ${taxa})`,
    entregador: order.driver_name || 'nosso entregador',
    motivo: order.cancel_reason || 'não informado',
    loja: restaurant,
    link: appUrl ? `${appUrl.replace(/\/$/, '')}/#/pedido/${order.id}` : '',
  };
}

/** Troca {variavel} pelo valor; variáveis desconhecidas ficam como estão. */
export function renderWhatsAppTemplate(text: string, vars: Record<string, string>): string {
  return text
    .replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match)
    // Sem link configurado: some a linha "Acompanhe:" vazia
    .replace(/^[ \t]*Acompanhe:[ \t]*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
