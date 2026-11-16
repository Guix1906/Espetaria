-- ============================================================================
-- MIGRATION 00071: RESILIÊNCIA DE IMPRESSÃO PÓS-QUEDA DE ENERGIA E REENVIO EM LOTE
-- 1. Cria a RPC retry_all_failed_print_jobs para reenviar todos os cupons que
--    falharam durante quedas de energia / reinício de rede sem precisar excluí-los.
-- 2. Atualiza complete_print_job para tolerar até 8 tentativas antes de falha
--    definitiva, dando tempo das impressoras térmicas e roteadores reiniciarem.
-- ============================================================================

-- 1. REENVIO EM LOTE DE CUPONS COM FALHA
CREATE OR REPLACE FUNCTION retry_all_failed_print_jobs()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'CAIXA', 'GARCOM', 'CHURRASQUEIRA', 'COZINHA', 'BAR']::app_role[]);
    v_count INT;
BEGIN
    WITH updated AS (
        UPDATE print_queue
           SET status = 'PENDING',
               next_attempt_at = NOW(),
               last_error = NULL,
               attempts = 0,
               updated_at = NOW()
         WHERE status = 'FAILED'
     RETURNING id
    )
    SELECT COUNT(*) INTO v_count FROM updated;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION retry_all_failed_print_jobs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION retry_all_failed_print_jobs() TO authenticated, service_role;

-- 2. AJUSTE DE MAX ATTEMPTS EM COMPLETE_PRINT_JOB
CREATE OR REPLACE FUNCTION complete_print_job(p_job_id UUID, p_success BOOLEAN, p_error TEXT DEFAULT NULL, p_printer TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_max_attempts CONSTANT INT := 8;
BEGIN
    IF p_success THEN
        UPDATE print_queue
           SET status = 'PRINTED',
               printed_at = NOW(),
               last_error = NULL,
               printer = p_printer,
               updated_at = NOW()
         WHERE id = p_job_id;
    ELSE
        UPDATE print_queue
           SET status = CASE WHEN attempts >= v_max_attempts THEN 'FAILED'::print_status ELSE 'PENDING'::print_status END,
               last_error = LEFT(p_error, 500),
               printer = p_printer,
               -- Backoff progressivo
               next_attempt_at = NOW() + LEAST(INTERVAL '60 seconds', INTERVAL '4 seconds' * power(1.5, GREATEST(attempts - 1, 0))),
               updated_at = NOW()
         WHERE id = p_job_id;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION complete_print_job(UUID, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_print_job(UUID, BOOLEAN, TEXT, TEXT) TO service_role;
