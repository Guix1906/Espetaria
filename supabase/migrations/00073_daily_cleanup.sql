-- 00073 (25/11/2026): limpeza diária de dados descartáveis (toda madrugada, 04:00 de Brasília = 07:00 UTC).
-- Nunca toca em vendas, comandas, pedidos, pagamentos, estoque, financeiro, turnos ou auditoria.
-- Também desliga o vigia do WhatsApp (job ponto-whatsapp-monitor, 00069), a pedido do dono.
SELECT cron.unschedule('ponto-whatsapp-monitor') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ponto-whatsapp-monitor');

CREATE OR REPLACE FUNCTION public.cleanup_disposable_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_print int; v_outbox int; v_health int;
BEGIN
  DELETE FROM print_queue WHERE status::text = 'PRINTED' AND created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_print = ROW_COUNT;
  DELETE FROM whatsapp_outbox WHERE status = 'SENT' AND created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_outbox = ROW_COUNT;
  DELETE FROM system_health_checks WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_health = ROW_COUNT;
  RETURN jsonb_build_object('print_queue', v_print, 'whatsapp_outbox', v_outbox, 'system_health_checks', v_health);
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_disposable_data() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('limpeza-diaria') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'limpeza-diaria');
SELECT cron.schedule('limpeza-diaria', '0 7 * * *', 'SELECT public.cleanup_disposable_data()');
