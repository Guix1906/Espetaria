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