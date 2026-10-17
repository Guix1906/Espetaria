-- ============================================================================
-- MIGRATION 00033: LIMITE DE ESTOQUE BAIXO + TEMPO DE ENTREGA/RETIRADA
-- 1. products.low_stock_threshold (limite de "estoque baixo" por produto; vazio = 5)
-- 2. update_product aceita low_stock_threshold (e permite limpar o valor)
-- 3. restaurant_settings.delivery_eta / pickup_eta (texto mostrado no cardápio digital)
-- 4. restaurant_settings_public expõe os dois tempos para o cardápio sem login
-- Tudo idempotente: pode rodar mais de uma vez.
-- ============================================================================

-- 1. Limite de estoque baixo
ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold INT;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_low_stock_threshold_check') THEN
        ALTER TABLE products ADD CONSTRAINT products_low_stock_threshold_check CHECK (low_stock_threshold IS NULL OR low_stock_threshold >= 0);
    END IF;
END $$;

-- 2. update_product com o campo novo (mesma assinatura da 00017)
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
                                   'allows_doneness','allows_notes','display_order','active','available',
                                   'low_stock_threshold'];
    v_key TEXT;
BEGIN
    IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'object' THEN
        RAISE EXCEPTION 'Atualizações devem ser um objeto JSON.';
    END IF;

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
           -- null limpa o limite (volta ao padrão de 5)
           low_stock_threshold = CASE WHEN p_updates ? 'low_stock_threshold'
                                      THEN (p_updates->>'low_stock_threshold')::INT
                                      ELSE low_stock_threshold END,
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

-- 3. Tempo de entrega e de retirada (texto livre, ex.: "40–55 min")
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS delivery_eta TEXT NOT NULL DEFAULT '40–55 min';
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS pickup_eta TEXT NOT NULL DEFAULT '30–40 min';

-- 4. View pública: mesmas colunas da 00018 + os dois tempos no fim
CREATE OR REPLACE VIEW restaurant_settings_public AS
SELECT id, name, address, phone, cnpj,
       service_fee_percent, allow_custom_service_fee,
       timezone, pix_key, pix_key_type, pix_merchant_name, pix_merchant_city,
       auto_print_orders, print_paper_width,
       whatsapp_auto_enabled, whatsapp_dispatch_url,
       print_templates, delivery_cutoff_time,
       created_at, updated_at,
       delivery_eta, pickup_eta
  FROM restaurant_settings;

REVOKE ALL ON restaurant_settings_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON restaurant_settings_public TO anon, authenticated;
