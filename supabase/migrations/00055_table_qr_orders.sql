-- ============================================================================
-- 00055: Pedido pelo QR Code da mesa (cliente pede do celular, sem login).
--  * restaurant_tables.qr_token: código secreto de cada mesa (dá para trocar)
--  * orders.source: 'STAFF' (equipe) ou 'QR' (cliente)
--  * get_table_qr_info / create_table_qr_order: públicas, validam tudo no servidor
--  * rotate_table_qr_token: Master/Gerente invalidam um QR impresso
-- O pedido vira um pedido normal da comanda: produção, estoque, impressão e caixa.
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================================

ALTER TABLE restaurant_tables ADD COLUMN IF NOT EXISTS qr_token UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurant_tables_qr_token ON restaurant_tables(qr_token);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'STAFF';
CREATE INDEX IF NOT EXISTS idx_orders_table_source_created ON orders(table_id, source, created_at DESC);

CREATE OR REPLACE FUNCTION get_table_qr_info(p_token UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'table_number', t.number,
        'waiting_bill', t.status = 'AGUARDANDO_CONTA',
        'is_open', EXISTS (SELECT 1 FROM shifts WHERE status = 'ABERTO')
    )
    FROM restaurant_tables t
    WHERE t.qr_token = p_token AND t.active;
$$;

CREATE OR REPLACE FUNCTION create_table_qr_order(p_token UUID, p_items JSONB, p_idempotency_key TEXT, p_customer_name TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_table restaurant_tables;
    v_shift shifts;
    v_tab tabs;
    v_order orders;
    v_key TEXT;
    v_uid UUID;
    v_item JSONB;
    v_product RECORD;
    v_stock RECORD;
    v_qty INT;
    v_doneness meat_doneness;
    v_new_balance INT;
    v_notes TEXT;
BEGIN
    IF p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 8 AND 64 THEN
        RAISE EXCEPTION 'Pedido inválido.';
    END IF;
    IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'O pedido precisa ter pelo menos um item.';
    END IF;
    IF jsonb_array_length(p_items) > 30 THEN
        RAISE EXCEPTION 'Pedido grande demais. Chame o garçom.';
    END IF;

    SELECT * INTO v_table FROM restaurant_tables WHERE qr_token = p_token AND active FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'QR Code inválido. Chame o garçom.';
    END IF;

    -- A chave vale só para esta mesa: outra pessoa não consegue ler pedido alheio
    v_key := 'qr:' || v_table.id || ':' || p_idempotency_key;
    SELECT * INTO v_order FROM orders WHERE idempotency_key = v_key;
    IF FOUND THEN
        RETURN jsonb_build_object('order_number', v_order.order_number, 'duplicate', true);
    END IF;

    SELECT * INTO v_shift FROM shifts WHERE status = 'ABERTO' ORDER BY opened_at DESC LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'A loja ainda não abriu. Chame o garçom.';
    END IF;
    IF v_table.status = 'AGUARDANDO_CONTA' THEN
        RAISE EXCEPTION 'A conta desta mesa já foi pedida. Chame o garçom para pedir mais.';
    END IF;

    -- Freio contra QR fotografado ou uso abusivo
    IF (SELECT count(*) FROM orders WHERE table_id = v_table.id AND source = 'QR' AND created_at > NOW() - INTERVAL '10 minutes') >= 5 THEN
        RAISE EXCEPTION 'Muitos pedidos em pouco tempo. Chame o garçom.';
    END IF;

    SELECT * INTO v_tab FROM tabs WHERE table_id = v_table.id AND status = 'OPEN' FOR UPDATE;
    IF FOUND AND v_tab.shift_id <> v_shift.id THEN
        RAISE EXCEPTION 'Esta mesa está com uma comanda de outro turno. Chame o garçom.';
    END IF;

    IF v_tab.id IS NULL THEN
        v_uid := v_shift.opened_by;
        INSERT INTO tabs (shift_id, table_id, customer_name, people_count, status, opened_by, updated_by)
        VALUES (v_shift.id, v_table.id, COALESCE(NULLIF(left(TRIM(p_customer_name), 60), ''), 'Mesa ' || v_table.number),
                1, 'OPEN', v_uid, v_uid::TEXT)
        RETURNING * INTO v_tab;
        UPDATE restaurant_tables SET status = 'OCUPADA', updated_by = v_uid::TEXT WHERE id = v_table.id;
        INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
        VALUES (v_shift.id, NULL, 'ABRIR_COMANDA_QR', 'tabs', v_tab.id::TEXT, jsonb_build_object('table_number', v_table.number));
    ELSE
        v_uid := v_tab.opened_by;
    END IF;

    v_notes := 'PEDIDO DO CLIENTE (QR DA MESA)';
    INSERT INTO orders (shift_id, tab_id, table_id, status, notes, idempotency_key, created_by, updated_by, source)
    VALUES (v_shift.id, v_tab.id, v_table.id, 'CONFIRMED', v_notes, v_key, v_uid, v_uid::TEXT, 'QR')
    RETURNING * INTO v_order;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty := (v_item->>'quantity')::INT;
        IF v_qty IS NULL OR v_qty <= 0 OR v_qty > 30 THEN
            RAISE EXCEPTION 'Quantidade inválida. Chame o garçom para pedidos grandes.';
        END IF;

        SELECT * INTO v_product FROM products WHERE id = (v_item->>'product_id')::UUID;
        IF NOT FOUND OR NOT v_product.active THEN
            RAISE EXCEPTION 'Um produto do pedido saiu do cardápio.';
        END IF;

        v_doneness := CASE WHEN v_product.allows_doneness AND (v_item->>'doneness') IS NOT NULL
                           THEN (v_item->>'doneness')::meat_doneness END;

        IF v_product.tracks_stock THEN
            SELECT * INTO v_stock FROM daily_prep_stock WHERE shift_id = v_shift.id AND product_id = v_product.id FOR UPDATE;
            IF NOT FOUND OR v_stock.is_exhausted THEN
                RAISE EXCEPTION '"%" acabou.', v_product.name;
            END IF;
            IF v_stock.current_quantity < v_qty THEN
                RAISE EXCEPTION 'Só restam % de "%".', v_stock.current_quantity, v_product.name;
            END IF;
            v_new_balance := v_stock.current_quantity - v_qty;
            UPDATE daily_prep_stock
               SET current_quantity = v_new_balance,
                   consumed_quantity = consumed_quantity + v_qty,
                   is_exhausted = (v_new_balance = 0) OR is_exhausted,
                   exhausted_at = CASE WHEN v_new_balance = 0 THEN NOW() ELSE exhausted_at END,
                   updated_by = v_uid::TEXT
             WHERE id = v_stock.id;
            IF v_new_balance = 0 THEN
                UPDATE products SET available = false WHERE id = v_product.id;
            END IF;
            INSERT INTO stock_movements (shift_id, product_id, quantity, movement_type, previous_balance, new_balance, order_id, reason, user_id)
            VALUES (v_shift.id, v_product.id, -v_qty, 'VENDA', v_stock.current_quantity, v_new_balance, v_order.id, 'Venda Mesa (QR)', v_uid);
        ELSIF NOT v_product.available THEN
            RAISE EXCEPTION '"%" acabou.', v_product.name;
        END IF;

        INSERT INTO order_items (order_id, shift_id, product_id, product_name, unit_price, quantity, doneness, notes, sector, status, updated_by)
        VALUES (v_order.id, v_shift.id, v_product.id, v_product.name, v_product.price, v_qty, v_doneness,
                NULLIF(left(TRIM(v_item->>'notes'), 200), ''), v_product.sector, 'RECEIVED', v_uid::TEXT);
    END LOOP;

    PERFORM recalc_tab_totals(v_tab.id);

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (v_shift.id, NULL, 'CRIAR_PEDIDO_QR', 'orders', v_order.id::TEXT,
            jsonb_build_object('tab_id', v_tab.id, 'table_number', v_table.number, 'items_count', jsonb_array_length(p_items)));

    RETURN jsonb_build_object('order_number', v_order.order_number, 'duplicate', false);
END;
$$;

CREATE OR REPLACE FUNCTION rotate_table_qr_token(p_table_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_token UUID := gen_random_uuid();
BEGIN
    UPDATE restaurant_tables SET qr_token = v_token, updated_by = v_uid::TEXT WHERE id = p_table_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Mesa não encontrada.';
    END IF;
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_data)
    VALUES (v_uid, 'TROCAR_QR_MESA', 'restaurant_tables', p_table_id::TEXT, '{}'::jsonb);
    RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION get_table_qr_info(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_table_qr_order(UUID, JSONB, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION rotate_table_qr_token(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_table_qr_info(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_table_qr_order(UUID, JSONB, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rotate_table_qr_token(UUID) TO authenticated;

select 'MIGRATION_00055_OK' as resultado;
