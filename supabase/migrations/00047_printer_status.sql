-- Migração 00047: Tabela de status e monitoramento em tempo real das impressoras
-- Permite que o painel detecte na hora se o PC da loja e as impressoras (Cozinha e Churrasqueira) estão ligados.

CREATE TABLE IF NOT EXISTS public.printer_status (
    id TEXT PRIMARY KEY DEFAULT 'default',
    worker_name TEXT NOT NULL DEFAULT 'bridge',
    mode TEXT NOT NULL DEFAULT 'live',
    last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now(),
    grill_online BOOLEAN NOT NULL DEFAULT false,
    grill_ip TEXT,
    grill_latency_ms INT,
    grill_error TEXT,
    kitchen_online BOOLEAN NOT NULL DEFAULT false,
    kitchen_ip TEXT,
    kitchen_latency_ms INT,
    kitchen_error TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilita RLS
ALTER TABLE public.printer_status ENABLE ROW LEVEL SECURITY;

-- Leitura liberada para autenticados e anon (para exibição em tempo real na interface web e mobile)
DROP POLICY IF EXISTS "printer_status_read" ON public.printer_status;
CREATE POLICY "printer_status_read" ON public.printer_status
    FOR SELECT TO authenticated, anon
    USING (true);

-- Escrita liberada para service_role e authenticated
DROP POLICY IF EXISTS "printer_status_write" ON public.printer_status;
CREATE POLICY "printer_status_write" ON public.printer_status
    FOR ALL TO service_role, authenticated
    USING (true)
    WITH CHECK (true);

-- Habilita Realtime na tabela
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'printer_status'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.printer_status;
    END IF;
END $$;

-- Atualiza enqueue_test_print para permitir perfil CAIXA
CREATE OR REPLACE FUNCTION enqueue_test_print(p_sector production_sector)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'CAIXA']::app_role[]);
BEGIN
    RETURN enqueue_print('TEST', gen_random_uuid(), 0, p_sector, 'SISTEMA', NULL, NULL,
                         jsonb_build_array(jsonb_build_object('name', 'Teste de impressão', 'quantity', 1)),
                         jsonb_build_object('requested_by', (SELECT name FROM profiles WHERE id = v_uid)),
                         'TEST-' || gen_random_uuid());
END;
$$;

REVOKE ALL ON FUNCTION enqueue_test_print(production_sector) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION enqueue_test_print(production_sector) TO authenticated;

-- Nova RPC: Dispara teste de impressão nas duas impressoras (Cozinha e Churrasqueira) ao mesmo tempo
CREATE OR REPLACE FUNCTION enqueue_test_print_all()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'CAIXA']::app_role[]);
    v_grill UUID;
    v_kitchen UUID;
    v_user_name TEXT;
BEGIN
    SELECT name INTO v_user_name FROM profiles WHERE id = v_uid;
    v_grill := enqueue_print('TEST', gen_random_uuid(), 0, 'GRILL', 'SISTEMA', NULL, NULL,
                             jsonb_build_array(jsonb_build_object('name', 'Teste de impressão Churrasqueira', 'quantity', 1)),
                             jsonb_build_object('requested_by', v_user_name),
                             'TEST-' || gen_random_uuid());
    v_kitchen := enqueue_print('TEST', gen_random_uuid(), 0, 'KITCHEN', 'SISTEMA', NULL, NULL,
                               jsonb_build_array(jsonb_build_object('name', 'Teste de impressão Cozinha', 'quantity', 1)),
                               jsonb_build_object('requested_by', v_user_name),
                               'TEST-' || gen_random_uuid());
    RETURN jsonb_build_object('grill_job_id', v_grill, 'kitchen_job_id', v_kitchen);
END;
$$;

REVOKE ALL ON FUNCTION enqueue_test_print_all() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION enqueue_test_print_all() TO authenticated;
