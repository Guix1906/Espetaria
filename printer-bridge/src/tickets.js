import { Receipt } from './escpos.js';
import { resolveTemplates } from './templates.js';

const SECTOR_TITLES = {
  GRILL: 'CHURRASQUEIRA',
  KITCHEN: 'COZINHA',
  BAR: 'BAR',
  NONE: 'EXPEDIÇÃO',
};

const DONENESS = {
  MAL_PASSADA: 'MAL PASSADA',
  AO_PONTO_PARA_MAL: 'AO PONTO P/ MAL',
  AO_PONTO: 'AO PONTO',
  AO_PONTO_PARA_BEM: 'AO PONTO P/ BEM',
  BEM_PASSADA: 'BEM PASSADA',
};

const PAYMENT = { PIX: 'PIX', DINHEIRO: 'DINHEIRO', CARTAO_ENTREGA: 'CARTÃO NA ENTREGA' };

/** Retirada no local (pedido do cardápio sem entrega). */
const isPickup = (job) => (job.payload?.order_type || job.delivery?.order_type) === 'PICKUP';
const remoteTitle = (job) => `${isPickup(job) ? 'RETIRADA' : 'DELIVERY'} #${job.order_number}`;

const payLabel = (job, method) => (isPickup(job) && method === 'CARTAO_ENTREGA' ? 'CARTÃO NA RETIRADA' : PAYMENT[method] || method || '');

const brl = (value) => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;

function formatTime(iso) {
  const date = iso ? new Date(iso) : new Date();
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function header(r, job, config) {
  r.align('center');
  if (config.restaurantName) r.bold().line(config.restaurantName).bold(false);
  if (job.is_reprint) {
    r.invert().bold().line(` 2ª VIA `).bold(false).invert(false);
    if (job.reprint_reason) r.line(job.reprint_reason);
  }
}

function productionItems(r, items) {
  for (const item of items || []) {
    r.size(3).bold().line(`${item.quantity}x ${String(item.name).toUpperCase()}`).bold(false).size(1);
    if (item.doneness) r.line(`   PONTO: ${DONENESS[item.doneness] || item.doneness}`);
    if (item.notes) r.line(`   OBS: ${item.notes}`);
  }
}

/** Monta o cupom completo a partir de um registro da tabela print_queue. */
export function buildTicket(job, config) {
  const r = new Receipt(config.paperColumns);
  const sectorTitle = SECTOR_TITLES[job.sector] || job.sector;
  const payload = job.payload || {};

  // ORDER e expedição no layout Anota têm cabeçalho próprio
  const anotaSummary = job.kind === 'DELIVERY_SUMMARY' && resolveTemplates(config.templates).EXPEDICAO.layout === 'ANOTA_COMPLETO';
  if (job.kind !== 'ORDER' && !anotaSummary) header(r, job, config);

  if (job.kind === 'TEST') {
    r.align('center').size(2).bold().line('TESTE').bold(false).size(1)
      .line(`Setor: ${sectorTitle}`)
      .line(formatTime())
      .line(payload.requested_by ? `Solicitado por: ${payload.requested_by}` : '')
      .line('Acentuação: ÁÉÍÓÚ ÃÕ Ç ãõç ªº')
      .divider()
      .line('Se você lê este cupom, a impressora')
      .line('está conectada ao sistema.');
    return r.feed(3).cut();
  }

  if (job.kind === 'CANCEL') {
    r.align('center').invert().size(2).bold().line(' CANCELADO ').bold(false).size(1).invert(false)
      .line(sectorTitle);
    r.align('left').divider('=');
    r.size(2).bold().line(job.origin === 'DELIVERY' ? remoteTitle(job) : `MESA ${job.table_number ?? '-'}`).bold(false).size(1);
    if (job.origin !== 'DELIVERY') r.line(`Pedido #${job.order_number}`);
    r.line(formatTime(job.created_at)).divider();
    r.bold().line('NÃO PREPARAR / RETIRAR:').bold(false);
    productionItems(r, job.items);
    r.divider();
    if (payload.reason) r.line(`Motivo: ${payload.reason}`);
    return r.feed(3).cut();
  }

  if (job.kind === 'BILL') return billTicket(r, job, config);

  if (job.kind === 'DELIVERY_SUMMARY') {
    const o = payload;
    const exp = resolveTemplates(config.templates).EXPEDICAO;
    if (exp.layout === 'ANOTA_COMPLETO') {
      const copies = Math.min(Math.max(Number(exp.copies) || 1, 1), 3);
      for (let i = 0; i < copies; i++) {
        anotaTicket(r, job, config, { ...exp, title: 'EXPEDIÇÃO' }, { complete: true, data: { customer_name: job.customer_name, ...o } });
        r.feed(3).cut();
      }
      return r;
    }
    r.align('center').size(2).bold().line(remoteTitle(job)).bold(false).size(1)
      .line('CUPOM DE EXPEDIÇÃO').line(formatTime(o.created_at || job.created_at));
    r.align('left').divider('=');
    r.bold().line(`CLIENTE: ${o.customer_name || job.customer_name || ''}`).bold(false);
    if (o.phone) r.line(`TEL: ${o.phone}`);
    if (isPickup(job)) {
      r.size(2).bold().line('RETIRADA NO LOCAL').bold(false).size(1);
    } else {
      r.line(`END: ${o.address_street || ''}, ${o.address_number || ''}`);
      if (o.address_complement) r.line(`COMPL: ${o.address_complement}`);
      r.bold().line(`BAIRRO: ${o.address_neighborhood || ''}`).bold(false);
      if (o.address_reference) r.line(`REF: ${o.address_reference}`);
    }
    r.divider();
    for (const item of job.items || []) {
      r.pair(`${item.quantity}x ${item.name}`.slice(0, config.paperColumns - 12), brl(item.unit_price * item.quantity));
      if (item.doneness) r.line(`   PONTO: ${DONENESS[item.doneness] || item.doneness}`);
      if (item.notes) r.line(`   OBS: ${item.notes}`);
    }
    r.divider();
    r.pair('Subtotal', brl(o.subtotal));
    if (!isPickup(job)) r.pair('Taxa de entrega', brl(o.delivery_fee));
    r.bold().size(3).pair('TOTAL', brl(o.total)).size(1).bold(false);
    r.divider();
    r.bold().line(`PAGAMENTO: ${payLabel(job, o.payment_method)}`).bold(false);
    if (o.payment_method === 'DINHEIRO' && o.cash_change_for) {
      r.line(`Troco para ${brl(o.cash_change_for)} (levar ${brl(o.cash_change_for - o.total)})`);
    }
    if (o.notes) r.divider().line(`OBS DO PEDIDO: ${o.notes}`);
    return r.feed(3).cut();
  }

  // Cupom de produção (ORDER), seguindo o modelo configurado no painel
  const templates = resolveTemplates(config.templates);
  const tpl = templates[job.sector] || { ...templates.KITCHEN, title: sectorTitle };
  const copies = Math.min(Math.max(Number(tpl.copies) || 1, 1), 3);
  for (let copy = 0; copy < copies; copy++) {
    productionTicket(r, job, config, tpl, templates.DELIVERY_LABEL);
  }
  return r;
}

/**
 * Delivery/retirada em UM cupom curto (economia de papel): itens + cliente,
 * endereço e pagamento juntos, sem etiqueta separada.
 */
export function compactDeliveryTicket(r, job, config, tpl) {
  const d = job.delivery || {};
  const payload = job.payload || {};
  const sector = SECTOR_TITLES[job.sector] || job.sector;
  if (job.is_reprint) r.align('center').bold().line('2ª VIA').bold(false);
  r.align('left').size(2).bold().line(remoteTitle(job)).bold(false).size(1);
  r.pair(sector, formatTime(d.created_at || job.created_at));
  r.divider();
  for (const item of job.items || []) {
    r.bold().line(`(${item.quantity}) ${item.name}`).bold(false);
    if (tpl.show_doneness !== false && item.doneness) r.line(`  Ponto: ${DONENESS[item.doneness] || item.doneness}`);
    if (tpl.show_notes !== false && item.notes) r.line(`  Obs: ${item.notes}`);
  }
  const orderNotes = payload.order_notes || d.notes;
  if (orderNotes) r.line(`Obs: ${orderNotes}`);
  r.divider();
  const name = d.customer_name || job.customer_name || '';
  r.bold().line([name, d.phone].filter(Boolean).join(' - ')).bold(false);
  if (isPickup(job)) {
    r.bold().line('RETIRADA NO LOCAL').bold(false);
  } else {
    const street = [d.address_street, d.address_number].filter(Boolean).join(', ');
    if (street) r.line([street, d.address_complement].filter(Boolean).join(' - '));
    const hood = d.address_neighborhood || payload.neighborhood;
    if (hood) r.bold().line(`Bairro: ${hood}`).bold(false);
    if (d.address_reference) r.line(`Ref: ${d.address_reference}`);
  }
  if (d.payment_method || d.total != null) {
    r.bold().pair(payLabel(job, d.payment_method), d.total != null ? brl(d.total) : '').bold(false);
    if (d.payment_method === 'DINHEIRO' && d.cash_change_for) {
      r.line(`Troco p/ ${brl(d.cash_change_for)}${d.total != null ? ` (levar ${brl(d.cash_change_for - d.total)})` : ''}`);
    }
  }
  if (tpl.beep || config.beepOnOrder) r.beep();
  r.feed(2).cut();
}

function productionTicket(r, job, config, tpl, label) {
  if (job.origin === 'DELIVERY') {
    compactDeliveryTicket(r, job, config, tpl);
    return;
  }
  if (tpl.layout === 'ANOTA_PRODUCAO' || tpl.layout === 'ANOTA_COMPLETO') {
    anotaTicket(r, job, config, tpl, { complete: tpl.layout === 'ANOTA_COMPLETO', data: job.delivery });
    if (tpl.beep || config.beepOnOrder) r.beep();
    r.feed(3).cut();
    if (job.origin === 'DELIVERY' && label.enabled) deliveryLabel(r, job, config, label);
    return;
  }
  const payload = job.payload || {};
  header(r, job, { ...config, restaurantName: tpl.show_restaurant_name ? config.restaurantName : '' });
  r.align('center').size(2).bold().line(tpl.title).bold(false).size(1);
  r.align('left').divider('=');
  if (job.origin === 'DELIVERY') {
    r.size(2).bold().line(remoteTitle(job)).bold(false).size(1);
    r.line(`Cliente: ${job.customer_name || ''}`);
    const hood = job.delivery?.address_neighborhood || payload.neighborhood;
    if (isPickup(job)) r.bold().line('RETIRADA NO LOCAL').bold(false);
    else if (hood) r.line(`Bairro: ${hood}`);
  } else {
    r.size(2).bold().line(`MESA ${job.table_number ?? '-'}`).bold(false).size(1);
    r.pair(`Pedido #${job.order_number}`, tpl.show_waiter && payload.waiter ? `Garçom: ${payload.waiter}` : '');
    if (job.customer_name) r.line(`Cliente: ${job.customer_name}`);
  }
  if (tpl.show_time) r.line(formatTime(job.created_at));
  r.divider();
  for (const item of job.items || []) {
    r.size(Number(tpl.item_size) || 3).bold().line(`${item.quantity}x ${String(item.name).toUpperCase()}`).bold(false).size(1);
    if (tpl.show_doneness && item.doneness) r.line(`   PONTO: ${DONENESS[item.doneness] || item.doneness}`);
    if (tpl.show_notes && item.notes) r.line(`   OBS: ${item.notes}`);
  }
  const orderNotes = payload.order_notes || job.delivery?.notes;
  if (tpl.show_notes && orderNotes) r.divider().bold().line(`OBS: ${orderNotes}`).bold(false);
  r.divider();
  if (tpl.footer) r.align('center').line(tpl.footer).align('left');
  if (tpl.beep || config.beepOnOrder) r.beep();
  r.feed(3).cut();

  // Etiqueta de delivery: destacável, vai grudada na embalagem deste setor
  if (job.origin === 'DELIVERY' && label.enabled) deliveryLabel(r, job, config, label);
}

/** Conta da mesa para o cliente conferir (não é documento fiscal). */
export function billTicket(r, job, config) {
  const o = job.payload || {};
  const num = (v) => Number(v || 0);
  r.align('center').size(2).bold().line(`MESA ${job.table_number ?? '-'}`).bold(false).size(1)
    .bold().line('CONTA PARA CONFERÊNCIA').bold(false)
    .line(formatDateFull(job.created_at));
  r.align('left').divider('=');
  if (job.customer_name) r.line(`Cliente: ${job.customer_name}`);
  if (o.waiter) r.line(`Garçom: ${o.waiter}`);
  if (o.opened_at) r.line(`Aberta em: ${formatTime(o.opened_at)}`);
  r.divider();
  for (const item of job.items || []) {
    const price = brl(num(item.unit_price) * num(item.quantity));
    r.pair(`${item.quantity}x ${item.name}`.slice(0, config.paperColumns - price.length - 1), price);
    if (num(item.quantity) > 1) r.line(`   (${brl(item.unit_price)} cada)`);
  }
  r.divider();
  r.pair('Subtotal', brl(o.subtotal));
  if (num(o.service_fee) > 0) r.pair('Taxa de serviço', brl(o.service_fee));
  if (num(o.discount) > 0) r.pair('Desconto', `- ${brl(o.discount)}`);
  r.bold().pair('TOTAL', brl(o.total)).bold(false);
  if (num(o.paid) > 0) {
    r.pair('Já pago', brl(o.paid));
    r.bold().pair('FALTA PAGAR', brl(Math.max(num(o.total) - num(o.paid), 0))).bold(false);
  }
  const people = num(o.people_count);
  if (people > 1) r.line(`Dividido por ${people}: ${brl(num(o.total) / people)} cada`);
  if (o.pix_key) r.divider().line(`PIX: ${o.pix_key}`);
  r.divider().align('center').line('Não é documento fiscal').line('Obrigado pela preferência!');
  return r.feed(3).cut();
}

function formatDateFull(iso) {
  const date = iso ? new Date(iso) : new Date();
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
}

/**
 * Layout no estilo Anota AI (fotos enviadas pela loja):
 *  - Produção: modalidade, data, loja, "Pedido N" grande e itens "(1) Nome" sem preço
 *  - Completo: + preços por item, bloco Cliente, Pagamento, Subtotal e Total
 */
export function anotaTicket(r, job, config, tpl, { complete, data }) {
  const d = data || {};
  const payload = job.payload || {};
  const modality = job.origin !== 'DELIVERY' ? 'CONSUMO NO LOCAL' : isPickup(job) ? 'RETIRADA NO LOCAL' : 'PARA ENTREGA';
  if (job.is_reprint) {
    r.align('center').invert().bold().line(' 2ª VIA ').bold(false).invert(false);
    if (job.reprint_reason) r.line(job.reprint_reason);
  }
  r.align('center').divider('=').line(modality).divider('=');
  if (tpl.show_time !== false) r.line(formatDateFull(d.created_at || job.created_at));
  if (tpl.show_restaurant_name !== false) r.line(config.restaurantName);
  r.divider('=');
  r.size(2).bold().line(`Pedido ${job.order_number}`).bold(false).size(1);
  if (job.origin !== 'DELIVERY') {
    r.line(`Mesa ${job.table_number ?? '-'}`);
    if (tpl.show_waiter !== false && payload.waiter) r.line(`Garçom: ${payload.waiter}`);
  }
  if (tpl.title) r.line(`[ ${tpl.title} ]`);
  r.align('left').divider();
  r.size(complete ? 1 : 3).line('Itens').size(1).feed(1);
  const items = job.items || [];
  items.forEach((item, index) => {
    const name = `(${item.quantity}) ${item.name}`;
    const price = complete && item.unit_price != null ? brl(item.unit_price * item.quantity) : '';
    if (Number(tpl.item_size) === 3 && !complete) r.size(3).bold().line(name).bold(false).size(1);
    else if (price) r.pair(name.slice(0, config.paperColumns - price.length - 1), price);
    else r.line(name);
    if (tpl.show_doneness !== false && item.doneness) r.line(`    Ponto: ${DONENESS[item.doneness] || item.doneness}`);
    if (tpl.show_notes !== false && item.notes) r.line(`    Obs: ${item.notes}`);
    if (index < items.length - 1) r.align('center').line('--------').align('left');
  });
  const orderNotes = payload.order_notes || d.notes;
  if (tpl.show_notes !== false && orderNotes) r.divider().line(`Obs do pedido: ${orderNotes}`);

  if (complete) {
    const name = d.customer_name || job.customer_name;
    if (name || d.phone) {
      r.divider().line('Cliente').feed(1);
      if (name) r.line(`Nome: ${name}`);
      if (d.phone) r.line(`Telefone: ${d.phone}`);
      if (d.address_street) r.line(`Endereço: ${d.address_street}, ${d.address_number || ''}`);
      if (d.address_complement) r.line(`Compl.: ${d.address_complement}`);
      if (d.address_neighborhood) r.line(`Bairro: ${d.address_neighborhood}`);
      if (d.address_reference) r.line(`Ref.: ${d.address_reference}`);
    }
    if (d.payment_method) {
      r.divider().line('Pagamento').feed(1);
      r.line(`Forma de Pagamento: ${payLabel(job, d.payment_method)}`);
      if (d.payment_method === 'DINHEIRO' && d.cash_change_for) {
        r.line(`Troco para: ${brl(d.cash_change_for)}`);
        if (d.total != null) r.bold().line(`Levar troco: ${brl(d.cash_change_for - d.total)}`).bold(false);
      }
      r.divider().align('center').line('* Cobrar do cliente *').align('left');
    }
    if (d.total != null) {
      r.divider();
      if (d.subtotal != null) r.pair('Subtotal:', brl(d.subtotal));
      if (d.delivery_fee) r.pair('Taxa de entrega:', brl(d.delivery_fee));
      r.bold().pair('Total:', brl(d.total)).bold(false);
    }
  }
  r.divider();
  if (tpl.footer) r.align('center').line(tpl.footer).align('left');
}

/** Etiqueta para identificar a embalagem e organizar a logística de entrega. */
export function deliveryLabel(r, job, config, label) {
  const d = job.delivery || {};
  const sector = SECTOR_TITLES[job.sector] || job.sector;
  r.align('center').invert().size(2).bold().line(` ${remoteTitle(job)} `).bold(false).size(1).invert(false);
  r.line(`Embalagem: ${sector}`);
  r.align('left').divider('=');
  r.size(3).bold().line(String(d.customer_name || job.customer_name || '').toUpperCase()).bold(false).size(1);
  if (label.show_phone && d.phone) r.bold().line(`TEL: ${d.phone}`).bold(false);
  if (isPickup(job)) {
    r.size(3).bold().line('RETIRADA NO LOCAL').bold(false).size(1);
  } else if (label.show_address) {
    r.line(`END: ${d.address_street || ''}, ${d.address_number || ''}`);
    if (d.address_complement) r.line(`COMPL: ${d.address_complement}`);
    r.size(3).bold().line(`BAIRRO: ${d.address_neighborhood || job.payload?.neighborhood || ''}`).bold(false).size(1);
  }
  if (label.show_reference && d.address_reference) r.line(`REF: ${d.address_reference}`);
  if (label.show_payment && d.payment_method) {
    r.divider().bold().line(`PAGAMENTO: ${payLabel(job, d.payment_method)}`).bold(false);
    if (d.payment_method === 'DINHEIRO' && d.cash_change_for) r.line(`Troco para ${brl(d.cash_change_for)}`);
  }
  if (label.show_total && d.total != null) r.bold().pair('TOTAL DO PEDIDO', brl(d.total)).bold(false);
  r.divider();
  if (label.footer) r.align('center').line(label.footer).align('left');
  r.line(formatTime(job.created_at));
  r.feed(3).cut();
}
