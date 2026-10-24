-- 00039: garçom libera mesa aberta por engano (comanda sem nenhum item nem pagamento).
-- Não apaga nada: a comanda vira CANCELLED com o motivo e fica na auditoria.

CREATE OR REPLACE FUNCTION release_empty_tab(p_tab_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'GARCOM', 'CAIXA']::app_role[]);
    v_tab tabs;
BEGIN
    SELECT * INTO v_tab FROM tabs WHERE id = p_tab_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Comanda não encontrada.';
    END IF;
    IF v_tab.status <> 'OPEN' THEN
        RAISE EXCEPTION 'Esta comanda já foi encerrada.';
    END IF;
    IF EXISTS (SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
                WHERE o.tab_id = p_tab_id AND oi.status <> 'CANCELLED') THEN
        RAISE EXCEPTION 'A mesa já tem pedido lançado. Peça ao gerente para anular a comanda.';
    END IF;
    IF EXISTS (SELECT 1 FROM payments WHERE tab_id = p_tab_id AND status = 'PAID') THEN
        RAISE EXCEPTION 'A mesa já tem pagamento registrado. Peça ao caixa para resolver.';
    END IF;

    UPDATE tabs
       SET status = 'CANCELLED', subtotal = 0, service_fee = 0, discount = 0, total = 0,
           closed_by = v_uid, closed_at = NOW(), updated_by = v_uid::TEXT,
           notes = COALESCE(notes || ' · ', '') || 'Mesa liberada: aberta por engano'
     WHERE id = p_tab_id
    RETURNING * INTO v_tab;

    UPDATE restaurant_tables SET status = 'LIVRE', updated_by = v_uid::TEXT WHERE id = v_tab.table_id;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (v_tab.shift_id, v_uid, 'LIBERAR_MESA_VAZIA', 'tabs', p_tab_id::TEXT,
            jsonb_build_object('table_id', v_tab.table_id, 'reason', 'Aberta por engano'));

    RETURN jsonb_build_object('tab_id', p_tab_id, 'table_id', v_tab.table_id);
END;
$$;
REVOKE ALL ON FUNCTION release_empty_tab(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION release_empty_tab(UUID) TO authenticated;
