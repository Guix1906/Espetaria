import { ArrowLeft, Plus, Settings2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ActiveTab } from '../../components/layout/navigation';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { publicAppUrl } from '../../lib/publicUrl';
import { callRpc } from '../../lib/remote';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { isUnread, markConversationSeen, useWhatsAppConversations, type WhatsAppConversation } from './useWhatsAppConversations';
import { useWhatsAppStatus, whatsAppAction } from './useWhatsAppStatus';
import { WhatsAppConnectView } from './WhatsAppConnectView';

interface Message { id: string; direction: 'IN' | 'BOT' | 'HUMAN'; body: string; created_at: string }

const CHAT_REFRESH_MS = 4000;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const titleOf = (c: WhatsAppConversation) => c.customer_name?.trim() || c.phone;

/** Conversas reais do WhatsApp da loja. Sem celular conectado, mostra o QR Code. */
export function WhatsAppView({ onNavigateTab }: { onNavigateTab: (tab: ActiveTab) => void }) {
  const { status } = useWhatsAppStatus(true, 30000);
  const { conversations, seen, refresh } = useWhatsAppConversations(true);
  const [wantsConnection, setWantsConnection] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  if (wantsConnection || (status && !status.connected)) {
    return (
      <div>
        {wantsConnection && <div className="px-4 pt-4 sm:px-6 xl:px-8"><button type="button" className="btn-secondary min-h-[44px]" onClick={() => setWantsConnection(false)}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Voltar às conversas</button></div>}
        <WhatsAppConnectView />
      </div>
    );
  }

  const term = search.trim().toLowerCase();
  const visible = conversations.filter((c) => !term || `${titleOf(c)} ${c.phone}`.toLowerCase().includes(term));
  const active = conversations.find((c) => c.phone === phone) ?? null;

  return (
    <div className="flex h-[calc(100dvh-var(--app-header-height)-1px)] min-h-[420px]">
      <div className={`w-full shrink-0 flex-col border-r border-line bg-surface md:flex md:w-80 ${active ? 'hidden' : 'flex'}`}>
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl font-semibold text-ink">Conversas</h1>
            <button type="button" className="icon-button h-11 w-11" aria-label="Conexão do celular" title="Conexão do celular" onClick={() => setWantsConnection(true)}><Settings2 className="h-4 w-4" aria-hidden="true" /></button>
          </div>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar conversa" aria-label="Buscar conversa" className="min-h-[44px] w-full rounded-md border px-3 text-[15px]" />
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {visible.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-muted">{isSupabaseConfigured ? 'Nenhuma conversa ainda. As mensagens novas dos clientes aparecem aqui.' : 'Na demonstração não há conversas.'}</li>}
          {visible.map((c) => {
            const unread = isUnread(c, seen) && c.phone !== phone;
            return (
              <li key={c.phone}>
                <button type="button" onClick={() => setPhone(c.phone)} aria-current={c.phone === phone ? 'true' : undefined} className={`flex w-full items-center gap-3 border-l-[3px] px-4 py-3 text-left ${c.phone === phone ? 'border-brand-700 bg-surface-muted' : 'border-transparent hover:bg-surface-soft'}`}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-800" aria-hidden="true">{titleOf(c)[0]?.toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2"><span className="truncate font-semibold text-ink">{titleOf(c)}</span><span className="shrink-0 text-xs text-ink-muted">{timeOf(c.last_message_at)}</span></span>
                    <span className="block truncate text-[13px] text-ink-muted">{c.last_message_preview || 'Sem mensagens'}</span>
                  </span>
                  {unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-600" role="img" aria-label="Não lida" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className={`min-w-0 flex-1 flex-col md:flex ${active ? 'flex' : 'hidden'}`}>
        {active ? <Chat key={active.phone} conversation={active} onBack={() => setPhone(null)} onChanged={refresh} onCreateOrder={() => onNavigateTab('delivery')} /> : <p className="m-auto p-6 text-sm text-ink-muted">Escolha uma conversa.</p>}
      </div>
    </div>
  );
}

function Chat({ conversation, onBack, onChanged, onCreateOrder }: { conversation: WhatsAppConversation; onBack: () => void; onChanged: () => Promise<void>; onCreateOrder: () => void }) {
  const { notify } = useFeedback();
  const settings = useSettingsStore((s) => s.settings);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const { phone, last_message_at: lastAt } = conversation;
  const botPaused = !!conversation.bot_paused_until && new Date(conversation.bot_paused_until).getTime() > Date.now();

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data, error } = await supabase.from('whatsapp_bot_messages').select('id, direction, body, created_at').eq('phone', phone).order('created_at', { ascending: false }).limit(100);
      if (alive && !error && data) setMessages((data as Message[]).reverse());
    };
    void load();
    const id = window.setInterval(() => void load(), CHAT_REFRESH_MS);
    return () => { alive = false; window.clearInterval(id); };
  }, [phone, lastAt]);

  useEffect(() => { markConversationSeen(phone, lastAt); }, [phone, lastAt]);
  const lastId = messages[messages.length - 1]?.id;
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }); }, [lastId]);

  const send = async (text: string) => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await whatsAppAction('send', { phone, text: body });
      setDraft('');
      await onChanged();
    } catch (err) {
      // O texto continua na caixa para tentar de novo
      setDraft(body);
      notify(`Mensagem não enviada. ${err instanceof Error ? err.message : ''}`, 'error');
    } finally {
      setSending(false);
    }
  };

  const resumeBot = async () => {
    await callRpc('resume_whatsapp_bot', { p_phone: phone }, 'WhatsAppBot');
    await onChanged();
    notify('O robô volta a responder esta conversa.', 'success');
  };

  const quickReplies = [
    { label: 'Enviar cardápio', text: `Nosso cardápio: ${publicAppUrl()}/cardapio` },
    { label: 'Pedido saiu para entrega', text: 'Seu pedido saiu para entrega!' },
    ...(settings.delivery_eta?.trim() ? [{ label: `Tempo médio: ${settings.delivery_eta.trim()}`, text: `Nosso tempo médio de entrega agora é ${settings.delivery_eta.trim()}.` }] : []),
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-3">
        <button type="button" className="icon-button h-11 w-11 md:hidden" aria-label="Voltar às conversas" onClick={onBack}><ArrowLeft className="h-4 w-4" aria-hidden="true" /></button>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-800" aria-hidden="true">{titleOf(conversation)[0]?.toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{titleOf(conversation)}</p>
          <p className="truncate font-mono text-[13px] text-ink-muted">{conversation.phone}</p>
        </div>
        {botPaused && <button type="button" className="btn-secondary min-h-[44px]" onClick={resumeBot}>Devolver ao robô</button>}
        <button type="button" className="btn-primary min-h-[44px]" onClick={onCreateOrder}><Plus className="h-4 w-4" aria-hidden="true" />Criar pedido</button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4 sm:p-6" aria-live="polite">
        {messages.map((m) => {
          const mine = m.direction !== 'IN';
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] whitespace-pre-wrap break-words rounded-lg border border-line px-3 py-2 text-[15px] text-ink lg:max-w-[60%] ${mine ? 'bg-brand-100' : 'bg-surface'}`}>
                {m.body}
                <p className="mt-0.5 text-right text-xs text-ink-muted">{m.direction === 'BOT' ? 'Robô · ' : ''}{timeOf(m.created_at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="flex flex-wrap gap-2 px-4 pt-2">
        {quickReplies.map((q) => <button key={q.label} type="button" disabled={sending} onClick={() => void send(q.text)} className="min-h-[44px] rounded-md border border-line bg-surface px-3 text-[13px] font-medium text-ink hover:border-brand-700">{q.label}</button>)}
      </div>
      <form className="flex gap-2 p-4" onSubmit={(e) => { e.preventDefault(); void send(draft); }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Digite uma mensagem" aria-label="Mensagem" className="min-h-[44px] min-w-0 flex-1 rounded-md border px-3 text-[15px]" />
        <button type="submit" className="btn-primary min-h-[44px]" disabled={sending || !draft.trim()}>{sending ? 'Enviando...' : 'Enviar'}</button>
      </form>
    </>
  );
}
