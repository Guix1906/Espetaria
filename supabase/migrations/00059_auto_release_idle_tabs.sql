-- 00059 (05/11/2026): mesa aberta sem nenhum pedido volta a ficar livre sozinha.
-- Garçom abre a mesa e não lança nada: depois de 15 minutos a comanda vazia é liberada
-- (mesmo efeito do botão "Liberar mesa"; fica registrado na auditoria).
-- Nunca libera mesa com item lançado (mesmo cancelado conta como "sem pedido") ou com pagamento.
-- Roda a cada minuto pelo pg_cron. Idempotente.

CREATE OR REPLACE FUNCTION release_idle_empty_tabs(p_minutes INT DEFAULT 15)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_tab tabs;
    v_count INT := 0;
BEGIN
    FOR v_tab IN
        SELECT t.* FROM tabs t
         WHERE t.status = 'OPEN'
           AND t.opened_at < NOW() - make_interval(mins => p_minutes)
           AND NOT EXISTS (SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id = o.id
                            WHERE o.tab_id = t.id AND oi.status <> 'CANCELLED')
           AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.tab_id = t.id AND p.status = 'PAID')
         FOR UPDATE OF t SKIP LOCKED
    LOOP
        UPDATE tabs
           SET status = 'CANCELLED', subtotal = 0, service_fee = 0, discount = 0, total = 0,
               closed_at = NOW(), updated_by = 'sistema',
               notes = COALESCE(notes || ' · ', '') || 'Mesa liberada sozinha: ' || p_minutes || ' min sem pedido'
         WHERE id = v_tab.id;

        -- Só libera a mesa se ela não tiver outra comanda aberta
        UPDATE restaurant_tables SET status = 'LIVRE', updated_by = 'sistema'
         WHERE id = v_tab.table_id
           AND NOT EXISTS (SELECT 1 FROM tabs WHERE table_id = v_tab.table_id AND status = 'OPEN');

        INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
        VALUES (v_tab.shift_id, NULL, 'LIBERAR_MESA_VAZIA', 'tabs', v_tab.id::TEXT,
                jsonb_build_object('table_id', v_tab.table_id, 'reason', p_minutes || ' min sem pedido (automático)'));
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION release_idle_empty_tabs(INT) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    PERFORM cron.unschedule('ponto-liberar-mesas-vazias')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ponto-liberar-mesas-vazias');
    PERFORM cron.schedule('ponto-liberar-mesas-vazias', '* * * * *', 'SELECT public.release_idle_empty_tabs(15)');
END $$;
