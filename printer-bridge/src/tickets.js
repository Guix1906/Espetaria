import { Receipt } from './escpos.js';

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

const brl = (value) => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;

function formatTime(iso) {
  const date = iso ? new Date(iso) : new Date();
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function header(r, job, config) {
  r.align('center').bold().line(config.restaurantName).bold(false);
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

  header(r, job, config);

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
    r.size(2).bold().line(job.origin === 'DELIVERY' ? `DELIVERY #${job.order_number}` : `MESA ${job.table_number ?? '-'}`).bold(false).size(1);
    if (job.origin !== 'DELIVERY') r.line(`Pedido #${job.order_number}`);
    r.line(formatTime(job.created_at)).divider();
    r.bold().line('NÃO PREPARAR / RETIRAR:').bold(false);
    productionItems(r, job.items);
    r.divider();
    if (payload.reason) r.line(`Motivo: ${payload.reason}`);
    return r.feed(3).cut();
  }

  if (job.kind === 'DELIVERY_SUMMARY') {
    const o = payload;
    r.align('center').size(2).bold().line(`DELIVERY #${job.order_number}`).bold(false).size(1)
      .line('CUPOM DE EXPEDIÇÃO').line(formatTime(o.created_at || job.created_at));
    r.align('left').divider('=');
    r.bold().line(`CLIENTE: ${o.customer_name || job.customer_name || ''}`).bold(false);
    if (o.phone) r.line(`TEL: ${o.phone}`);
    r.line(`END: ${o.address_street || ''}, ${o.address_number || ''}`);
    if (o.address_complement) r.line(`COMPL: ${o.address_complement}`);
    r.bold().line(`BAIRRO: ${o.address_neighborhood || ''}`).bold(false);
    if (o.address_reference) r.line(`REF: ${o.address_reference}`);
    r.divider();
    for (const item of job.items || []) {
      r.pair(`${item.quantity}x ${item.name}`.slice(0, config.paperColumns - 12), brl(item.unit_price * item.quantity));
      if (item.doneness) r.line(`   PONTO: ${DONENESS[item.doneness] || item.doneness}`);
      if (item.notes) r.line(`   OBS: ${item.notes}`);
    }
    r.divider();
    r.pair('Subtotal', brl(o.subtotal)).pair('Taxa de entrega', brl(o.delivery_fee));
    r.bold().size(3).pair('TOTAL', brl(o.total)).size(1).bold(false);
    r.divider();
    r.bold().line(`PAGAMENTO: ${PAYMENT[o.payment_method] || o.payment_method || ''}`).bold(false);
    if (o.payment_method === 'DINHEIRO' && o.cash_change_for) {
      r.line(`Troco para ${brl(o.cash_change_for)} (levar ${brl(o.cash_change_for - o.total)})`);
    }
    if (o.notes) r.divider().line(`OBS DO PEDIDO: ${o.notes}`);
    return r.feed(3).cut();
  }

  // Cupom de produção (ORDER)
  r.align('center').size(2).bold().line(sectorTitle).bold(false).size(1);
  r.align('left').divider('=');
  if (job.origin === 'DELIVERY') {
    r.size(2).bold().line(`DELIVERY #${job.order_number}`).bold(false).size(1);
    r.line(`Cliente: ${job.customer_name || ''}`);
    if (payload.neighborhood) r.line(`Bairro: ${payload.neighborhood}`);
  } else {
    r.size(2).bold().line(`MESA ${job.table_number ?? '-'}`).bold(false).size(1);
    r.pair(`Pedido #${job.order_number}`, payload.waiter ? `Garçom: ${payload.waiter}` : '');
    if (job.customer_name) r.line(`Cliente: ${job.customer_name}`);
  }
  r.line(formatTime(job.created_at)).divider();
  productionItems(r, job.items);
  if (payload.order_notes) r.divider().bold().line(`OBS: ${payload.order_notes}`).bold(false);
  r.divider();
  if (config.beepOnOrder) r.beep();
  return r.feed(3).cut();
}
