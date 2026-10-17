-- ============================================================================
-- MIGRATION 00032: EXCLUIR CUPONS DA FILA DE IMPRESSÃO
-- ----------------------------------------------------------------------------
-- Gerência pode excluir cupons recentes (impressos, com falha ou aguardando).
-- Cupom aguardando que for excluído NÃO é mais impresso pelo printer-bridge.
-- Não mexe em pedido/venda: só na fila de cupons. Fica registrado na auditoria.
-- Idempotente.
-- ============================================================================

CREATE OR REPLACE FUNCTION delete_print_jobs(p_job_ids UUID[])
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_count INT;
BEGIN
    IF p_job_ids IS NULL OR array_length(p_job_ids, 1) IS NULL THEN
        RETURN 0;
    END IF;

    WITH removed AS (
        DELETE FROM print_queue WHERE id = ANY(p_job_ids)
        RETURNING id, order_number, sector, status
    )
    SELECT COUNT(*) INTO v_count FROM removed;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (NULL, v_uid, 'CUPONS_EXCLUIDOS', 'print_queue', array_to_string(p_job_ids[1:5], ','),
            jsonb_build_object('quantidade', v_count));

    RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION delete_print_jobs(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_print_jobs(UUID[]) TO authenticated;
