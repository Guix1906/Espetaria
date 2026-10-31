-- ============================================================================
-- Migration 00050: Bloquear cancelamento de itens por garçons e RPC de login rápido
-- 1. Garçons NÃO podem cancelar ou excluir itens já lançados na comanda.
--    Apenas MASTER, GERENTE ou CAIXA podem executar cancelamento.
-- 2. RPC get_shared_waiter_logins para entrada instantânea do garçom no celular
--    (executa direto no Postgres em 5ms, sem o atraso de cold start da Edge Function).
-- ============================================================================

-- 1. Atualiza cancel_order_item_atomic: remove GARCOM dos papéis autorizados
CREATE OR REPLACE FUNCTION cancel_order_item_atomic(
    p_order_item_id UUID,
    p_reason TEXT,
    p_return_stock BOOLEAN DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    -- Somente gerência ou caixa podem cancelar itens já lançados
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'CAIXA']::app_role[]);
    v_item RECORD;
    v_product RECORD;
    v_stock RECORD;
    v_tab_id UUID;
    v_return BOOLEAN;
    v_returned BOOLEAN := false;
BEGIN
    IF COALESCE(TRIM(p_reason), '') = '' THEN
        RAISE EXCEPTION 'Informe o motivo do cancelamento.';
    END IF;

    SELECT * INTO v_item FROM order_items WHERE id = p_order_item_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item do pedido não encontrado.';
    END IF;
    IF v_item.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'Item já se encontra cancelado.';
    END IF;
    IF v_item.status = 'DELIVERED' AND current_user_role() NOT IN ('MASTER', 'GERENTE') THEN
        RAISE EXCEPTION 'Somente gerência pode cancelar item já entregue.';
    END IF;

    SELECT tab_id INTO v_tab_id FROM orders WHERE id = v_item.order_id;
    IF NOT EXISTS (SELECT 1 FROM tabs WHERE id = v_tab_id AND status = 'OPEN') THEN
        RAISE EXCEPTION 'A comanda deste item já foi encerrada.';
    END IF;

    -- Pronto ou entregue nunca volta ao estoque; antes disso vale a escolha de quem cancela
    v_return := v_item.status IN ('RECEIVED', 'IN_PREPARATION')
                AND COALESCE(p_return_stock, v_item.status = 'RECEIVED');

    SELECT * INTO v_product FROM products WHERE id = v_item.product_id;

    IF v_product.tracks_stock THEN
        SELECT * INTO v_stock FROM daily_prep_stock
         WHERE shift_id = v_item.shift_id AND product_id = v_item.product_id
         FOR UPDATE;

        IF FOUND THEN
            IF v_return THEN
                v_returned := true;
                UPDATE daily_prep_stock
                   SET current_quantity = current_quantity + v_item.quantity,
                       consumed_quantity = GREATEST(0, consumed_quantity - v_item.quantity),
                       is_exhausted = false,
                       updated_by = v_uid::TEXT
                 WHERE id = v_stock.id;

                UPDATE products SET available = true WHERE id = v_product.id;

                INSERT INTO stock_movements (shift_id, product_id, quantity, movement_type,
                                             previous_balance, new_balance, order_item_id, reason, user_id)
                VALUES (v_item.shift_id, v_item.product_id, v_item.quantity, 'CANCELAMENTO_RETORNO',
                        v_stock.current_quantity, v_stock.current_quantity + v_item.quantity,
                        v_item.id, 'Cancelamento devolvido ao estoque: ' || p_reason, v_uid);
            ELSE
                UPDATE daily_prep_stock
                   SET discarded_quantity = discarded_quantity + v_item.quantity,
                       updated_by = v_uid::TEXT
                 WHERE id = v_stock.id;

                INSERT INTO stock_movements (shift_id, product_id, quantity, movement_type,
                                             previous_balance, new_balance, order_item_id, reason, user_id)
                VALUES (v_item.shift_id, v_item.product_id, -v_item.quantity, 'PERDA',
                        v_stock.current_quantity, v_stock.current_quantity,
                        v_item.id, 'Descarte/Perda após início do preparo: ' || p_reason, v_uid);
            END IF;
        END IF;
    END IF;

    UPDATE order_items SET status = 'CANCELLED', updated_by = v_uid::TEXT WHERE id = p_order_item_id;

    INSERT INTO order_item_status_history (order_item_id, from_status, to_status, changed_by, notes)
    VALUES (p_order_item_id, v_item.status, 'CANCELLED', v_uid, p_reason);

    PERFORM recompute_order_status(v_item.order_id);
    PERFORM recalc_tab_totals(v_tab_id);

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (
        v_item.shift_id,
        v_uid,
        'CANCELAR_ITEM',
        'order_items',
        p_order_item_id,
        jsonb_build_object('product_name', v_item.product_name, 'quantity', v_item.quantity,
                           'status', v_item.status, 'unit_price', v_item.unit_price),
        jsonb_build_object('status', 'CANCELLED', 'reason', p_reason, 'returned_to_stock', v_returned)
    );
END;
$$;

REVOKE ALL ON FUNCTION cancel_order_item_atomic(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancel_order_item_atomic(UUID, TEXT, BOOLEAN) TO authenticated;

-- 2. RPC get_shared_waiter_logins: busca ultrarrápida dos garçons para login no celular
CREATE OR REPLACE FUNCTION get_shared_waiter_logins(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT;
    v_base TEXT;
    v_local TEXT;
    v_domain TEXT;
    v_result JSONB;
BEGIN
    v_email := lower(trim(coalesce(p_email, '')));
    IF v_email = '' OR v_email NOT LIKE '%@%' THEN
        RETURN '[]'::jsonb;
    END IF;

    v_local := split_part(v_email, '@', 1);
    v_domain := split_part(v_email, '@', 2);
    v_local := split_part(v_local, '+', 1);
    v_base := v_local || '@' || v_domain;

    SELECT coalesce(jsonb_agg(jsonb_build_object('name', name, 'login', lower(email)) ORDER BY name), '[]'::jsonb)
      INTO v_result
      FROM profiles
     WHERE is_active = true
       AND role = 'GARCOM'
       AND (
           lower(email) = v_base
           OR lower(email) LIKE v_local || '+%@' || v_domain
       );

    RETURN coalesce(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION get_shared_waiter_logins(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_shared_waiter_logins(TEXT) TO anon, authenticated;
