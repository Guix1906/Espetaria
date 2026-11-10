// ============================================================================
// Escolhe a conexão do WhatsApp pelo secret WHATSAPP_PROVIDER:
//   dapi (padrão desde 10/11/2026) | evolution
// Mesmas funções nas duas, então o resto do código não precisa saber qual é.
// ============================================================================
import * as dapi from './dapi.ts';
import * as evolution from './evolution.ts';

export { normalizePhone } from './evolution.ts';

export const providerName = () => (Deno.env.get('WHATSAPP_PROVIDER') || '').toLowerCase();
const impl = () => (providerName() === 'evolution' ? evolution : dapi);

export const sendText = (phone: string, text: string) => impl().sendText(phone, text);
export const connectionState = () => impl().connectionState();
export const connectedAccount = () => impl().connectedAccount();
export const connectQr = () => impl().connectQr();
export const logoutInstance = () => impl().logoutInstance();
export const diagnostics = () => impl().diagnostics();
export const getWebhook = () => impl().getWebhook();
export const restartInstance = () => impl().restartInstance();
export const ensureAlwaysOnline = () => impl().ensureAlwaysOnline();
export const setWebhook = (url: string) => impl().setWebhook(url);

/** URL do nosso webhook para a conexão em uso. */
export function ourWebhookUrl(): string {
  if (providerName() === 'evolution') {
    const token = Deno.env.get('EVOLUTION_WEBHOOK_TOKEN') || '';
    return `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-evolution-webhook?token=${encodeURIComponent(token)}`;
  }
  return dapi.dapiWebhookUrl();
}
