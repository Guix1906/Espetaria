/**
 * Configuração do robô de atendimento do WhatsApp (restaurant_settings.whatsapp_bot).
 * A mesma estrutura e os mesmos padrões ficam em supabase/functions/whatsapp-bot/logic.ts
 * (quem responde de verdade); um teste garante que são iguais.
 */
export type BotMode = 'OFF' | 'TEST' | 'ALL';

export interface BotSettings {
  /** OFF = desligado; TEST = só a lista de teste; ALL = todos os clientes. */
  mode: BotMode;
  test_phones: string[];
  /** Horário, formas de pagamento e outras informações que o robô pode usar. */
  store_info: string;
  /** Horas que o robô fica quieto depois de chamar atendente ou de alguém da loja responder. */
  pause_hours: number;
  /** Pausar o robô quando alguém da loja responde pelo celular. */
  pause_on_human: boolean;
}

export const BOT_DEFAULTS: BotSettings = {
  mode: 'OFF',
  test_phones: [],
  store_info: '',
  pause_hours: 2,
  pause_on_human: true,
};

export function resolveBotSettings(saved: Partial<BotSettings> | null | undefined): BotSettings {
  const s = saved ?? {};
  const hours = Number(s.pause_hours);
  return {
    mode: s.mode === 'TEST' || s.mode === 'ALL' ? s.mode : 'OFF',
    test_phones: Array.isArray(s.test_phones) ? s.test_phones.map(String).filter((p) => p.trim()) : [],
    store_info: typeof s.store_info === 'string' ? s.store_info : '',
    pause_hours: Number.isFinite(hours) && hours > 0 ? Math.min(hours, 48) : BOT_DEFAULTS.pause_hours,
    pause_on_human: s.pause_on_human !== false,
  };
}

/** Uma linha por número; mantém só dígitos e descarta linhas vazias. */
export function parseTestPhones(text: string): string[] {
  return text.split(/[\n,;]+/).map((line) => line.replace(/\D/g, '')).filter((p) => p.length >= 10);
}

/** Endereço da função (sem a senha, que só existe nos secrets do Supabase). */
export function botWebhookBaseUrl(): string {
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
  return base ? `${base}/functions/v1/whatsapp-bot` : '';
}
