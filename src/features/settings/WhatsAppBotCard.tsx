import { Bot, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { callRpc } from '../../lib/remote';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { type BotMode, type BotSettings, botWebhookBaseUrl, parseTestPhones, resolveBotSettings } from '../../lib/whatsappBot';
import { useAuthStore } from '../../stores/useAuthStore';
import { useSettingsStore } from '../../stores/useSettingsStore';

interface Conversation {
  phone: string;
  customer_name: string | null;
  bot_paused_until: string | null;
  pause_reason: string | null;
  last_message_at: string;
  last_message_preview: string | null;
}

const MODES: { id: BotMode; label: string; description: string }[] = [
  { id: 'OFF', label: 'Desligado', description: 'O robô não responde ninguém.' },
  { id: 'TEST', label: 'Só números de teste', description: 'Responde apenas os números da lista abaixo. Use enquanto o Anota AI atende os clientes.' },
  { id: 'ALL', label: 'Todos os clientes', description: 'Responde qualquer cliente. Desligue antes o robô do Anota AI para não responder em dobro.' },
];

const PAUSE_LABEL: Record<string, string> = { HANDOFF: 'pediu atendente', HUMAN: 'equipe respondendo', LIMIT: 'mensagens demais' };

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Robô que responde as mensagens dos clientes no WhatsApp (Gemini). */
export function WhatsAppBotCard() {
  const { settings, updateSettings } = useSettingsStore();
  const role = useAuthStore((s) => s.currentProfile.role);
  const { notify } = useFeedback();
  const saved = useMemo(() => resolveBotSettings(settings.whatsapp_bot), [settings.whatsapp_bot]);
  const [draft, setDraft] = useState<BotSettings>(saved);
  const [phonesText, setPhonesText] = useState(saved.test_phones.join('\n'));
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  useEffect(() => { setDraft(saved); setPhonesText(saved.test_phones.join('\n')); }, [saved]);

  const next: BotSettings = { ...draft, test_phones: parseTestPhones(phonesText) };
  const dirty = JSON.stringify(next) !== JSON.stringify(saved);
  const canSeeConversations = isSupabaseConfigured && (role === 'MASTER' || role === 'GERENTE');

  const loadConversations = useCallback(async () => {
    if (!canSeeConversations) return;
    const { data, error } = await supabase.from('whatsapp_conversations').select('*').order('last_message_at', { ascending: false }).limit(20);
    // Tabela ainda não criada (migração 00029 pendente): mostra a lista vazia
    setConversations(error ? [] : (data as Conversation[]));
  }, [canSeeConversations]);
  useEffect(() => { void loadConversations(); }, [loadConversations]);

  const save = () => {
    if (next.mode === 'TEST' && next.test_phones.length === 0) {
      notify('Coloque pelo menos um número de teste (com DDD) ou escolha outro modo.', 'error');
      return;
    }
    updateSettings({ whatsapp_bot: next });
    notify('Robô salvo.', 'success');
  };

  const resume = async (phone: string) => {
    await callRpc('resume_whatsapp_bot', { p_phone: phone }, 'WhatsAppBot');
    await loadConversations();
    notify('O robô volta a responder esta conversa.', 'success');
  };

  const inputClass = 'w-full rounded-sm border border-line bg-surface p-3 text-sm text-ink';

  return (
    <div className="surface-card p-4 sm:p-5 space-y-5">
      <div className="flex items-start gap-3">
        <span className="icon-tile"><Bot className="h-5 w-5" aria-hidden="true" /></span>
        <div>
          <h3 className="text-base font-bold text-ink">Robô de atendimento</h3>
          <p className="text-xs text-ink-muted">Responde as mensagens dos clientes com inteligência artificial (Gemini), usando o cardápio, os preços, o que está esgotado e a situação do pedido. Reclamações e dúvidas que ele não souber vão para um atendente.</p>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold text-ink">Quem o robô responde</legend>
        <div className="grid gap-2 md:grid-cols-3">
          {MODES.map((m) => (
            <label key={m.id} className={`flex cursor-pointer flex-col gap-1 rounded-sm border p-3 ${draft.mode === m.id ? 'border-brand-500 bg-brand-50' : 'border-line bg-surface'}`}>
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                <input type="radio" name="bot-mode" value={m.id} checked={draft.mode === m.id} onChange={() => setDraft({ ...draft, mode: m.id })} className="h-4 w-4" />
                {m.label}
              </span>
              <span className="text-xs text-ink-muted">{m.description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label htmlFor="bot-phones" className="mb-1 block text-sm font-semibold text-ink">Números de teste</label>
          <p className="mb-2 text-xs text-ink-muted">Um por linha, com DDD. Ex.: 11 98765-4321</p>
          <textarea id="bot-phones" rows={4} value={phonesText} onChange={(e) => setPhonesText(e.target.value)} className={`${inputClass} font-mono`} />
        </div>
        <div>
          <label htmlFor="bot-info" className="mb-1 block text-sm font-semibold text-ink">Informações que o robô pode usar</label>
          <p className="mb-2 text-xs text-ink-muted">Horário de funcionamento, formas de pagamento, tempo médio de entrega, se aceita encomendas... O robô só responde o que estiver aqui ou no sistema.</p>
          <textarea id="bot-info" rows={4} value={draft.store_info} onChange={(e) => setDraft({ ...draft, store_info: e.target.value })} placeholder={'Ex.: Abrimos de terça a domingo, das 18h às 23h.\nEntrega em 35 a 50 minutos.'} className={inputClass} />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="bot-pause" className="mb-1 block text-sm font-semibold text-ink">Pausa depois de chamar atendente</label>
          <div className="flex items-center gap-2"><input id="bot-pause" type="number" min={1} max={48} value={draft.pause_hours} onChange={(e) => setDraft({ ...draft, pause_hours: Number(e.target.value) })} className="w-20 rounded-sm border border-line bg-surface p-2 text-sm" /><span className="text-sm text-ink-muted">horas</span></div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-ink">
          <input type="checkbox" checked={draft.pause_on_human} onChange={(e) => setDraft({ ...draft, pause_on_human: e.target.checked })} className="h-4 w-4" />
          Ficar quieto quando alguém da loja responder pelo celular
        </label>
      </div>

      <button type="button" className="btn-primary text-xs" onClick={save} disabled={!dirty}>Salvar robô</button>

      {canSeeConversations && (
        <section className="space-y-2 border-t border-line pt-4" aria-labelledby="bot-conversations">
          <div className="flex items-center justify-between gap-2">
            <h4 id="bot-conversations" className="text-sm font-semibold text-ink">Conversas recentes</h4>
            <button type="button" className="icon-button" onClick={() => void loadConversations()} aria-label="Atualizar conversas"><RefreshCw className="h-4 w-4" /></button>
          </div>
          {conversations === null ? <p className="text-xs text-ink-muted">Carregando...</p> : conversations.length === 0 ? (
            <p className="text-xs text-ink-muted">Nenhuma conversa ainda.</p>
          ) : (
            <ul className="divide-y divide-line rounded-sm border border-line">
              {conversations.map((c) => {
                const paused = c.bot_paused_until && new Date(c.bot_paused_until).getTime() > Date.now();
                return (
                  <li key={c.phone} className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{c.customer_name || c.phone} <span className="font-normal text-ink-muted tabular-nums">· {timeOf(c.last_message_at)}</span></p>
                      {c.last_message_preview && <p className="truncate text-xs text-ink-muted">{c.last_message_preview}</p>}
                      <p className={`text-xs font-semibold ${paused ? 'text-amber-800' : 'text-emerald-700'}`}>{paused ? `Com atendente (${PAUSE_LABEL[c.pause_reason ?? ''] ?? 'pausado'}) até ${timeOf(c.bot_paused_until!)}` : 'Robô respondendo'}</p>
                    </div>
                    {paused && <button type="button" className="btn-secondary text-xs" onClick={() => void resume(c.phone)}>Devolver ao robô</button>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <details className="rounded-sm bg-surface-soft p-3 text-xs text-ink-secondary">
        <summary className="cursor-pointer font-semibold">Como ativar (uma vez só)</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Tenha em mãos a chave da API do Gemini (aistudio.google.com, em "Get API key").</li>
          <li>No computador, dê dois cliques em <code>supabase/ATIVAR-ROBO-WHATSAPP.bat</code>. Ele pede a chave, publica o robô e copia o endereço do webhook.</li>
          <li>No painel da Z-API, em Webhooks, cole o endereço em <strong>Ao receber</strong> e ligue <strong>Notificar as enviadas por mim também</strong>.</li>
        </ol>
        {botWebhookBaseUrl() && <p className="mt-2 break-all">Endereço da função: <code>{botWebhookBaseUrl()}?token=...</code></p>}
      </details>
    </div>
  );
}
