-- Migração 00046: Quitação atômica de comanda em 1 chamada
-- Evita race condition de rede entre add_payment_atomic e close_tab_atomic.
CREATE OR REPLACE FUNCTION close_tab_with_payment(
    p_payment_id UUID,
    p_tab_id UUID,
    p_amount NUMERIC(10, 2),
    p_method payment_method,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'CAIXA', 'GARCOM']::app_role[]);
    v_tab tabs;
    v_payment payments;
    v_paid NUMERIC(10, 2);
    v_now TIMESTAMPTZ := now();
BEGIN
    SELECT * INTO v_tab FROM tabs WHERE id = p_tab_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Comanda não encontrada.';
    END IF;
    IF v_tab.status <> 'OPEN' THEN
        RAISE EXCEPTION 'Esta comanda já foi encerrada anteriormente.';
    END IF;

    -- 1. Insere o pagamento se p_amount > 0
    IF p_amount IS NOT NULL AND p_amount > 0 THEN
        INSERT INTO payments (
            id, shift_id, tab_id, amount, method, status, notes, received_by, paid_at
        ) VALUES (
            p_payment_id, v_tab.shift_id, p_tab_id, p_amount, p_method, 'PAID', p_notes, v_uid, v_now
        ) RETURNING * INTO v_payment;
    END IF;

    -- 2. Confere se o total pago cobre o total devido
    SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM payments WHERE tab_id = p_tab_id AND status = 'PAID';
    IF v_paid < v_tab.total THEN
        RAISE EXCEPTION 'Pagamento insuficiente. Total devido: R$ %, Total pago: R$ %.', v_tab.total, v_paid;
    END IF;

    -- 3. Encerra a comanda
    UPDATE tabs
       SET status = 'CLOSED',
           closed_by = v_uid,
           closed_at = v_now,
           updated_at = v_now,
           updated_by = v_uid::text,
           version = COALESCE(version, 0) + 1
     WHERE id = p_tab_id;

    -- 4. Libera a mesa
    UPDATE restaurant_tables
       SET status = 'LIVRE',
           updated_at = v_now,
           version = COALESCE(version, 0) + 1
     WHERE id = v_tab.table_id;

    -- 5. Encerra os pedidos abertos da comanda
    UPDATE orders
       SET status = 'CLOSED',
           updated_at = v_now,
           updated_by = v_uid::text,
           version = COALESCE(version, 0) + 1
     WHERE tab_id = p_tab_id AND status <> 'CANCELLED';

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (v_tab.shift_id, v_uid, 'ENCERRAMENTO_COMANDA', 'tabs', p_tab_id::TEXT,
            jsonb_build_object('total', v_tab.total, 'paid', v_paid, 'method', p_method));

    RETURN jsonb_build_object('success', true, 'tab_id', p_tab_id, 'total', v_tab.total, 'paid', v_paid);
END;
$$;

REVOKE ALL ON FUNCTION close_tab_with_payment(UUID, UUID, NUMERIC, payment_method, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION close_tab_with_payment(UUID, UUID, NUMERIC, payment_method, TEXT) TO authenticated;
