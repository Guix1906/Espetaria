import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { Switch } from '../../components/ui/Switch';
import { callRpc } from '../../lib/remote';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { type BotSettings, resolveBotSettings } from '../../lib/whatsappBot';
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

const PAUSE_LABEL: Record<string, string> = { HANDOFF: 'pediu atendente', HUMAN: 'equipe respondendo', LIMIT: 'mensagens demais' };
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Robô que responde as mensagens dos clientes no WhatsApp (Gemini). */
export function WhatsAppBotCard() {
  const { settings, updateSettings } = useSettingsStore();
  const role = useAuthStore((s) => s.currentProfile.role);
  const { notify } = useFeedback();
  const saved = useMemo(() => resolveBotSettings(settings.whatsapp_bot), [settings.whatsapp_bot]);
  const [draft, setDraft] = useState<BotSettings>(saved);
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  useEffect(() => { setDraft(saved); }, [saved]);

  const next: BotSettings = { ...draft, test_phones: [] };
  const dirty = JSON.stringify(next) !== JSON.stringify(saved);
  const on = saved.mode !== 'OFF';
  const canSeeConversations = isSupabaseConfigured && (role === 'MASTER' || role === 'GERENTE');

  const loadConversations = useCallback(async () => {
    if (!canSeeConversations) return;
    const { data, error } = await supabase.from('whatsapp_conversations').select('*').order('last_message_at', { ascending: false }).limit(10);
    setConversations(error ? [] : (data as Conversation[]));
  }, [canSeeConversations]);
  useEffect(() => { void loadConversations(); }, [loadConversations]);

  // Ligar/desligar salva na hora (o resto espera o botão Salvar)
  const setMode = (value: boolean) => {
    updateSettings({ whatsapp_bot: { ...saved, test_phones: [], mode: value ? 'ALL' : 'OFF' } });
    notify(value ? 'Robô ligado.' : 'Robô desligado.', 'success');
  };

  const save = () => {
    updateSettings({ whatsapp_bot: { ...next, mode: saved.mode } });
    notify('Robô salvo.', 'success');
  };

  const resume = async (phone: string) => {
    await callRpc('resume_whatsapp_bot', { p_phone: phone }, 'WhatsAppBot');
    await loadConversations();
    notify('O robô volta a responder esta conversa.', 'success');
  };

  return (
    <section className="surface-card overflow-hidden" aria-labelledby="wa-bot-title">
      <header className="flex items-center justify-between gap-4 border-b border-line p-4 sm:px-5">
        <div className="min-w-0">
          <h3 id="wa-bot-title" className="text-base font-semibold text-ink">Robô de atendimento</h3>
          <p className="text-sm text-ink-muted">Responde os clientes com o cardápio, os preços, o que está esgotado e a situação do pedido. O que ele não souber vai para um atendente.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-medium text-ink-secondary">{on ? 'Ligado' : 'Desligado'}</span>
          <Switch checked={on} onChange={setMode} label="Robô de atendimento" />
        </div>
      </header>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4 p-4 sm:p-5">
          <div>
            <label htmlFor="bot-info" className="mb-1.5 block text-sm font-medium text-ink-secondary">Informações da loja para o robô</label>
            <textarea
              id="bot-info"
              rows={5}
              value={draft.store_info}
              onChange={(e) => setDraft({ ...draft, store_info: e.target.value })}
              placeholder={'Ex.: Abrimos de terça a domingo, das 18h às 23h30.\nEntregas em 35 a 50 minutos.'}
              className="w-full rounded-sm border border-line-strong bg-surface p-3 text-sm leading-relaxed text-ink"
            />
            <p className="mt-1 text-[13px] text-ink-muted">Horário, formas de pagamento, tempo de entrega. O cardápio ele já sabe sozinho.</p>
          </div>

          <div className="space-y-3 rounded-sm bg-surface-soft p-3">
            <label className="flex items-center justify-between gap-3 text-sm text-ink">
              <span>Ficar quieto quando alguém da loja responder pelo celular</span>
              <Switch checked={draft.pause_on_human} onChange={(v) => setDraft({ ...draft, pause_on_human: v })} label="Ficar quieto quando a equipe responder" />
            </label>
            <label htmlFor="bot-pause" className="flex items-center justify-between gap-3 text-sm text-ink">
              <span>Tempo que ele fica quieto</span>
              <span className="flex items-center gap-2">
                <input id="bot-pause" type="number" min={1} max={48} value={draft.pause_hours} onChange={(e) => setDraft({ ...draft, pause_hours: Number(e.target.value) })} className="h-10 w-20 rounded-sm border border-line-strong bg-surface px-2 text-center font-mono text-sm" />
                <span className="text-ink-muted">horas</span>
              </span>
            </label>
          </div>

          <div className="flex justify-end">
            <button type="button" className="btn-primary min-h-[44px]" onClick={save} disabled={!dirty}>Salvar robô</button>
          </div>
        </div>

        {canSeeConversations && (
          <div className="border-t border-line p-4 sm:p-5 lg:border-l lg:border-t-0" aria-labelledby="bot-conversations">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 id="bot-conversations" className="text-sm font-semibold text-ink">Últimas conversas</h4>
              <button type="button" className="icon-button" onClick={() => void loadConversations()} aria-label="Atualizar conversas"><RefreshCw className="h-4 w-4" /></button>
            </div>
            {conversations === null ? <p className="text-sm text-ink-muted">Carregando...</p> : conversations.length === 0 ? (
              <p className="text-sm text-ink-muted">Nenhuma conversa ainda.</p>
            ) : (
              <ul className="divide-y divide-line">
                {conversations.map((c) => {
                  const paused = !!c.bot_paused_until && new Date(c.bot_paused_until).getTime() > Date.now();
                  return (
                    <li key={c.phone} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{c.customer_name || c.phone} <span className="font-normal text-ink-muted tabular-nums">· {timeOf(c.last_message_at)}</span></p>
                        <p className={`text-[13px] ${paused ? 'text-amber-800' : 'text-ink-muted'}`}>{paused ? `Com atendente (${PAUSE_LABEL[c.pause_reason ?? ''] ?? 'pausado'}) até ${timeOf(c.bot_paused_until!)}` : (c.last_message_preview || 'Robô respondendo')}</p>
                      </div>
                      {paused && <button type="button" className="btn-secondary min-h-[40px] shrink-0 text-sm" onClick={() => void resume(c.phone)}>Devolver ao robô</button>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
