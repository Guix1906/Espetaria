import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { BOT_DEFAULTS, parseTestPhones, resolveBotSettings } from '../whatsappBot';

// A lógica do robô vive na Edge Function (pasta supabase/, que não vai para a Vercel):
// import dinâmico para o tsc do build não depender dela.
let bot: any;
beforeAll(async () => {
  bot = await import(/* @vite-ignore */ resolve(__dirname, '../../../supabase/functions/whatsapp-bot/logic.ts'));
});

const textPayload = (over: Record<string, unknown> = {}) => ({
  type: 'ReceivedCallback', isGroup: false, isNewsletter: false, broadcast: false, isStatusReply: false,
  phone: '5511987654321', fromMe: false, messageId: 'ABC123', senderName: 'Maria', text: { message: 'Oi, tem picanha hoje?' },
  ...over,
});

describe('Robô de atendimento do WhatsApp', () => {
  it('configurações padrão do app e da função são iguais', () => {
    expect(bot.BOT_DEFAULTS).toEqual(BOT_DEFAULTS);
    const saved = { mode: 'TEST', test_phones: ['11987654321'], pause_hours: 3, pause_on_human: false, store_info: 'Abre 18h' };
    expect(bot.resolveBotSettings(saved)).toEqual(resolveBotSettings(saved as never));
    expect(resolveBotSettings({ mode: 'X' as never, pause_hours: -1 })).toMatchObject({ mode: 'OFF', pause_hours: 2 });
  });

  it('lista de teste aceita número com ou sem 55 e com ou sem o nono dígito', () => {
    expect(parseTestPhones('(11) 98765-4321\n\n21 3333-4444, 123')).toEqual(['11987654321', '2133334444']);
    const settings = bot.resolveBotSettings({ mode: 'TEST', test_phones: ['11 98765-4321'] });
    expect(bot.isBotAllowedFor('5511987654321', settings)).toBe(true);
    expect(bot.isBotAllowedFor('551187654321', settings)).toBe(true); // WhatsApp sem o 9
    expect(bot.isBotAllowedFor('5511912345678', settings)).toBe(false);
    expect(bot.isBotAllowedFor('5511912345678', bot.resolveBotSettings({ mode: 'ALL' }))).toBe(true);
    expect(bot.isBotAllowedFor('5511987654321', bot.resolveBotSettings({ mode: 'OFF', test_phones: ['11987654321'] }))).toBe(false);
  });

  it('procura pedidos do cardápio pelo telefone gravado sem DDI', () => {
    expect(bot.phoneLookupValues('5511987654321')).toEqual(expect.arrayContaining(['11987654321', '5511987654321', '1187654321']));
  });

  it('lê a mensagem da Z-API e ignora grupos, canais e status', () => {
    expect(bot.parseIncoming(textPayload())).toMatchObject({ kind: 'customer', phone: '5511987654321', text: 'Oi, tem picanha hoje?', messageId: 'ABC123', media: null });
    expect(bot.parseIncoming(textPayload({ fromMe: true }))).toMatchObject({ kind: 'self' });
    expect(bot.parseIncoming(textPayload({ isGroup: true })).kind).toBe('ignore');
    expect(bot.parseIncoming(textPayload({ phone: '120363-group' })).kind).toBe('ignore');
    expect(bot.parseIncoming(textPayload({ isNewsletter: true })).kind).toBe('ignore');
    expect(bot.parseIncoming(textPayload({ type: 'MessageStatusCallback' })).kind).toBe('ignore');
    expect(bot.parseIncoming(textPayload({ text: undefined, audio: { audioUrl: 'x' } }))).toMatchObject({ kind: 'customer', media: 'audio', text: '' });
  });

  it('lê o webhook MESSAGES_UPSERT da Evolution API', () => {
    const evo = (key: object, data: object = {}) => ({
      event: 'messages.upsert',
      instance: 'Ponto',
      data: { key: { remoteJid: '5511987654321@s.whatsapp.net', fromMe: false, id: 'EVO1', ...key }, pushName: 'Maria', message: { conversation: 'Tem picanha?' }, messageType: 'conversation', ...data },
    });
    expect(bot.parseIncoming(evo({}))).toMatchObject({ kind: 'customer', phone: '5511987654321', text: 'Tem picanha?', messageId: 'EVO1', senderName: 'Maria', media: null });
    expect(bot.parseIncoming(evo({ fromMe: true }))).toMatchObject({ kind: 'self', senderName: null });
    expect(bot.parseIncoming(evo({ remoteJid: '120363@g.us' })).kind).toBe('ignore');
    expect(bot.parseIncoming(evo({ remoteJid: '999@lid', remoteJidAlt: '5511987654321@s.whatsapp.net' }))).toMatchObject({ phone: '5511987654321' });
    expect(bot.parseIncoming(evo({}, { message: { extendedTextMessage: { text: 'Oi' } } }))).toMatchObject({ text: 'Oi' });
    expect(bot.parseIncoming(evo({}, { message: { audioMessage: {} }, messageType: 'audioMessage' }))).toMatchObject({ media: 'audio', text: '' });
    expect(bot.parseIncoming({ event: 'connection.update', data: {} }).kind).toBe('ignore');
  });

  it('monta o histórico em turnos e marca o que a equipe escreveu', () => {
    const messages = bot.toChatTurns([
      { direction: 'BOT', body: 'mensagem solta do robô' },
      { direction: 'IN', body: 'Oi' },
      { direction: 'IN', body: 'tem cardápio?' },
      { direction: 'BOT', body: 'Tem sim: link' },
      { direction: 'HUMAN', body: 'Hoje temos costela' },
      { direction: 'IN', body: 'quanto custa?' },
    ]);
    expect(messages).toEqual([
      { role: 'user', content: 'Oi\ntem cardápio?' },
      { role: 'model', content: 'Tem sim: link\n[Atendente da loja] Hoje temos costela' },
      { role: 'user', content: 'quanto custa?' },
    ]);
  });

  it('monta o pedido ao Gemini com instruções, dados da loja e resposta em JSON', () => {
    const body = bot.buildGeminiRequest('DADOS DA LOJA\nNome: Loja', [{ direction: 'IN', body: 'Oi' }]);
    expect(body.systemInstruction.parts[0].text).toBe(bot.SYSTEM_PROMPT);
    expect(body.systemInstruction.parts[1].text).toContain('DADOS DA LOJA');
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'Oi' }] }]);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema.required).toEqual(['reply', 'handoff']);
  });

  it('lê a resposta do Gemini e trata bloqueio e corte como chamada de atendente', () => {
    const ok = { candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: '{"reply":"Temos sim!",' }, { text: '"handoff":false}' }] } }] };
    expect(bot.parseGeminiResponse(ok)).toEqual({ reply: 'Temos sim!', handoff: false });
    const fallback = { reply: bot.HANDOFF_FALLBACK, handoff: true };
    expect(bot.parseGeminiResponse({ promptFeedback: { blockReason: 'SAFETY' } })).toEqual(fallback);
    expect(bot.parseGeminiResponse({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"reply":"Te' }] } }] })).toEqual(fallback);
    expect(bot.parseGeminiResponse({ candidates: [] })).toEqual(fallback);
  });

  it('resposta quebrada vira chamada de atendente', () => {
    expect(bot.parseBotReply('{"reply":"Temos sim!","handoff":false}')).toEqual({ reply: 'Temos sim!', handoff: false });
    expect(bot.parseBotReply('não é json')).toEqual({ reply: bot.HANDOFF_FALLBACK, handoff: true });
    expect(bot.parseBotReply('{"reply":"","handoff":false}').handoff).toBe(true);
  });

  it('contexto traz cardápio, esgotados, taxas e o pedido do cliente com link', () => {
    const text = bot.buildContextBlock(
      {
        name: 'Sabor da Carne', address: 'Rua A, 10', phone: '11 3333-4444', pixKey: 'pix@loja.com', isOpen: true,
        menuUrl: 'https://loja.app/cardapio', now: new Date('2026-10-12T22:00:00Z'), storeInfo: 'Abrimos às 18h.',
        zones: [{ name: 'Centro', fee: 5 }],
        products: [
          { name: 'Espeto de Picanha', price: 24, category: 'Espetos', exhausted: false, allowsDoneness: true },
          { name: 'Coração', price: 16, category: 'Espetos', exhausted: true, allowsDoneness: false },
        ],
      },
      [
        { id: 'p1', order_number: 1024, order_type: 'PICKUP', status: 'READY', total: 48, created_at: '2026-10-12T21:30:00Z', items: [{ quantity: 2, product_name: 'Espeto de Picanha' }] },
        { id: 'p2', order_number: 1025, order_type: 'DELIVERY', status: 'READY', total: 30, created_at: '2026-10-12T21:40:00Z', items: [] },
      ],
      'https://loja.app',
    );
    expect(text).toContain('ABERTO agora');
    expect(text).toContain('Espeto de Picanha: R$ 24,00 (cliente escolhe o ponto)');
    expect(text).toContain('Coração: R$ 16,00 (ESGOTADO)');
    expect(text).toContain('Centro R$ 5,00');
    expect(text).toContain('Abrimos às 18h.');
    expect(text).toContain('Pedido #1024 · Retirada no local · pronto para retirada');
    expect(text).toContain('https://loja.app/#/pedido/p1');
    // Delivery pronto não é "pode buscar": aguarda o entregador
    expect(text).toContain('Pedido #1025 · Entrega · pronto, aguardando o entregador sair');
  });

  it('loja fechada não marca nada como esgotado', () => {
    const text = bot.buildContextBlock(
      { name: 'Loja', address: null, phone: null, pixKey: null, isOpen: false, menuUrl: null, now: new Date(), storeInfo: '', zones: [],
        products: [{ name: 'Coração', price: 16, category: null, exhausted: true, allowsDoneness: false }] },
      [], null,
    );
    expect(text).toContain('FECHADO no momento');
    expect(text).not.toContain('ESGOTADO');
    expect(text).toContain('Nenhum pedido feito pelo cardápio digital');
  });
});
