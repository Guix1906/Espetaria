-- ============================================================================
-- MIGRATION 00018: RETRY DE IMPRESSÃO + SEGURANÇA WHATSAPP + RLS DELIVERY_ZONES
-- 1. Função requeue_print_job para retry com backoff no printer-bridge
-- 2. View restaurant_settings_public dinâmica (só colunas que existem)
-- 3. Remove política pública insegura da tabela restaurant_settings
-- 4. Adiciona políticas de escrita em delivery_zones para MASTER/GERENTE
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. REQUEUE PRINT JOB (usado pelo printer-bridge em retry com backoff)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION requeue_print_job(p_job_id UUID, p_error TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE print_queue
       SET status = 'PENDING',
           last_error = LEFT(COALESCE(p_error, ''), 500),
           attempts = COALESCE(attempts, 0) + 1,
           claimed_at = NULL,
           claimed_by = NULL,
           next_attempt_at = NOW(),
           updated_at = NOW()
     WHERE id = p_job_id AND status IN ('PRINTING', 'FAILED');  -- status reais de print_status
END;
$$;
REVOKE ALL ON FUNCTION requeue_print_job(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION requeue_print_job(UUID, TEXT) TO service_role;

-- ----------------------------------------------------------------------------
-- 2. VIEW SEGURA SEM TOKEN (dinâmica — só colunas que existem)
-- ----------------------------------------------------------------------------
-- Colunas reais de restaurant_settings após migrações 00001–00020:
--   id, name, cnpj, phone, service_fee_percent, allow_custom_service_fee,
--   timezone, created_at, updated_at,
--   address, pix_key, pix_key_type, pix_merchant_name, pix_merchant_city,
--   auto_print_orders, print_paper_width,
--   whatsapp_auto_enabled, whatsapp_dispatch_url, whatsapp_dispatch_token,
--   print_templates, delivery_cutoff_time
-- NÃO existem: logo_url, currency, tax_rate, service_charge_rate, default_printer_ip

-- A coluna é criada na 00020; garantir aqui para a view não falhar quando tudo roda junto
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS delivery_cutoff_time TIME;

DROP VIEW IF EXISTS restaurant_settings_public;
CREATE OR REPLACE VIEW restaurant_settings_public AS
SELECT id, name, address, phone, cnpj,
       service_fee_percent, allow_custom_service_fee,
       timezone, pix_key, pix_key_type, pix_merchant_name, pix_merchant_city,
       auto_print_orders, print_paper_width,
       whatsapp_auto_enabled, whatsapp_dispatch_url,
       print_templates, delivery_cutoff_time,
       created_at, updated_at
  FROM restaurant_settings;

REVOKE ALL ON restaurant_settings_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON restaurant_settings_public TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. REMOVER POLÍTICA PÚBLICA INSEGURA DA TABELA
-- ----------------------------------------------------------------------------
-- A política antiga "Public read for restaurant settings" com USING(true)
-- expunha whatsapp_dispatch_token para anon. Removida.
DROP POLICY IF EXISTS "Public read for restaurant settings" ON restaurant_settings;

-- Política restritiva: só staff autenticado vê a tabela completa (incluindo token)
DROP POLICY IF EXISTS "Staff read restaurant settings" ON restaurant_settings;
CREATE POLICY "Staff read restaurant settings" ON restaurant_settings FOR SELECT TO authenticated
    USING (current_user_role() IS NOT NULL);

-- ----------------------------------------------------------------------------
-- 4. RLS ESCRITA EM delivery_zones
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Master e Gerente gerenciam zonas de entrega" ON delivery_zones;
CREATE POLICY "Master e Gerente gerenciam zonas de entrega" ON delivery_zones FOR ALL TO authenticated
    USING (current_user_role() IN ('MASTER', 'GERENTE'))
    WITH CHECK (current_user_role() IN ('MASTER', 'GERENTE'));

select 'MIGRATION_00018_OK' as resultado;