import net from 'node:net';
import { describe, it, expect, afterEach } from 'vitest';
import { encodeCp850, Receipt, wrap } from '../escpos.js';
import { buildTicket } from '../tickets.js';
import { loadConfig, parsePrinterAddress, resolvePrinter } from '../config.js';
import { sendRaw, probe } from '../transport.js';
import { printJob } from '../worker.js';

const baseConfig = loadConfig({ PRINT_MODE: 'live', PRINTER_GRILL: '10.0.0.1', PRINTER_KITCHEN: 'tcp://10.0.0.2:9101' });

const grillJob = {
  id: 'j1', kind: 'ORDER', sector: 'GRILL', origin: 'SALAO', order_number: 12, table_number: 5,
  customer_name: 'João', created_at: '2026-09-30T22:00:00Z', is_reprint: false,
  payload: { waiter: 'Lucas' },
  items: [{ name: 'Espeto de Picanha', quantity: 2, doneness: 'AO_PONTO', notes: 'Sem sal' }],
};

/** Impressora falsa: aceita uma conexão e devolve os bytes recebidos. */
function fakePrinter() {
  const received = [];
  const server = net.createServer((socket) => {
    const chunks = [];
    socket.on('data', (c) => chunks.push(c));
    socket.on('end', () => received.push(Buffer.concat(chunks)));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, received })));
}

let servers = [];
afterEach(() => { servers.forEach((s) => s.close()); servers = []; });

describe('ESC/POS', () => {
  it('codifica acentos em CP850', () => {
    expect(encodeCp850('ção')).toEqual([0x87, 0xc6, 0x6f]);
    expect(encodeCp850('É')).toEqual([0x90]);
    expect(encodeCp850('€')).toEqual([0x3f]);
  });

  it('quebra linhas respeitando palavras', () => {
    expect(wrap('Espeto de picanha bem grande', 12)).toEqual(['Espeto de', 'picanha bem', 'grande']);
  });

  it('inicia com ESC @ + CP850 e termina com corte', () => {
    const buf = new Receipt(32).line('Oi').cut().toBuffer();
    expect([...buf.subarray(0, 5)]).toEqual([0x1b, 0x40, 0x1b, 0x74, 0x02]);
    expect([...buf.subarray(-4)]).toEqual([0x1d, 0x56, 0x42, 0x03]);
  });
});

const padrao = { ...baseConfig, templates: { GRILL: { layout: 'PADRAO' }, KITCHEN: { layout: 'PADRAO' } } };

describe('Roteamento e cupons', () => {
  it('retirada no local: cupom e etiqueta mostram RETIRADA e não o endereço', () => {
    const job = { ...grillJob, origin: 'DELIVERY', table_number: null, order_number: 1024, customer_name: 'Ana',
      payload: { order_type: 'PICKUP', neighborhood: '' }, delivery: { customer_name: 'Ana', phone: '11999990000', address_street: '', address_number: '', address_neighborhood: '', payment_method: 'CARTAO_ENTREGA', total: 56 } };
    const anota = buildTicket(job, baseConfig).toText();
    expect(anota).toContain('RETIRADA NO LOCAL');
    const classic = buildTicket(job, padrao).toText();
    expect(classic).toContain('RETIRADA #1024');
    expect(classic).not.toContain('END:');
    expect(classic).not.toContain('Bairro:');
  });

  it('cupom de produção no layout Anota (padrão) traz pedido, mesa e itens sem preço', () => {
    const text = buildTicket(grillJob, baseConfig).toText();
    expect(text).toContain('CONSUMO NO LOCAL');
    expect(text).toContain('Mesa 5');
    expect(text).toContain('Itens');
    expect(text).not.toContain('R$');
  });

  it('interpreta endereços de impressora', () => {
    expect(parsePrinterAddress('192.168.1.9')).toMatchObject({ host: '192.168.1.9', port: 9100 });
    expect(parsePrinterAddress('tcp://192.168.1.9:9101')).toMatchObject({ port: 9101 });
    expect(parsePrinterAddress('')).toBeNull();
  });

  it('sem impressora no bar/caixa, bebidas e expedição vão para a churrasqueira (cozinha só acompanhamentos)', () => {
    expect(resolvePrinter(baseConfig, 'GRILL').address.host).toBe('10.0.0.1');
    expect(resolvePrinter(baseConfig, 'KITCHEN').target).toBe('KITCHEN');
    expect(resolvePrinter(baseConfig, 'BAR').target).toBe('GRILL');
    expect(resolvePrinter(baseConfig, 'NONE').target).toBe('GRILL');
  });

  it('cupom de produção (layout padrão) traz mesa, ponto e observação', () => {
    const text = buildTicket(grillJob, padrao).toText();
    expect(text).toContain('CHURRASQUEIRA');
    expect(text).toContain('MESA 5');
    expect(text).toContain('2x ESPETO DE PICANHA');
    expect(text).toContain('PONTO: [ AO PONTO ]');
    expect(text).toContain('*** OBS: SEM SAL ***');
  });

  it('cupom de cancelamento e 2ª via são destacados', () => {
    expect(buildTicket({ ...grillJob, kind: 'CANCEL', payload: { reason: 'Desistiu' } }, baseConfig).toText()).toContain('CANCELADO');
    expect(buildTicket({ ...grillJob, is_reprint: true, reprint_reason: 'Papel acabou' }, baseConfig).toText()).toContain('2ª VIA');
  });

  it('cupom de expedição do delivery calcula troco', () => {
    const text = buildTicket({
      ...grillJob, kind: 'DELIVERY_SUMMARY', sector: 'NONE', origin: 'DELIVERY',
      items: [{ name: 'Picanha', quantity: 1, unit_price: 30 }],
      payload: { customer_name: 'Ana', address_street: 'Rua A', address_number: '1', address_neighborhood: 'Centro',
                 subtotal: 30, delivery_fee: 5, total: 35, payment_method: 'DINHEIRO', cash_change_for: 50 },
    }, baseConfig).toText();
    expect(text).toContain('VIA DO ENTREGADOR');
    expect(text).toContain('R$ 35,00');
    expect(text).toContain('levar R$ 15,00');
  });
});

describe('Transporte TCP (impressora falsa)', () => {
  it('envia os bytes e fecha a conexão', async () => {
    const printer = await fakePrinter();
    servers.push(printer.server);
    const config = { ...baseConfig, printers: { ...baseConfig.printers, GRILL: { host: '127.0.0.1', port: printer.port, label: 'fake' } } };

    await printJob(grillJob, { ...config, templates: padrao.templates });
    await new Promise((r) => setTimeout(r, 50));

    expect(printer.received).toHaveLength(1);
    expect(printer.received[0].includes(Buffer.from('ESPETO DE PICANHA'))).toBe(true);
  });

  it('serializa envios simultâneos para a mesma impressora', async () => {
    const printer = await fakePrinter();
    servers.push(printer.server);
    const address = { host: '127.0.0.1', port: printer.port };
    await Promise.all([sendRaw(address, Buffer.from('A')), sendRaw(address, Buffer.from('B')), sendRaw(address, Buffer.from('C'))]);
    await new Promise((r) => setTimeout(r, 50));
    expect(printer.received.map(String).sort()).toEqual(['A', 'B', 'C']);
  });

  it('falha com mensagem clara quando a impressora não responde', async () => {
    await expect(sendRaw({ host: '127.0.0.1', port: 1 }, Buffer.from('x'), 1000)).rejects.toThrow(/127\.0\.0\.1:1/);
    expect((await probe({ host: '127.0.0.1', port: 1 }, 1000)).ok).toBe(false);
  });

  it('falha se o setor não tiver impressora configurada', async () => {
    const config = loadConfig({ PRINT_MODE: 'live' });
    await expect(printJob(grillJob, config)).rejects.toThrow(/PRINTER_GRILL/);
  });
});
