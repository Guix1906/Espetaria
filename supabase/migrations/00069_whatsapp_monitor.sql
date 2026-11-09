-- 00069 (09/11): monitor do robô do WhatsApp (Evolution).
-- A cada 2 minutos o pg_cron chama a Edge Function whatsapp-monitor, que grava uma "foto"
-- (estado da conexão, última mensagem de cliente que a Evolution recebeu, contagem de mensagens,
-- e o mesmo da outra instância do servidor para comparar). Serve para achar quando o robô fica
-- "conectado mas surdo". Só a service_role lê/grava (RLS sem políticas).

CREATE TABLE IF NOT EXISTS public.whatsapp_monitor (
    id BIGSERIAL PRIMARY KEY,
    at TIMESTAMPTZ NOT NULL DEFAULT now(),
    evolution_ok BOOLEAN,
    evolution_ms INT,
    ponto_state TEXT,
    ponto_updated_at TIMESTAMPTZ,
    ponto_disc_code INT,
    ponto_disc_at TIMESTAMPTZ,
    ponto_msg_count INT,
    ponto_last_in TIMESTAMPTZ,
    other_state TEXT,
    other_msg_count INT,
    other_last_in TIMESTAMPTZ,
    webhook_last_msg TIMESTAMPTZ,
    error TEXT
);
CREATE INDEX IF NOT EXISTS whatsapp_monitor_at_idx ON public.whatsapp_monitor (at DESC);
ALTER TABLE public.whatsapp_monitor ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.whatsapp_monitor_config (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    token TEXT NOT NULL
);
ALTER TABLE public.whatsapp_monitor_config ENABLE ROW LEVEL SECURITY;
INSERT INTO public.whatsapp_monitor_config (id, token)
VALUES (1, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.whatsapp_monitor_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    PERFORM net.http_post(
        url := 'https://byamgmjeqawznkagouwd.supabase.co/functions/v1/whatsapp-monitor',
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'x-monitor-token', (SELECT token FROM public.whatsapp_monitor_config WHERE id = 1)),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000);
END;
$$;
REVOKE ALL ON FUNCTION public.whatsapp_monitor_tick() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    PERFORM cron.unschedule('ponto-whatsapp-monitor')
     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ponto-whatsapp-monitor');
    PERFORM cron.schedule('ponto-whatsapp-monitor', '*/2 * * * *', 'SELECT public.whatsapp_monitor_tick()');
END $$;
