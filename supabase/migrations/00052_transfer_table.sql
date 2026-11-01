-- 00052: Troca/transferência de mesa pelo garçom, gerente ou master.
-- Move a comanda e todos os pedidos vinculados para uma nova mesa livre, liberando a mesa anterior.

CREATE OR REPLACE FUNCTION transfer_table_atomic(p_tab_id UUID, p_target_table_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'GARCOM', 'CAIXA']::app_role[]);
    v_tab tabs;
    v_source_table restaurant_tables;
    v_target_table restaurant_tables;
BEGIN
    -- 1. Valida e bloqueia a comanda aberta
    SELECT * INTO v_tab FROM tabs WHERE id = p_tab_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Comanda não encontrada.';
    END IF;
    IF v_tab.status <> 'OPEN' THEN
        RAISE EXCEPTION 'Apenas comandas abertas podem ser transferidas de mesa.';
    END IF;

    -- 2. Valida mesa de origem
    SELECT * INTO v_source_table FROM restaurant_tables WHERE id = v_tab.table_id FOR UPDATE;

    -- 3. Valida mesa de destino
    SELECT * INTO v_target_table FROM restaurant_tables WHERE id = p_target_table_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Mesa de destino não encontrada.';
    END IF;

    IF v_tab.table_id = p_target_table_id THEN
        RAISE EXCEPTION 'A comanda já está na Mesa %.', v_target_table.number;
    END IF;

    -- Verifica se a mesa de destino já possui outra comanda aberta
    IF EXISTS (SELECT 1 FROM tabs WHERE table_id = p_target_table_id AND status = 'OPEN') THEN
        RAISE EXCEPTION 'A Mesa % já está ocupada por outra comanda.', v_target_table.number;
    END IF;

    -- 4. Atualiza a comanda com a nova mesa
    UPDATE tabs
       SET table_id = p_target_table_id,
           updated_by = v_uid::TEXT,
           updated_at = NOW(),
           version = COALESCE(version, 1) + 1
     WHERE id = p_tab_id;

    -- 5. Atualiza os pedidos vinculados para que a cozinha/churrasqueira vejam a nova mesa
    UPDATE orders
       SET table_id = p_target_table_id,
           updated_by = v_uid::TEXT,
           updated_at = NOW()
     WHERE tab_id = p_tab_id;

    -- 6. Atualiza o status das mesas
    UPDATE restaurant_tables
       SET status = 'LIVRE',
           updated_by = v_uid::TEXT,
           updated_at = NOW()
     WHERE id = v_tab.table_id;

    UPDATE restaurant_tables
       SET status = (CASE WHEN v_source_table.status = 'AGUARDANDO_CONTA' THEN 'AGUARDANDO_CONTA' ELSE 'OCUPADA' END)::table_status,
           updated_by = v_uid::TEXT,
           updated_at = NOW()
     WHERE id = p_target_table_id;

    -- 7. Registro na auditoria
    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (
        v_tab.shift_id,
        v_uid,
        'TRANSFERIR_MESA',
        'tabs',
        p_tab_id::TEXT,
        jsonb_build_object(
            'source_table_id', v_tab.table_id,
            'source_table_number', v_source_table.number,
            'target_table_id', p_target_table_id,
            'target_table_number', v_target_table.number,
            'customer_name', v_tab.customer_name
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'tab_id', p_tab_id,
        'source_table_number', v_source_table.number,
        'target_table_number', v_target_table.number
    );
END;
$$;

REVOKE ALL ON FUNCTION transfer_table_atomic(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transfer_table_atomic(UUID, UUID) TO authenticated;
