import { useCallback, useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

export interface WhatsAppStatus {
  connected: boolean;
  state?: string;
  instance?: string | null;
  number?: string | null;
  profileName?: string | null;
  error?: string;
}

/** Fala com a Edge Function whatsapp-status: a chave da Evolution nunca chega ao navegador. */
export async function whatsAppAction<T>(action: 'status' | 'connect' | 'logout' | 'send', extra?: { phone: string; text: string }): Promise<T> {
  const { data, error } = await supabase.functions.invoke('whatsapp-status', { body: { action, ...extra } });
  if (error) throw new Error(error.message);
  if (data?.error && action !== 'status') throw new Error(data.error);
  return data as T;
}

/** Situação da conexão, atualizada sozinha. status null = ainda não sabemos (ou demonstração). */
export function useWhatsAppStatus(enabled: boolean, intervalMs = 60000) {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const active = enabled && isSupabaseConfigured;

  const refresh = useCallback(async () => {
    if (!active) return;
    try {
      setStatus(await whatsAppAction<WhatsAppStatus>('status'));
    } catch (err) {
      setStatus({ connected: false, state: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }, [active]);

  useEffect(() => {
    void refresh();
    if (!active) return;
    const id = window.setInterval(() => void refresh(), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs, refresh]);

  return { status, refresh };
}
