-- ============================================================================
-- Migration 00053: Troca rápida de itens pelo garçom e reenvio à produção
-- 1. RPC swap_order_item_atomic: permite ao garçom, caixa ou gerente substituir
--    um item lançado por engano por outro produto, emitindo o cancelamento do
--    antigo e o novo pedido do substituto na churrasqueira/cozinha, ajustando
--    o estoque e recalculando a comanda em 1 transação atômica.
-- 2. RPC reprint_table_production e reprint_order_production: permite ao garçom
--    ou operador reenviar os cupons de produção para a churrasqueira e cozinha.
-- ============================================================================

CREATE OR REPLACE FUNCTION swap_order_item_atomic(
    p_order_item_id UUID,
    p_new_product_id UUID,
    p_new_quantity INT,
    p_new_doneness meat_doneness DEFAULT NULL,
    p_new_notes TEXT DEFAULT NULL,
    p_new_item_id UUID DEFAULT NULL,
    p_return_stock BOOLEAN DEFAULT true,
    p_reason TEXT DEFAULT 'Troca de item solicitado'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'GARCOM', 'CAIXA']::app_role[]);
    v_old_item order_items%ROWTYPE;
    v_old_product products%ROWTYPE;
    v_old_stock daily_prep_stock%ROWTYPE;
    v_new_product products%ROWTYPE;
    v_new_stock daily_prep_stock%ROWTYPE;
    v_order orders%ROWTYPE;
    v_tab tabs%ROWTYPE;
    v_table_number INT;
    v_waiter TEXT;
    v_new_item_id UUID;
    v_new_balance INT;
    v_new_sector production_sector;
BEGIN
    -- 1. Valida item antigo
    SELECT * INTO v_old_item FROM order_items WHERE id = p_order_item_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item do pedido não encontrado.'; END IF;
    IF v_old_item.status = 'CANCELLED' THEN RAISE EXCEPTION 'Item já cancelado.'; END IF;
    IF v_old_item.status = 'DELIVERED' THEN RAISE EXCEPTION 'Item já entregue à mesa não pode ser trocado.'; END IF;

    -- 2. Valida comanda e pedido
    SELECT * INTO v_order FROM orders WHERE id = v_old_item.order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;

    SELECT * INTO v_tab FROM tabs WHERE id = v_order.tab_id AND status = 'OPEN';
    IF NOT FOUND THEN RAISE EXCEPTION 'Comanda encerrada ou inválida.'; END IF;

    SELECT number INTO v_table_number FROM restaurant_tables WHERE id = v_order.table_id;
    SELECT name INTO v_waiter FROM profiles WHERE id = v_uid;

    -- 3. Valida novo produto
    SELECT * INTO v_new_product FROM products WHERE id = p_new_product_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Novo produto não encontrado.'; END IF;
    IF NOT v_new_product.active THEN RAISE EXCEPTION 'Produto % está indisponível.', v_new_product.name; END IF;

    IF p_new_quantity <= 0 THEN RAISE EXCEPTION 'Quantidade deve ser maior que zero.'; END IF;

    -- 4. Devolve estoque do item antigo se solicitado e aplicável
    SELECT * INTO v_old_product FROM products WHERE id = v_old_item.product_id;
    IF v_old_product.tracks_stock AND COALESCE(p_return_stock, true) THEN
        SELECT * INTO v_old_stock FROM daily_prep_stock
         WHERE shift_id = v_old_item.shift_id AND product_id = v_old_item.product_id FOR UPDATE;
        IF FOUND THEN
            UPDATE daily_prep_stock
               SET current_quantity = current_quantity + v_old_item.quantity,
                   consumed_quantity = GREATEST(0, consumed_quantity - v_old_item.quantity),
                   is_exhausted = false,
                   updated_by = v_uid::TEXT
             WHERE id = v_old_stock.id;

            UPDATE products SET available = true WHERE id = v_old_product.id;

            INSERT INTO stock_movements (shift_id, product_id, quantity, movement_type,
                                         previous_balance, new_balance, order_item_id, reason, user_id)
            VALUES (v_old_item.shift_id, v_old_product.id, v_old_item.quantity, 'CANCELAMENTO_RETORNO',
                    v_old_stock.current_quantity, v_old_stock.current_quantity + v_old_item.quantity,
                    v_old_item.id, 'Troca de item: retorno ao estoque (' || p_reason || ')', v_uid);
        END IF;
    END IF;

    -- 5. Cancela o item antigo (o motivo vai no cupom de cancelamento)
    INSERT INTO order_item_status_history (order_item_id, from_status, to_status, changed_by, notes)
    VALUES (p_order_item_id, v_old_item.status, 'CANCELLED', v_uid, 'Troca por ' || v_new_product.name);

    UPDATE order_items
       SET status = 'CANCELLED', updated_by = v_uid::TEXT, updated_at = NOW()
     WHERE id = p_order_item_id;

    -- 6. O cupom de cancelamento sai pelo gatilho enqueue_item_cancel_print (não imprime duas vezes)

    -- 7. Dá baixa no estoque do novo produto se aplicável
    IF v_new_product.tracks_stock THEN
        SELECT * INTO v_new_stock FROM daily_prep_stock
         WHERE shift_id = v_old_item.shift_id AND product_id = v_new_product.id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Produto "%" não lançado na produção do turno.', v_new_product.name;
        END IF;
        IF v_new_stock.is_exhausted THEN
            RAISE EXCEPTION 'Produto "%" está esgotado.', v_new_product.name;
        END IF;
        IF v_new_stock.current_quantity < p_new_quantity THEN
            RAISE EXCEPTION 'Estoque insuficiente para "%" (disponível: %, solicitado: %).',
                v_new_product.name, v_new_stock.current_quantity, p_new_quantity;
        END IF;

        v_new_balance := v_new_stock.current_quantity - p_new_quantity;
        UPDATE daily_prep_stock
           SET current_quantity = v_new_balance,
               consumed_quantity = consumed_quantity + p_new_quantity,
               is_exhausted = (v_new_balance = 0) OR is_exhausted,
               exhausted_at = CASE WHEN v_new_balance = 0 THEN NOW() ELSE exhausted_at END,
               updated_by = v_uid::TEXT
         WHERE id = v_new_stock.id;

        IF v_new_balance = 0 THEN
            UPDATE products SET available = false WHERE id = v_new_product.id;
        END IF;

        INSERT INTO stock_movements (shift_id, product_id, quantity, movement_type,
                                     previous_balance, new_balance, order_id, reason, user_id)
        VALUES (v_old_item.shift_id, v_new_product.id, -p_new_quantity, 'VENDA',
                v_new_stock.current_quantity, v_new_balance, v_order.id, 'Troca de item', v_uid);
    END IF;

    -- 8. Insere novo order_item
    v_new_item_id := COALESCE(p_new_item_id, gen_random_uuid());
    v_new_sector := CASE WHEN v_new_product.name ~* 'suco|refresco|jarra' THEN 'KITCHEN'::production_sector ELSE v_new_product.sector END;

    INSERT INTO order_items (
        id, order_id, shift_id, product_id, product_name, unit_price, quantity,
        doneness, notes, sector, status, updated_by
    ) VALUES (
        v_new_item_id, v_order.id, v_old_item.shift_id, v_new_product.id, v_new_product.name,
        v_new_product.price, p_new_quantity, p_new_doneness, p_new_notes, v_new_sector,
        CASE WHEN v_new_sector = 'GRILL' THEN 'IN_PREPARATION'::order_item_status
             WHEN (v_new_sector = 'BAR' OR v_new_product.type = 'BEBIDA') AND NOT (v_new_product.name ~* 'suco|refresco|jarra') THEN 'DELIVERED'::order_item_status
             ELSE 'RECEIVED'::order_item_status END,
        v_uid::TEXT
    );

    -- 9. Emite cupom de NOVO PEDIDO para a produção
    IF auto_print_enabled() THEN
        IF v_new_sector = 'GRILL' AND v_new_product.type IS DISTINCT FROM 'BEBIDA' THEN
            PERFORM enqueue_print(
                'ORDER', v_order.id, v_order.order_number, 'GRILL', 'SALAO', v_table_number, v_tab.customer_name,
                jsonb_build_array(jsonb_build_object('name', v_new_product.name, 'quantity', p_new_quantity,
                                                     'doneness', p_new_doneness, 'notes', p_new_notes)),
                jsonb_build_object('waiter', v_waiter, 'order_notes', 'SUBSTITUIÇÃO / TROCA DE ITEM'),
                'ORD-' || v_order.id || '-SWAP-' || v_new_item_id || '-GRILL'
            );
        END IF;

        IF v_new_sector = 'KITCHEN' OR (v_new_sector = 'GRILL' AND (
            v_new_product.name ~* 'acompanhamento' OR COALESCE(p_new_notes, '') ~* '(?:arroz|bai[aã]o|pur[eê]|vinagrete|farofa|salada|mandioca|batata|fritas)'
        )) THEN
            PERFORM enqueue_print(
                'ORDER', v_order.id, v_order.order_number, 'KITCHEN', 'SALAO', v_table_number, v_tab.customer_name,
                jsonb_build_array(jsonb_build_object('name', v_new_product.name, 'quantity', p_new_quantity,
                                                     'doneness', p_new_doneness, 'notes', p_new_notes)),
                jsonb_build_object('waiter', v_waiter, 'order_notes', 'SUBSTITUIÇÃO / TROCA DE ITEM'),
                'ORD-' || v_order.id || '-SWAP-' || v_new_item_id || '-KITCHEN'
            );
        END IF;
    END IF;

    -- 10. Recalcula totais da comanda e status do pedido
    PERFORM recompute_order_status(v_order.id);
    PERFORM recalc_tab_totals(v_tab.id);

    RETURN jsonb_build_object(
        'success', true,
        'old_item_id', p_order_item_id,
        'new_item_id', v_new_item_id,
        'order_number', v_order.order_number
    );
END;
$$;

REVOKE ALL ON FUNCTION swap_order_item_atomic(UUID, UUID, INT, meat_doneness, TEXT, UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION swap_order_item_atomic(UUID, UUID, INT, meat_doneness, TEXT, UUID, BOOLEAN, TEXT) TO authenticated;

-- ============================================================================
-- 2. REENVIAR / REIMPRIMIR PRODUÇÃO DA MESA (GRILL / KITCHEN)
-- ============================================================================

CREATE OR REPLACE FUNCTION reprint_table_production(
    p_table_id UUID,
    p_sector production_sector DEFAULT NULL,
    p_reason TEXT DEFAULT 'Reimpressão solicitada na mesa'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'GARCOM', 'CAIXA', 'CHURRASQUEIRA', 'COZINHA', 'BAR']::app_role[]);
    v_tab tabs%ROWTYPE;
    v_table_number INT;
    v_waiter TEXT;
    v_grill_items JSONB;
    v_kitchen_items JSONB;
    v_enqueued_count INT := 0;
BEGIN
    SELECT * INTO v_tab FROM tabs WHERE table_id = p_table_id AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mesa sem comanda aberta.'; END IF;

    SELECT number INTO v_table_number FROM restaurant_tables WHERE id = p_table_id;
    SELECT name INTO v_waiter FROM profiles WHERE id = v_uid;

    -- GRILL
    IF p_sector IS NULL OR p_sector = 'GRILL' THEN
        SELECT jsonb_agg(jsonb_build_object('name', oi.product_name, 'quantity', oi.quantity,
                                            'doneness', oi.doneness, 'notes', oi.notes) ORDER BY oi.created_at)
          INTO v_grill_items
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          LEFT JOIN products p ON p.id = oi.product_id
         WHERE o.tab_id = v_tab.id
           AND oi.sector = 'GRILL'
           AND oi.status <> 'CANCELLED'
           AND p.type IS DISTINCT FROM 'BEBIDA';

        IF v_grill_items IS NOT NULL AND jsonb_array_length(v_grill_items) > 0 THEN
            PERFORM enqueue_print('ORDER', v_tab.id, COALESCE(v_table_number, 0), 'GRILL', 'SALAO',
                                  v_table_number, v_tab.customer_name, v_grill_items,
                                  jsonb_build_object('waiter', v_waiter, 'order_notes', '2ª VIA DE PRODUÇÃO - ' || p_reason),
                                  'REP-TABLE-' || v_tab.id || '-GRILL-' || extract(epoch FROM clock_timestamp())::BIGINT,
                                  true, p_reason);
            v_enqueued_count := v_enqueued_count + 1;
        END IF;
    END IF;

    -- KITCHEN
    IF p_sector IS NULL OR p_sector = 'KITCHEN' THEN
        SELECT jsonb_agg(jsonb_build_object('name', oi.product_name, 'quantity', oi.quantity,
                                            'doneness', oi.doneness, 'notes', oi.notes) ORDER BY oi.created_at)
          INTO v_kitchen_items
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          LEFT JOIN products p ON p.id = oi.product_id
         WHERE o.tab_id = v_tab.id
           AND oi.status <> 'CANCELLED'
           AND (
               oi.product_name ~* 'suco|refresco|jarra'
               OR p.name ~* 'suco|refresco|jarra'
               OR (
                   p.type IS DISTINCT FROM 'BEBIDA'
                   AND (
                       oi.sector = 'KITCHEN'
                       OR (oi.sector = 'GRILL' AND (
                           oi.product_name ~* 'acompanhamento'
                           OR oi.notes ~* '(?:arroz|bai[aã]o|pur[eê]|vinagrete|farofa|salada|mandioca|batata|fritas)'
                       ))
                   )
               )
           );

        IF v_kitchen_items IS NOT NULL AND jsonb_array_length(v_kitchen_items) > 0 THEN
            PERFORM enqueue_print('ORDER', v_tab.id, COALESCE(v_table_number, 0), 'KITCHEN', 'SALAO',
                                  v_table_number, v_tab.customer_name, v_kitchen_items,
                                  jsonb_build_object('waiter', v_waiter, 'order_notes', '2ª VIA DE PRODUÇÃO - ' || p_reason),
                                  'REP-TABLE-' || v_tab.id || '-KITCHEN-' || extract(epoch FROM clock_timestamp())::BIGINT,
                                  true, p_reason);
            v_enqueued_count := v_enqueued_count + 1;
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'enqueued_count', v_enqueued_count);
END;
$$;

REVOKE ALL ON FUNCTION reprint_table_production(UUID, production_sector, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reprint_table_production(UUID, production_sector, TEXT) TO authenticated;
