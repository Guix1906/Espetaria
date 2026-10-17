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
    p_display_order INT DEFAULT 0,
    p_id UUID DEFAULT NULL           -- ID gerado no aparelho (mantém o mesmo código no app e no banco)
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

    INSERT INTO products (id, name, price, category_id, sector, type, description, image_url,
                          tracks_stock, is_cubas, portions_per_cuba, allows_doneness, allows_notes, display_order)
    VALUES (COALESCE(p_id, gen_random_uuid()), TRIM(p_name), p_price, p_category_id, p_sector, p_type, p_description, p_image_url,
            p_tracks_stock, p_is_cubas, GREATEST(COALESCE(p_portions_per_cuba, 1), 1), p_allows_doneness, p_allows_notes, p_display_order)
    RETURNING * INTO v_result;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (NULL, v_uid, 'PRODUTO_CRIADO', 'products', v_result.id::TEXT,
            jsonb_build_object('name', v_result.name, 'price', v_result.price));

    RETURN to_jsonb(v_result);
END;
$$;
REVOKE ALL ON FUNCTION create_product(TEXT, NUMERIC, UUID, production_sector, product_type, TEXT, TEXT, BOOLEAN, BOOLEAN, INT, BOOLEAN, BOOLEAN, INT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_product(TEXT, NUMERIC, UUID, production_sector, product_type, TEXT, TEXT, BOOLEAN, BOOLEAN, INT, BOOLEAN, BOOLEAN, INT, UUID) TO authenticated;

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