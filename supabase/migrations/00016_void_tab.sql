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
