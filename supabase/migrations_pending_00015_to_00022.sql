-- ########################################################################
-- # FILE: 00015_finance_entries.sql
-- ########################################################################
-- ============================================================================
-- Financeiro: contas a pagar e a receber (lançamentos manuais da gerência).
-- As vendas (salão e delivery) NÃO entram aqui: o financeiro lê direto de
-- payments e delivery_orders, então nada precisa ser digitado duas vezes.
-- ============================================================================
CREATE TABLE IF NOT EXISTS finance_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL CHECK (kind IN ('PAGAR', 'RECEBER')),
    description TEXT NOT NULL CHECK (length(trim(description)) > 0),
    category TEXT NOT NULL DEFAULT 'Outros',
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    due_date DATE NOT NULL,
    paid_at TIMESTAMPTZ,                -- NULL = em aberto
    payment_method TEXT,
    supplier TEXT,                      -- fornecedor / cliente
    notes TEXT,
    created_by UUID DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_entries_due ON finance_entries(due_date);
CREATE INDEX IF NOT EXISTS idx_finance_entries_kind ON finance_entries(kind);

ALTER TABLE finance_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Master e Gerente gerenciam o financeiro" ON finance_entries;
CREATE POLICY "Master e Gerente gerenciam o financeiro"
    ON finance_entries FOR ALL
    TO authenticated
    USING (current_user_role() IN ('MASTER', 'GERENTE'))
    WITH CHECK (current_user_role() IN ('MASTER', 'GERENTE'));

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'finance_entries') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.finance_entries;
    END IF;
END $$;


-- ########################################################################
-- # FILE: 00016_void_tab.sql
-- ########################################################################
-- ============================================================================
-- Anular comanda (proprietário/gerente): para lançamentos de teste ou feitos
-- por engano. Cancela todos os itens (devolvendo ao estoque o que não foi
-- preparado e avisando a produção), estorna pagamentos, libera a mesa e deixa
-- registro na auditoria. Nada é apagado: os relatórios ignoram o que foi anulado.
-- ============================================================================
CREATE OR REPLACE FUNCTION void_tab_atomic(p_tab_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_tab tabs;
    v_item RECORD;
    v_items INT := 0;
    v_payments INT := 0;
BEGIN
    IF COALESCE(TRIM(p_reason), '') = '' THEN
        RAISE EXCEPTION 'Informe o motivo da anulação.';
    END IF;

    SELECT * INTO v_tab FROM tabs WHERE id = p_tab_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Comanda não encontrada.';
    END IF;
    IF v_tab.status <> 'OPEN' THEN
        RAISE EXCEPTION 'Só é possível anular comanda aberta.';
    END IF;

    -- Cancela item a item pela função oficial (estoque, totais e cupom de cancelamento)
    FOR v_item IN
        SELECT oi.id FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
         WHERE o.tab_id = p_tab_id AND oi.status <> 'CANCELLED'
    LOOP
        PERFORM cancel_order_item_atomic(v_item.id, 'Comanda anulada: ' || p_reason);
        v_items := v_items + 1;
    END LOOP;

    UPDATE payments SET status = 'CANCELLED', notes = COALESCE(notes || ' · ', '') || 'Estornado: comanda anulada'
     WHERE tab_id = p_tab_id AND status = 'PAID';
    GET DIAGNOSTICS v_payments = ROW_COUNT;

    UPDATE orders SET status = 'CANCELLED', updated_by = v_uid::TEXT WHERE tab_id = p_tab_id;

    UPDATE tabs
       SET status = 'CANCELLED', subtotal = 0, service_fee = 0, discount = 0, total = 0,
           closed_by = v_uid, closed_at = NOW(), updated_by = v_uid::TEXT,
           notes = COALESCE(notes || ' · ', '') || 'Anulada: ' || p_reason
     WHERE id = p_tab_id
    RETURNING * INTO v_tab;

    UPDATE restaurant_tables SET status = 'LIVRE', updated_by = v_uid::TEXT WHERE id = v_tab.table_id;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (v_tab.shift_id, v_uid, 'ANULAR_COMANDA', 'tabs', p_tab_id::TEXT,
            jsonb_build_object('reason', p_reason, 'items_cancelled', v_items, 'payments_reversed', v_payments));

    RETURN jsonb_build_object('tab_id', p_tab_id, 'items_cancelled', v_items, 'payments_reversed', v_payments);
END;
$$;

REVOKE ALL ON FUNCTION void_tab_atomic(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION void_tab_atomic(UUID, TEXT) TO authenticated;


-- ########################################################################
-- # FILE: 00017_audit_rpcs_and_triggers.sql
-- ########################################################################
-- ============================================================================
-- MIGRATION 00017: RPCs DE AUDITORIA + TRIGGERS AUSENTES + DROP FUNÇÕES INSEGURAS
--  1. Cria save_finance_entry, set_finance_paid, remove_finance_entry (com auditoria)
--  2. Cria create_product, update_product, deactivate_product (com auditoria)
--  3. Adiciona triggers updated_at em finance_entries, print_queue, shifts, whatsapp_outbox
--  4. Remove versões inseguras de funções da migração 00002 que aceitavam p_user_id
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TRIGGERS updated_at AUSENTES
-- ----------------------------------------------------------------------------

-- finance_entries
CREATE OR REPLACE TRIGGER trg_finance_entries_updated_at
    BEFORE UPDATE ON finance_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- print_queue
CREATE OR REPLACE TRIGGER trg_print_queue_updated_at
    BEFORE UPDATE ON print_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- shifts
CREATE OR REPLACE TRIGGER trg_shifts_updated_at
    BEFORE UPDATE ON shifts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- whatsapp_outbox (adiciona coluna primeiro)
ALTER TABLE whatsapp_outbox ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE OR REPLACE TRIGGER trg_whatsapp_outbox_updated_at
    BEFORE UPDATE ON whatsapp_outbox
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- categories (adiciona coluna primeiro)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE OR REPLACE TRIGGER trg_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- delivery_zones (adiciona coluna primeiro)
ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE OR REPLACE TRIGGER trg_delivery_zones_updated_at
    BEFORE UPDATE ON delivery_zones
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. RPCs DE FINANCEIRO COM AUDITORIA
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION save_finance_entry(
    p_kind TEXT,
    p_description TEXT,
    p_amount NUMERIC,
    p_due_date DATE,
    p_category TEXT DEFAULT 'Outros',
    p_supplier TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_result finance_entries;
    v_action TEXT;
BEGIN
    IF p_kind NOT IN ('PAGAR', 'RECEBER') THEN
        RAISE EXCEPTION 'Tipo inválido: use PAGAR ou RECEBER.';
    END IF;
    IF COALESCE(TRIM(p_description), '') = '' THEN
        RAISE EXCEPTION 'Descrição é obrigatória.';
    END IF;
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Valor deve ser maior que zero.';
    END IF;

    IF p_id IS NOT NULL THEN
        -- Atualização
        UPDATE finance_entries
           SET kind = p_kind,
               description = TRIM(p_description),
               amount = p_amount,
               due_date = p_due_date,
               category = COALESCE(NULLIF(TRIM(p_category), ''), 'Outros'),
               supplier = p_supplier,
               notes = p_notes,
               updated_at = NOW()
         WHERE id = p_id
        RETURNING * INTO v_result;
        IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado.'; END IF;
        v_action := 'FINANCE_EDITADO';
    ELSE
        -- Inserção
        INSERT INTO finance_entries (kind, description, amount, due_date, category, supplier, notes, created_by)
        VALUES (p_kind, TRIM(p_description), p_amount, p_due_date,
                COALESCE(NULLIF(TRIM(p_category), ''), 'Outros'), p_supplier, p_notes, v_uid)
        RETURNING * INTO v_result;
        v_action := 'FINANCE_CRIADO';
    END IF;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (NULL, v_uid, v_action, 'finance_entries', v_result.id::TEXT,
            jsonb_build_object('kind', v_result.kind, 'description', v_result.description,
                               'amount', v_result.amount, 'due_date', v_result.due_date));

    RETURN to_jsonb(v_result);
END;
$$;
REVOKE ALL ON FUNCTION save_finance_entry(TEXT, TEXT, NUMERIC, DATE, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION save_finance_entry(TEXT, TEXT, NUMERIC, DATE, TEXT, TEXT, TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION set_finance_paid(p_id UUID, p_paid BOOLEAN, p_method TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_result finance_entries;
BEGIN
    UPDATE finance_entries
       SET paid_at = CASE WHEN p_paid THEN NOW() END,
           payment_method = CASE WHEN p_paid THEN p_method END,
           updated_at = NOW()
     WHERE id = p_id
    RETURNING * INTO v_result;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado.'; END IF;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (NULL, v_uid, CASE WHEN p_paid THEN 'FINANCE_PAGO' ELSE 'FINANCE_ESTORNADO' END,
            'finance_entries', p_id::TEXT,
            jsonb_build_object('paid', p_paid, 'method', p_method, 'amount', v_result.amount));

    RETURN to_jsonb(v_result);
END;
$$;
REVOKE ALL ON FUNCTION set_finance_paid(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_finance_paid(UUID, BOOLEAN, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION remove_finance_entry(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_entry finance_entries;
BEGIN
    SELECT * INTO v_entry FROM finance_entries WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado.'; END IF;

    DELETE FROM finance_entries WHERE id = p_id;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (NULL, v_uid, 'FINANCE_REMOVIDO', 'finance_entries', p_id::TEXT,
            jsonb_build_object('kind', v_entry.kind, 'description', v_entry.description,
                               'amount', v_entry.amount));
END;
$$;
REVOKE ALL ON FUNCTION remove_finance_entry(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION remove_finance_entry(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. RPCs DE PRODUTOS COM AUDITORIA
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION create_product(
    p_name TEXT,
    p_price NUMERIC,
    p_category_id UUID,
    p_sector production_sector DEFAULT 'NONE',
    p_type product_type DEFAULT 'OUTROS',
    p_description TEXT DEFAULT NULL,
    p_image_url TEXT DEFAULT NULL,
    p_tracks_stock BOOLEAN DEFAULT false,
    p_is_cubas BOOLEAN DEFAULT false,
    p_portions_per_cuba INT DEFAULT NULL,
    p_allows_doneness BOOLEAN DEFAULT false,
    p_allows_notes BOOLEAN DEFAULT true,
    p_display_order INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_result products;
BEGIN
    IF COALESCE(TRIM(p_name), '') = '' THEN
        RAISE EXCEPTION 'Nome do produto é obrigatório.';
    END IF;
    IF p_price < 0 THEN
        RAISE EXCEPTION 'Preço não pode ser negativo.';
    END IF;

    INSERT INTO products (name, price, category_id, sector, type, description, image_url,
                          tracks_stock, is_cubas, portions_per_cuba, allows_doneness, allows_notes, display_order)
    VALUES (TRIM(p_name), p_price, p_category_id, p_sector, p_type, p_description, p_image_url,
            p_tracks_stock, p_is_cubas, p_portions_per_cuba, p_allows_doneness, p_allows_notes, p_display_order)
    RETURNING * INTO v_result;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (NULL, v_uid, 'PRODUTO_CRIADO', 'products', v_result.id::TEXT,
            jsonb_build_object('name', v_result.name, 'price', v_result.price));

    RETURN to_jsonb(v_result);
END;
$$;
REVOKE ALL ON FUNCTION create_product(TEXT, NUMERIC, UUID, production_sector, product_type, TEXT, TEXT, BOOLEAN, BOOLEAN, INT, BOOLEAN, BOOLEAN, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_product(TEXT, NUMERIC, UUID, production_sector, product_type, TEXT, TEXT, BOOLEAN, BOOLEAN, INT, BOOLEAN, BOOLEAN, INT) TO authenticated;

CREATE OR REPLACE FUNCTION update_product(p_id UUID, p_updates JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_result products;
    v_allowed_cols TEXT[] := ARRAY['name','price','category_id','sector','type','description',
                                   'image_url','tracks_stock','is_cubas','portions_per_cuba',
                                   'allows_doneness','allows_notes','display_order','active','available'];
    v_key TEXT;
    v_set_clauses TEXT[] := '{}';
    v_values JSONB := '{}'::JSONB;
BEGIN
    IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'object' THEN
        RAISE EXCEPTION 'Atualizações devem ser um objeto JSON.';
    END IF;

    -- Valida colunas permitidas
    FOR v_key IN SELECT jsonb_object_keys(p_updates) LOOP
        IF NOT (v_key = ANY(v_allowed_cols)) THEN
            RAISE EXCEPTION 'Coluna não permitida: %', v_key;
        END IF;
    END LOOP;

    UPDATE products
       SET name = COALESCE(p_updates->>'name', name),
           price = COALESCE((p_updates->>'price')::NUMERIC, price),
           category_id = COALESCE((p_updates->>'category_id')::UUID, category_id),
           sector = COALESCE((p_updates->>'sector')::production_sector, sector),
           type = COALESCE((p_updates->>'type')::product_type, type),
           description = COALESCE(p_updates->>'description', description),
           image_url = COALESCE(p_updates->>'image_url', image_url),
           tracks_stock = COALESCE((p_updates->>'tracks_stock')::BOOLEAN, tracks_stock),
           is_cubas = COALESCE((p_updates->>'is_cubas')::BOOLEAN, is_cubas),
           portions_per_cuba = COALESCE((p_updates->>'portions_per_cuba')::INT, portions_per_cuba),
           allows_doneness = COALESCE((p_updates->>'allows_doneness')::BOOLEAN, allows_doneness),
           allows_notes = COALESCE((p_updates->>'allows_notes')::BOOLEAN, allows_notes),
           display_order = COALESCE((p_updates->>'display_order')::INT, display_order),
           active = COALESCE((p_updates->>'active')::BOOLEAN, active),
           available = COALESCE((p_updates->>'available')::BOOLEAN, available),
           updated_at = NOW()
     WHERE id = p_id
    RETURNING * INTO v_result;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado.'; END IF;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (NULL, v_uid, 'PRODUTO_EDITADO', 'products', p_id::TEXT, p_updates);

    RETURN to_jsonb(v_result);
END;
$$;
REVOKE ALL ON FUNCTION update_product(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_product(UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION deactivate_product(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_result products;
BEGIN
    UPDATE products SET active = false, available = false, updated_at = NOW()
     WHERE id = p_id
    RETURNING * INTO v_result;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado.'; END IF;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (NULL, v_uid, 'PRODUTO_DESATIVADO', 'products', p_id::TEXT,
            jsonb_build_object('name', v_result.name));

    RETURN to_jsonb(v_result);
END;
$$;
REVOKE ALL ON FUNCTION deactivate_product(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION deactivate_product(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. DROP FUNÇÕES INSEGURAS DA MIGRAÇÃO 00002 (aceitavam p_user_id)
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS create_order_atomic(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS cancel_order_item_atomic(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS open_shift_with_stock(TEXT, NUMERIC, UUID);
DROP FUNCTION IF EXISTS toggle_product_exhaustion(UUID, BOOLEAN, UUID);
DROP FUNCTION IF EXISTS adjust_stock_physical_count(UUID, INT, TEXT, UUID);

select 'MIGRATION_00017_OK' as resultado;

-- ########################################################################
-- # FILE: 00018_print_retry_and_security.sql
-- ########################################################################
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
           updated_at = NOW()
     WHERE id = p_job_id AND status IN ('CLAIMED', 'FAILED');
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

-- ########################################################################
-- # FILE: 00019_schema_consistency_and_pii.sql
-- ########################################################################
-- ============================================================================
-- MIGRATION 00019: CONSISTÊNCIA DE SCHEMA (UUID/ENUMS) + PROTEÇÃO DE PII
-- 1. Altera colunas updated_by de TEXT para UUID com FK em profiles (idempotente)
-- 2. Cria ENUMs dedicados para delivery_orders (status e payment_method)
-- 3. Restringe publicação Realtime de tabelas com PII sensível
-- 4. Adiciona constraint UNIQUE em finance_entries para prevenir duplicidade
-- 5. Vincula finance_entries a shifts para conciliação por turno
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. UPDATED_BY: TEXT → UUID COM FK (idempotente — só altera se coluna for TEXT)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    -- tabs
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'tabs' AND column_name = 'updated_by'
               AND data_type = 'text') THEN
        UPDATE tabs SET updated_by = NULL WHERE updated_by !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
        ALTER TABLE tabs ALTER COLUMN updated_by TYPE UUID USING updated_by::UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tabs_updated_by') THEN
        ALTER TABLE tabs ADD CONSTRAINT fk_tabs_updated_by FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;

    -- orders
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'orders' AND column_name = 'updated_by'
               AND data_type = 'text') THEN
        UPDATE orders SET updated_by = NULL WHERE updated_by !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
        ALTER TABLE orders ALTER COLUMN updated_by TYPE UUID USING updated_by::UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_orders_updated_by') THEN
        ALTER TABLE orders ADD CONSTRAINT fk_orders_updated_by FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;

    -- order_items
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'order_items' AND column_name = 'updated_by'
               AND data_type = 'text') THEN
        UPDATE order_items SET updated_by = NULL WHERE updated_by !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
        ALTER TABLE order_items ALTER COLUMN updated_by TYPE UUID USING updated_by::UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_order_items_updated_by') THEN
        ALTER TABLE order_items ADD CONSTRAINT fk_order_items_updated_by FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;

    -- daily_prep_stock
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'daily_prep_stock' AND column_name = 'updated_by'
               AND data_type = 'text') THEN
        UPDATE daily_prep_stock SET updated_by = NULL WHERE updated_by !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
        ALTER TABLE daily_prep_stock ALTER COLUMN updated_by TYPE UUID USING updated_by::UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_daily_prep_stock_updated_by') THEN
        ALTER TABLE daily_prep_stock ADD CONSTRAINT fk_daily_prep_stock_updated_by FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;

    -- restaurant_tables
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'restaurant_tables' AND column_name = 'updated_by'
               AND data_type = 'text') THEN
        UPDATE restaurant_tables SET updated_by = NULL WHERE updated_by !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
        ALTER TABLE restaurant_tables ALTER COLUMN updated_by TYPE UUID USING updated_by::UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_restaurant_tables_updated_by') THEN
        ALTER TABLE restaurant_tables ADD CONSTRAINT fk_restaurant_tables_updated_by FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;

    -- shifts
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'shifts' AND column_name = 'updated_by'
               AND data_type = 'text') THEN
        UPDATE shifts SET updated_by = NULL WHERE updated_by !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
        ALTER TABLE shifts ALTER COLUMN updated_by TYPE UUID USING updated_by::UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_shifts_updated_by') THEN
        ALTER TABLE shifts ADD CONSTRAINT fk_shifts_updated_by FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. ENUMS DEDICADOS PARA DELIVERY (idempotente)
-- ----------------------------------------------------------------------------
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_order_status') THEN
        CREATE TYPE delivery_order_status AS ENUM (
            'PENDING', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_payment_method') THEN
        CREATE TYPE delivery_payment_method AS ENUM (
            'PIX', 'DINHEIRO', 'CARTAO_ENTREGA'
        );
    END IF;
END $$;

-- Migra dados existentes antes de alterar tipo (só se coluna ainda for TEXT)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'delivery_orders' AND column_name = 'status'
               AND data_type = 'text') THEN
        UPDATE delivery_orders SET status = 'PENDING'
        WHERE status NOT IN ('PENDING','CONFIRMED','PREPARING','OUT_FOR_DELIVERY','DELIVERED','CANCELLED');
        ALTER TABLE delivery_orders ALTER COLUMN status TYPE delivery_order_status USING status::delivery_order_status;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'delivery_orders' AND column_name = 'payment_method'
               AND data_type = 'text') THEN
        UPDATE delivery_orders SET payment_method = 'DINHEIRO'
        WHERE payment_method NOT IN ('PIX','DINHEIRO','CARTAO_ENTREGA');
        ALTER TABLE delivery_orders ALTER COLUMN payment_method TYPE delivery_payment_method USING payment_method::delivery_payment_method;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. RESTRIÇÃO DE PII NO REALTIME
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication_tables
               WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'whatsapp_outbox') THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE public.whatsapp_outbox;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_publication_tables
               WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'delivery_orders') THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE public.delivery_orders;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. PREVENÇÃO DE DUPLICIDADE EM FINANCE_ENTRIES
-- ----------------------------------------------------------------------------
ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS external_reference TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_entries_external_ref
    ON finance_entries (external_reference) WHERE external_reference IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 5. VÍNCULO FINANCE_ENTRIES ↔ SHIFTS
-- ----------------------------------------------------------------------------
ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_finance_entries_shift ON finance_entries(shift_id);

select 'MIGRATION_00019_OK' as resultado;

-- ########################################################################
-- # FILE: 00020_driver_pay_and_staff_cpf.sql
-- ########################################################################
-- ============================================================================
-- MIGRATION 00020: PAGAMENTO AUTOMÁTICO DE ENTREGADORES + CPF DE GARÇONS
-- 1. Adiciona coluna cpf em profiles (opcional, único)
-- 2. Cria tabela driver_payouts para registro diário por entregador
-- 3. Função close_delivery_shift calcula R$5/entrega + R$10 fixo combustível
-- 4. Trava de horário no delivery: cutoff_time em restaurant_settings
-- 5. Garçom não pode editar pedido após envio (RLS em order_items)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CPF EM PROFILES
-- ----------------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cpf TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_cpf ON profiles(cpf) WHERE cpf IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. TABELA DE PAGAMENTOS DE ENTREGADORES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    driver_name TEXT NOT NULL,
    deliveries_count INT NOT NULL DEFAULT 0,
    per_delivery_rate NUMERIC(10,2) NOT NULL DEFAULT 5.00,
    fuel_fixed NUMERIC(10,2) NOT NULL DEFAULT 10.00,
    total NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_driver_payouts_shift ON driver_payouts(shift_id);
CREATE INDEX IF NOT EXISTS idx_driver_payouts_driver ON driver_payouts(driver_name);

ALTER TABLE driver_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Master e Gerente veem pagamentos de entregadores" ON driver_payouts;
CREATE POLICY "Master e Gerente veem pagamentos de entregadores" ON driver_payouts FOR ALL TO authenticated
    USING (current_user_role() IN ('MASTER', 'GERENTE'))
    WITH CHECK (current_user_role() IN ('MASTER', 'GERENTE'));

-- ----------------------------------------------------------------------------
-- 3. FUNÇÃO DE FECHAMENTO DE TURNO DE DELIVERY
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION close_delivery_shift(p_shift_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_rate NUMERIC := 5.00;
    v_fuel NUMERIC := 10.00;
    v_drivers TEXT[];
    v_driver TEXT;
    v_count INT;
    v_total NUMERIC;
    v_results JSONB := '[]'::JSONB;
BEGIN
    -- Lista todos os entregadores que fizeram entregas neste turno
    SELECT ARRAY_AGG(DISTINCT driver_name) INTO v_drivers
    FROM delivery_orders
    WHERE shift_id = p_shift_id AND driver_name IS NOT NULL AND status = 'DELIVERED';

    IF v_drivers IS NULL THEN
        RETURN jsonb_build_object('message', 'Nenhuma entrega concluída neste turno.');
    END IF;

    FOREACH v_driver IN ARRAY v_drivers LOOP
        SELECT COUNT(*) INTO v_count
        FROM delivery_orders
        WHERE shift_id = p_shift_id AND driver_name = v_driver AND status = 'DELIVERED';

        v_total := (v_count * v_rate) + v_fuel;

        INSERT INTO driver_payouts (shift_id, driver_name, deliveries_count, per_delivery_rate, fuel_fixed, total)
        VALUES (p_shift_id, v_driver, v_count, v_rate, v_fuel, v_total);

        v_results := v_results || jsonb_build_object(
            'driver', v_driver,
            'deliveries', v_count,
            'total', v_total
        );
    END LOOP;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (p_shift_id, v_uid, 'DELIVERY_PAYOUT_CALCULATED', 'driver_payouts', p_shift_id::TEXT, v_results);

    RETURN v_results;
END;
$$;
REVOKE ALL ON FUNCTION close_delivery_shift(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION close_delivery_shift(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. TRAVA DE HORÁRIO NO DELIVERY
-- ----------------------------------------------------------------------------
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS delivery_cutoff_time TIME;
COMMENT ON COLUMN restaurant_settings.delivery_cutoff_time IS 'Horário limite para aceitar pedidos de delivery (ex: 23:00). NULL = sem trava.';

-- ----------------------------------------------------------------------------
-- 5. BLOQUEIO DE EDIÇÃO PELO GARÇOM APÓS ENVIO
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff can update order items" ON order_items;
CREATE POLICY "Staff can update order items" ON order_items FOR UPDATE TO authenticated
    USING (
        current_user_role() IN ('MASTER', 'GERENTE')
        OR (current_user_role() = 'GARCOM' AND status = 'RECEIVED')
    )
    WITH CHECK (
        current_user_role() IN ('MASTER', 'GERENTE')
        OR (current_user_role() = 'GARCOM' AND status = 'RECEIVED')
    );

select 'MIGRATION_00020_OK' as resultado;

-- ########################################################################
-- # FILE: 00021_table_management.sql
-- ########################################################################
-- ============================================================================
-- MIGRATION 00021: GERENCIAMENTO DE MESAS (ADICIONAR/REMOVER/EDITAR)
-- 1. Função create_restaurant_table para adicionar mesas dinamicamente
-- 2. Função update_restaurant_table para editar capacidade/número
-- 3. Função deactivate_restaurant_table para desativar (não apaga histórico)
-- 4. RLS: apenas MASTER e GERENTE podem gerenciar mesas
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CRIAR MESA
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_restaurant_table(
    p_number INT,
    p_capacity INT DEFAULT 4
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_id UUID;
BEGIN
    IF p_number < 1 OR p_number > 99 THEN
        RAISE EXCEPTION 'Número da mesa deve estar entre 1 e 99.';
    END IF;
    IF p_capacity < 1 OR p_capacity > 50 THEN
        RAISE EXCEPTION 'Capacidade deve estar entre 1 e 50.';
    END IF;
    IF EXISTS (SELECT 1 FROM restaurant_tables WHERE number = p_number AND active) THEN
        RAISE EXCEPTION 'Já existe uma mesa ativa com o número %.', p_number;
    END IF;

    INSERT INTO restaurant_tables (number, capacity, status, active, updated_by)
    VALUES (p_number, p_capacity, 'LIVRE', true, v_uid)
    RETURNING id INTO v_id;

    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_data)
    VALUES (v_uid, 'CRIAR_MESA', 'restaurant_tables', v_id::TEXT,
            jsonb_build_object('number', p_number, 'capacity', p_capacity));

    RETURN v_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. EDITAR MESA
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_restaurant_table(
    p_table_id UUID,
    p_number INT,
    p_capacity INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_old RECORD;
BEGIN
    SELECT * INTO v_old FROM restaurant_tables WHERE id = p_table_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mesa não encontrada.'; END IF;

    IF p_number < 1 OR p_number > 99 THEN
        RAISE EXCEPTION 'Número da mesa deve estar entre 1 e 99.';
    END IF;
    IF p_capacity < 1 OR p_capacity > 50 THEN
        RAISE EXCEPTION 'Capacidade deve estar entre 1 e 50.';
    END IF;
    IF EXISTS (SELECT 1 FROM restaurant_tables WHERE number = p_number AND id <> p_table_id AND active) THEN
        RAISE EXCEPTION 'Já existe outra mesa ativa com o número %.', p_number;
    END IF;
    IF v_old.status = 'OCUPADA' AND p_number <> v_old.number THEN
        RAISE EXCEPTION 'Não é possível alterar o número de uma mesa ocupada.';
    END IF;

    UPDATE restaurant_tables
       SET number = p_number,
           capacity = p_capacity,
           updated_by = v_uid,
           updated_at = NOW()
     WHERE id = p_table_id;

    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (v_uid, 'EDITAR_MESA', 'restaurant_tables', p_table_id::TEXT,
            jsonb_build_object('number', v_old.number, 'capacity', v_old.capacity),
            jsonb_build_object('number', p_number, 'capacity', p_capacity));
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. DESATIVAR MESA
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION deactivate_restaurant_table(p_table_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_table RECORD;
BEGIN
    SELECT * INTO v_table FROM restaurant_tables WHERE id = p_table_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mesa não encontrada.'; END IF;
    IF v_table.status = 'OCUPADA' THEN
        RAISE EXCEPTION 'Não é possível desativar uma mesa ocupada. Encerre a comanda primeiro.';
    END IF;

    UPDATE restaurant_tables
       SET active = false,
           updated_by = v_uid,
           updated_at = NOW()
     WHERE id = p_table_id;

    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_data)
    VALUES (v_uid, 'DESATIVAR_MESA', 'restaurant_tables', p_table_id::TEXT,
            jsonb_build_object('number', v_table.number));
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. PERMISSÕES
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION create_restaurant_table(INT, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION update_restaurant_table(UUID, INT, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION deactivate_restaurant_table(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_restaurant_table(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_restaurant_table(UUID, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION deactivate_restaurant_table(UUID) TO authenticated;

-- ########################################################################
-- # FILE: 00022_delivery_zones_crud.sql
-- ########################################################################
-- ============================================================================
-- MIGRATION 00022: CRUD DE BAIRROS / TAXAS DE ENTREGA
-- 1. Função upsert_delivery_zone para criar/editar bairro e taxa
-- 2. Função deactivate_delivery_zone para desativar (não apaga histórico)
-- 3. RLS: apenas MASTER e GERENTE podem gerenciar zonas
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CRIAR / EDITAR BAIRRO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION upsert_delivery_zone(
    p_name TEXT,
    p_fee NUMERIC(10,2),
    p_display_order INT DEFAULT NULL,
    p_active BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_id UUID;
    v_trimmed TEXT := TRIM(COALESCE(p_name, ''));
BEGIN
    IF length(v_trimmed) < 2 THEN
        RAISE EXCEPTION 'Nome do bairro deve ter pelo menos 2 caracteres.';
    END IF;
    IF p_fee IS NULL OR p_fee < 0 THEN
        RAISE EXCEPTION 'Taxa de entrega não pode ser negativa.';
    END IF;

    SELECT id INTO v_id FROM delivery_zones WHERE lower(name) = lower(v_trimmed);

    IF FOUND THEN
        UPDATE delivery_zones
           SET fee = p_fee,
               active = p_active,
               display_order = COALESCE(p_display_order, display_order),
               updated_at = NOW()
         WHERE id = v_id;
    ELSE
        INSERT INTO delivery_zones (name, fee, display_order, active)
        VALUES (v_trimmed, p_fee, COALESCE(p_display_order, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM delivery_zones)), p_active)
        RETURNING id INTO v_id;
    END IF;

    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_data)
    VALUES (v_uid, 'UPSERT_DELIVERY_ZONE', 'delivery_zones', v_id::TEXT,
            jsonb_build_object('name', v_trimmed, 'fee', p_fee, 'active', p_active));

    RETURN v_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. DESATIVAR BAIRRO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION deactivate_delivery_zone(p_zone_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
BEGIN
    UPDATE delivery_zones SET active = false, updated_at = NOW() WHERE id = p_zone_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Bairro não encontrado.'; END IF;

    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_data)
    VALUES (v_uid, 'DEACTIVATE_DELIVERY_ZONE', 'delivery_zones', p_zone_id::TEXT, NULL);
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. PERMISSÕES
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION upsert_delivery_zone(TEXT, NUMERIC, INT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION deactivate_delivery_zone(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION upsert_delivery_zone(TEXT, NUMERIC, INT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION deactivate_delivery_zone(UUID) TO authenticated;

