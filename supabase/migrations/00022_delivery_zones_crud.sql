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