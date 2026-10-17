-- ============================================================================
-- MIGRATION 00024: corrigir e estornar vendas pelo fluxo de caixa (gerência)
--  - adjust_sale: corrige a forma de pagamento de uma venda já registrada
--  - void_sale:   estorna a venda (salão: pagamento cancelado, mesmo com a
--                 comanda fechada; delivery: volta a "a receber")
-- Nada é apagado: tudo fica em audit_logs com o motivo.
-- ============================================================================

CREATE OR REPLACE FUNCTION adjust_sale(p_channel TEXT, p_id UUID, p_method TEXT, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_payment payments;
    v_order delivery_orders;
BEGIN
    IF COALESCE(TRIM(p_reason), '') = '' THEN RAISE EXCEPTION 'Informe o motivo da correção.'; END IF;

    IF p_channel = 'SALAO' THEN
        IF p_method NOT IN ('DINHEIRO', 'PIX', 'DEBITO', 'CREDITO', 'OUTROS') THEN
            RAISE EXCEPTION 'Forma de pagamento inválida para o salão.';
        END IF;
        SELECT * INTO v_payment FROM payments WHERE id = p_id FOR UPDATE;
        IF NOT FOUND OR v_payment.status <> 'PAID' THEN RAISE EXCEPTION 'Pagamento não encontrado ou já estornado.'; END IF;
        UPDATE payments SET method = p_method::payment_method WHERE id = p_id;
        INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, old_data, new_data)
        VALUES (v_payment.shift_id, v_uid, 'CORRIGIR_VENDA', 'payments', p_id::TEXT,
                jsonb_build_object('method', v_payment.method, 'amount', v_payment.amount),
                jsonb_build_object('method', p_method, 'reason', p_reason));
    ELSIF p_channel = 'DELIVERY' THEN
        IF p_method NOT IN ('PIX', 'DINHEIRO', 'CARTAO_ENTREGA') THEN
            RAISE EXCEPTION 'Forma de pagamento inválida para o delivery.';
        END IF;
        SELECT * INTO v_order FROM delivery_orders WHERE id = p_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Pedido de delivery não encontrado.'; END IF;
        UPDATE delivery_orders SET payment_method = p_method, updated_by = v_uid::TEXT WHERE id = p_id;
        INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, old_data, new_data)
        VALUES (v_order.shift_id, v_uid, 'CORRIGIR_VENDA', 'delivery_orders', p_id::TEXT,
                jsonb_build_object('method', v_order.payment_method, 'total', v_order.total),
                jsonb_build_object('method', p_method, 'reason', p_reason));
    ELSE
        RAISE EXCEPTION 'Canal inválido.';
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION adjust_sale(TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION adjust_sale(TEXT, UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION void_sale(p_channel TEXT, p_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_payment payments;
    v_order delivery_orders;
BEGIN
    IF COALESCE(TRIM(p_reason), '') = '' THEN RAISE EXCEPTION 'Informe o motivo do estorno.'; END IF;

    IF p_channel = 'SALAO' THEN
        SELECT * INTO v_payment FROM payments WHERE id = p_id FOR UPDATE;
        IF NOT FOUND OR v_payment.status <> 'PAID' THEN RAISE EXCEPTION 'Pagamento não encontrado ou já estornado.'; END IF;
        UPDATE payments
           SET status = 'CANCELLED', notes = COALESCE(notes || ' · ', '') || 'Estornado: ' || p_reason
         WHERE id = p_id;
        INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, old_data, new_data)
        VALUES (v_payment.shift_id, v_uid, 'ESTORNAR_VENDA', 'payments', p_id::TEXT,
                jsonb_build_object('amount', v_payment.amount, 'method', v_payment.method, 'tab_id', v_payment.tab_id),
                jsonb_build_object('reason', p_reason));
    ELSIF p_channel = 'DELIVERY' THEN
        SELECT * INTO v_order FROM delivery_orders WHERE id = p_id FOR UPDATE;
        IF NOT FOUND OR v_order.paid_at IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado ou ainda não pago.'; END IF;
        UPDATE delivery_orders SET paid_at = NULL, paid_by = NULL, updated_by = v_uid::TEXT WHERE id = p_id;
        INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, old_data, new_data)
        VALUES (v_order.shift_id, v_uid, 'ESTORNAR_VENDA', 'delivery_orders', p_id::TEXT,
                jsonb_build_object('total', v_order.total, 'method', v_order.payment_method),
                jsonb_build_object('reason', p_reason));
    ELSE
        RAISE EXCEPTION 'Canal inválido.';
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION void_sale(TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION void_sale(TEXT, UUID, TEXT) TO authenticated;

select 'MIGRATION_00024_OK' as resultado;
