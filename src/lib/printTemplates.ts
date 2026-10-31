// Modelos de impressão. Mantenha em sincronia com printer-bridge/src/templates.js e tickets.js.

export type PrintLayout = 'ANOTA_PRODUCAO' | 'ANOTA_COMPLETO' | 'PADRAO';

export const LAYOUT_LABELS: Record<PrintLayout, string> = {
  ANOTA_PRODUCAO: 'Produção (sem preços, pedido em destaque)',
  ANOTA_COMPLETO: 'Completo (preços, cliente, pagamento e total)',
  PADRAO: 'Simples (título do setor em destaque)',
};

export interface SectorTemplate {
  layout: PrintLayout;
  title: string;
  show_restaurant_name: boolean;
  /** 1 normal, 3 altura dupla */
  item_size: 1 | 3;
  show_doneness: boolean;
  show_notes: boolean;
  show_waiter: boolean;
  show_time: boolean;
  copies: number;
  beep: boolean;
  footer: string;
}

export interface DeliveryLabelTemplate {
  enabled: boolean;
  show_phone: boolean;
  show_address: boolean;
  show_reference: boolean;
  show_payment: boolean;
  show_total: boolean;
  footer: string;
}

export interface PrintTemplates {
  GRILL: SectorTemplate;
  KITCHEN: SectorTemplate;
  /** Cupom de expedição do delivery (caixa) */
  EXPEDICAO: SectorTemplate;
  DELIVERY_LABEL: DeliveryLabelTemplate;
}

export const DEFAULT_PRINT_TEMPLATES: PrintTemplates = {
  GRILL: {
    layout: 'ANOTA_PRODUCAO', title: 'CHURRASQUEIRA', show_restaurant_name: true, item_size: 3, show_doneness: true, show_notes: true,
    show_waiter: true, show_time: true, copies: 1, beep: true, footer: '',
  },
  KITCHEN: {
    layout: 'ANOTA_PRODUCAO', title: 'COZINHA - ACOMPANHAMENTOS', show_restaurant_name: true, item_size: 3, show_doneness: false, show_notes: true,
    show_waiter: true, show_time: true, copies: 1, beep: true, footer: '',
  },
  EXPEDICAO: {
    layout: 'ANOTA_COMPLETO', title: 'EXPEDIÇÃO', show_restaurant_name: true, item_size: 1, show_doneness: true, show_notes: true,
    show_waiter: false, show_time: true, copies: 1, beep: false, footer: '',
  },
  DELIVERY_LABEL: {
    enabled: true, show_phone: true, show_address: true, show_reference: true, show_payment: true, show_total: true,
    footer: 'Confira o pedido antes de lacrar a embalagem.',
  },
};

export function resolvePrintTemplates(remote: Partial<PrintTemplates> | null | undefined): PrintTemplates {
  const r = remote ?? {};
  return {
    GRILL: { ...DEFAULT_PRINT_TEMPLATES.GRILL, ...r.GRILL },
    KITCHEN: { ...DEFAULT_PRINT_TEMPLATES.KITCHEN, ...r.KITCHEN },
    EXPEDICAO: { ...DEFAULT_PRINT_TEMPLATES.EXPEDICAO, ...r.EXPEDICAO },
    DELIVERY_LABEL: { ...DEFAULT_PRINT_TEMPLATES.DELIVERY_LABEL, ...r.DELIVERY_LABEL },
  };
}

interface PreviewItem { quantity: number; name: string; doneness?: string; notes?: string; price?: number }

const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

const center = (text: string, width: number) => ' '.repeat(Math.max(0, Math.floor((width - text.length) / 2))) + text;

/** Prévia em texto do cupom de produção (e da etiqueta, para delivery). */
export function previewSectorTicket(
  tpl: SectorTemplate,
  label: DeliveryLabelTemplate,
  opts: { restaurantName: string; width: number; delivery: boolean; items: PreviewItem[] },
): string {
  const w = opts.width;
  const out: string[] = [];
  const cut = '✂'.padEnd(w, '-');
  if (tpl.layout !== 'PADRAO') out.push(...previewAnota(tpl, opts));
  else {
  if (tpl.show_restaurant_name) out.push(center(opts.restaurantName.toUpperCase(), w));
  out.push(center(`** ${tpl.title} **`, w), '='.repeat(w));
  if (opts.delivery) out.push('DELIVERY #128', 'Cliente: Maria Souza', 'Bairro: Centro');
  else out.push('MESA 7', `Pedido #54${tpl.show_waiter ? '   Garçom: João' : ''}`);
  if (tpl.show_time) out.push('08/10 20:15');
  out.push('-'.repeat(w));
  for (const item of opts.items) {
    out.push(`${item.quantity}x ${item.name.toUpperCase()}${tpl.item_size === 3 ? '  (grande)' : ''}`);
    if (tpl.show_doneness && item.doneness) out.push(`   PONTO: [ ${item.doneness} ]`);
    if (tpl.show_notes && item.notes) out.push(`   *** OBS: ${item.notes.toUpperCase()} ***`);
  }
  out.push('-'.repeat(w));
  if (tpl.footer) out.push(center(tpl.footer, w));
  }
  out.push(cut);
  if (opts.delivery && label.enabled && tpl.title !== 'EXPEDIÇÃO') {
    out.push(center('[ DELIVERY #128 ]', w), center(`Embalagem: ${tpl.title}`, w), '='.repeat(w), 'MARIA SOUZA');
    if (label.show_phone) out.push('TEL: (11) 91234-5678');
    if (label.show_address) out.push('END: Rua das Flores, 250', 'COMPL: Apto 12', 'BAIRRO: CENTRO');
    if (label.show_reference) out.push('REF: Ao lado da padaria');
    if (label.show_payment) out.push('-'.repeat(w), 'PAGAMENTO: DINHEIRO', 'Troco para R$ 100,00');
    if (label.show_total) out.push('TOTAL DO PEDIDO'.padEnd(w - 8) + 'R$ 87,50');
    out.push('-'.repeat(w));
    if (label.footer) out.push(center(label.footer, w));
    out.push(cut);
  }
  const copies = Math.min(Math.max(tpl.copies || 1, 1), 3);
  const one = out.join('\n');
  return Array.from({ length: copies }, () => one).join('\n');
}

/** Layout estilo Anota AI (modelos enviados pela loja). */
function previewAnota(
  tpl: SectorTemplate,
  opts: { restaurantName: string; width: number; delivery: boolean; items: PreviewItem[] },
): string[] {
  const w = opts.width;
  const complete = tpl.layout === 'ANOTA_COMPLETO';
  const eq = '='.repeat(w);
  const dash = '-'.repeat(w);
  const out = [eq, center(opts.delivery ? 'PARA ENTREGA' : 'CONSUMO NO LOCAL', w), eq];
  if (tpl.show_time) out.push(center('08/10/2026 20:15', w));
  if (tpl.show_restaurant_name) out.push(center(opts.restaurantName, w));
  out.push(eq, center('P E D I D O   2 1 9 3', w));
  if (!opts.delivery) {
    out.push(center('Mesa 7', w));
    if (tpl.show_waiter) out.push(center('Garçom: João', w));
  }
  if (tpl.title) out.push(center(`[ ${tpl.title} ]`, w));
  out.push(dash, complete ? 'Itens' : 'I T E N S', '');
  opts.items.forEach((item, i) => {
    const name = `(${item.quantity}) ${item.name}`;
    const price = complete && item.price != null ? brl(item.price * item.quantity) : '';
    out.push(price ? name.padEnd(w - price.length) + price : name);
    if (tpl.show_doneness && item.doneness) out.push(`    Ponto: [ ${item.doneness} ]`);
    if (tpl.show_notes && item.notes) out.push(`   *** OBS: ${item.notes.toUpperCase()} ***`);
    if (i < opts.items.length - 1) out.push(center('--------', w));
  });
  if (complete) {
    const subtotal = opts.items.reduce((s, it) => s + (it.price ?? 0) * it.quantity, 0);
    out.push(dash, 'Cliente', '', 'Nome: Maria Souza', 'Telefone: (11) 91234-5678');
    if (opts.delivery) out.push('Endereço: Rua das Flores, 250', 'Bairro: Centro');
    out.push(dash, 'Pagamento', '', 'Forma de Pagamento: Dinheiro', dash, center('* Cobrar do cliente *', w), dash);
    out.push('Subtotal:'.padEnd(w - brl(subtotal).length) + brl(subtotal));
    out.push('Total:'.padEnd(w - brl(subtotal).length) + brl(subtotal));
  }
  out.push(dash);
  if (tpl.footer) out.push(center(tpl.footer, w));
  return out;
}