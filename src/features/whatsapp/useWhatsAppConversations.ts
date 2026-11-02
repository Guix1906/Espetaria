import { useCallback, useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

export interface WhatsAppConversation {
  phone: string;
  customer_name: string | null;
  bot_paused_until: string | null;
  pause_reason: string | null;
  last_message_at: string;
  last_message_preview: string | null;
}

const SEEN_KEY = 'ponto_whatsapp_seen';
const SEEN_EVENT = 'ponto-whatsapp-seen';

function readSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
  } catch {
    return {};
  }
}

/** Marca a conversa como lida neste aparelho. */
export function markConversationSeen(phone: string, at: string) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ ...readSeen(), [phone]: at }));
  } catch {}
  window.dispatchEvent(new Event(SEEN_EVENT));
}

export function isUnread(conversation: Pick<WhatsAppConversation, 'phone' | 'last_message_at'>, seen: Record<string, string>) {
  const at = seen[conversation.phone];
  return !at || new Date(conversation.last_message_at).getTime() > new Date(at).getTime();
}

/** Lista de conversas, atualizada sozinha. A leitura segue a regra do banco: só Master e Gerente. */
export function useWhatsAppConversations(enabled: boolean, intervalMs = 15000) {
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [seen, setSeen] = useState(readSeen);
  const active = enabled && isSupabaseConfigured;

  const refresh = useCallback(async () => {
    if (!active) return;
    const { data, error } = await supabase.from('whatsapp_conversations').select('*').order('last_message_at', { ascending: false }).limit(100);
    if (!error && data) setConversations(data as WhatsAppConversation[]);
  }, [active]);

  useEffect(() => {
    void refresh();
    if (!active) return;
    const id = window.setInterval(() => void refresh(), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs, refresh]);

  useEffect(() => {
    const update = () => setSeen(readSeen());
    window.addEventListener(SEEN_EVENT, update);
    return () => window.removeEventListener(SEEN_EVENT, update);
  }, []);

  return { conversations, seen, refresh, unreadCount: conversations.filter((c) => isUnread(c, seen)).length };
}
