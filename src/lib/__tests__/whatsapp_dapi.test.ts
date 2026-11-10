import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

// Formato do webhook da D-API (docs.d-api.cloud, 10/11/2026)
let bot: any;
beforeAll(async () => {
  bot = await import(/* @vite-ignore */ resolve(__dirname, '../../../supabase/functions/whatsapp-bot/logic.ts'));
});

const received = (data: Record<string, unknown> = {}, event = 'messages.received') => ({
  event,
  sessionId: 'ponto',
  timestamp: '2026-11-10T16:00:00.000Z',
  data: {
    id: '3EB0ABC', type: 'text', message: 'Tem picanha hoje?', fromMe: false, is_group: false, group_name: '', isMetaAI: false,
    from: { jid: '5598981234567@s.whatsapp.net', name: 'Maria' }, from_name: 'Maria',
    to: { jid: '559882021977@s.whatsapp.net', name: 'Loja' }, timestamp: 1762790400000, media_url: null,
    ...data,
  },
});

describe('Webhook da D-API', () => {
  it('mensagem de cliente vira atendimento', () => {
    expect(bot.parseIncoming(received())).toEqual({
      kind: 'customer', phone: '5598981234567', text: 'Tem picanha hoje?', messageId: '3EB0ABC', senderName: 'Maria', fromApi: false, media: null,
    });
  });

  it('resposta digitada no celular da loja pausa o robô (self, não da API)', () => {
    const msg = bot.parseIncoming(received({ fromMe: true, from: { jid: '559882021977@s.whatsapp.net' }, to: { jid: '5598981234567@s.whatsapp.net' } }));
    expect(msg).toMatchObject({ kind: 'self', phone: '5598981234567', fromApi: false });
  });

  it('eco do que o sistema enviou (messages.sent) é ignorado pelo robô', () => {
    const msg = bot.parseIncoming(received({ fromMe: true, to: { jid: '5598981234567@s.whatsapp.net' } }, 'messages.sent'));
    expect(msg).toMatchObject({ kind: 'self', fromApi: true });
  });

  it('áudio sem texto vira mídia', () => {
    expect(bot.parseIncoming(received({ type: 'ptt', message: '' }))).toMatchObject({ kind: 'customer', media: 'audio', text: '' });
  });

  it('grupo, reação e outros eventos são ignorados', () => {
    expect(bot.parseIncoming(received({ is_group: true }))).toEqual({ kind: 'ignore' });
    expect(bot.parseIncoming(received({ type: 'reaction', message: '👍' }))).toEqual({ kind: 'ignore' });
    expect(bot.parseIncoming({ event: 'connection.status', sessionId: 'ponto', data: { status: 'connected' } })).toEqual({ kind: 'ignore' });
  });
});
