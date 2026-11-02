-- ============================================================================
-- 00056: Reenvio automático dos avisos do delivery.
-- Aviso que falhou fica PENDING; a cada minuto, se houver algum, o banco acorda
-- o whatsapp-dispatch, sem depender da tela de Delivery aberta.
-- Idempotente: pode rodar mais de uma vez (cron.schedule substitui o mesmo nome).
-- ============================================================================

CREATE OR REPLACE FUNCTION retry_pending_whatsapp()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM whatsapp_outbox WHERE status = 'PENDING') THEN
        PERFORM wake_whatsapp_dispatch();
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION retry_pending_whatsapp() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('ponto-whatsapp-retry', '* * * * *', 'SELECT public.retry_pending_whatsapp()');

select 'MIGRATION_00056_OK' as resultado;
