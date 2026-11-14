-- 00070 (14/11/2026): mesa aberta sem pedido só é liberada sozinha depois de 30 minutos (antes 5).
-- Com 5 minutos, a comanda sumia enquanto os clientes ainda escolhiam e o garçom recebia
-- "Comanda não encontrada" ao enviar o pedido (mesas 20, 27 e 37 no sábado 14/11).
-- Idempotente.

DO $$
BEGIN
    PERFORM cron.unschedule('ponto-liberar-mesas-vazias')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ponto-liberar-mesas-vazias');
    PERFORM cron.schedule('ponto-liberar-mesas-vazias', '* * * * *', 'SELECT public.release_idle_empty_tabs(30)');
END $$;
