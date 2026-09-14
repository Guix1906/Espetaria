-- ============================================================================
-- MIGRATION 00002: ATOMIC STOCK PROCEDURES & BUSINESS TRANSACTIONS (PL/pgSQL)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. OPEN SHIFT WITH PRODUCTION MISE EN PLACE (ABERTURA DO TURNO)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION open_shift_with_stock(
    p_shift_name TEXT,
    p_opened_by UUID,
    p_initial_notes TEXT,
    p_cash_start NUMERIC(10, 2),
    p_stock_items JSONB -- Array of { product_id, cubas_count, portions_per_cuba, quantity }
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_shift_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_cubas NUMERIC(6, 2);
    v_portions_per_cuba INT;
    v_initial_qty INT;
    v_active_shift_id UUID;
BEGIN
    -- 1. Verifica se já existe turno aberto
    SELECT id INTO v_active_shift_id FROM shifts WHERE status = 'ABERTO' LIMIT 1;
    IF v_active_shift_id IS NOT NULL THEN
        RAISE EXCEPTION 'Já existe um turno aberto (%s). Feche o turno atual antes de abrir um novo.', v_active_shift_id;
    END IF;

    -- 2. Cria o novo turno
    INSERT INTO shifts (
        name,
        opened_by,
        initial_notes,
        cash_drawer_start,
        status
    ) VALUES (
        p_shift_name,
        p_opened_by,
        p_initial_notes,
        COALESCE(p_cash_start, 0.00),
        'ABERTO'
    )
    RETURNING id INTO v_shift_id;

    -- 3. Insere a carga de mise en place / produção do dia
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_stock_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_cubas := COALESCE((v_item->>'cubas_count')::NUMERIC, 0);
        v_portions_per_cuba := COALESCE((v_item->>'portions_per_cuba')::INT, 1);
        
        -- Se for calculado por cubas (ex: 3 cubas * 15 porções = 45)
        IF v_cubas > 0 THEN
            v_initial_qty := ROUND(v_cubas * v_portions_per_cuba);
        ELSE
            v_initial_qty := COALESCE((v_item->>'quantity')::INT, 0);
        END IF;

        IF v_initial_qty > 0 THEN
            -- Insere registro de estoque diário
            INSERT INTO daily_prep_stock (
                shift_id,
                product_id,
                cubas_count,
                portions_per_cuba,
                initial_quantity,
                current_quantity,
                is_exhausted
            ) VALUES (
                v_shift_id,
                v_product_id,
                v_cubas,
                v_portions_per_cuba,
                v_initial_qty,
                v_initial_qty,
                false
            );

            -- Registra a movimentação inicial de PRODUÇÃO
            INSERT INTO stock_movements (
                shift_id,
                product_id,
                quantity,
                movement_type,
                previous_balance,
                new_balance,
                reason,
                user_id
            ) VALUES (
                v_shift_id,
                v_product_id,
                v_initial_qty,
                'PRODUCAO',
                0,
                v_initial_qty,
                'Abertura de turno - Produção do dia (Mise en place)',
                p_opened_by
            );

            -- Garante que o produto esteja marcado como disponível no cardápio
            UPDATE products SET available = true WHERE id = v_product_id;
        END IF;
    END LOOP;

    -- 4. Grava auditoria
    INSERT INTO audit_logs (
        shift_id,
        user_id,
        action,
        entity_type,
        entity_id,
        new_data
    ) VALUES (
        v_shift_id,
        p_opened_by,
        'ABERTURA_TURNO',
        'shifts',
        v_shift_id::TEXT,
        jsonb_build_object('shift_name', p_shift_name, 'items_count', jsonb_array_length(p_stock_items))
    );

    RETURN v_shift_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. CREATE ORDER & ATOMIC STOCK CONSUMPTION WITH ROW LOCK (FOR UPDATE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_order_atomic(
    p_shift_id UUID,
    p_tab_id UUID,
    p_user_id UUID,
    p_items JSONB, -- Array of { product_id, quantity, doneness, notes }
    p_idempotency_key TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order_id UUID;
    v_existing_order_id UUID;
    v_table_id UUID;
    v_item JSONB;
    v_product RECORD;
    v_daily_stock RECORD;
    v_qty INT;
    v_doneness meat_doneness;
    v_item_notes TEXT;
    v_new_balance INT;
    v_subtotal NUMERIC(10, 2) := 0.00;
BEGIN
    -- 1. Validação de Idempotência
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_existing_order_id FROM orders WHERE idempotency_key = p_idempotency_key;
        IF v_existing_order_id IS NOT NULL THEN
            RETURN v_existing_order_id;
        END IF;
    END IF;

    -- 2. Obtém e valida a mesa vinculada à comanda
    SELECT table_id INTO v_table_id FROM tabs WHERE id = p_tab_id AND status = 'OPEN';
    IF v_table_id IS NULL THEN
        RAISE EXCEPTION 'Comanda inválida ou já finalizada.';
    END IF;

    -- 3. Cria o registro do Pedido
    INSERT INTO orders (
        shift_id,
        tab_id,
        table_id,
        status,
        notes,
        idempotency_key,
        created_by
    ) VALUES (
        p_shift_id,
        p_tab_id,
        v_table_id,
        'CONFIRMED',
        p_notes,
        p_idempotency_key,
        p_user_id
    )
    RETURNING id INTO v_order_id;

    -- 4. Itera sobre cada item do pedido com validação atômica de estoque
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty := (v_item->>'quantity')::INT;
        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'Quantidade do item deve ser maior que zero.';
        END IF;

        -- Busca informações do produto
        SELECT * INTO v_product FROM products WHERE id = (v_item->>'product_id')::UUID;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Produto não encontrado.';
        END IF;

        IF NOT v_product.active THEN
            RAISE EXCEPTION 'Produto % está inativo no cardápio.', v_product.name;
        END IF;

        -- Validação de ponto de carne se aplicável
        IF v_product.allows_doneness AND (v_item->>'doneness') IS NOT NULL THEN
            v_doneness := (v_item->>'doneness')::meat_doneness;
        ELSE
            v_doneness := NULL;
        END IF;
        v_item_notes := v_item->>'notes';

        -- CONTROLE ATÔMICO DE ESTOQUE COM ROW-LEVEL LOCKING
        IF v_product.tracks_stock THEN
            -- Bloqueia a linha daquele produto no turno para evitar concorrência
            SELECT * INTO v_daily_stock 
            FROM daily_prep_stock 
            WHERE shift_id = p_shift_id AND product_id = v_product.id 
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Produto "%" não foi lançado na produção deste turno.', v_product.name;
            END IF;

            IF v_daily_stock.is_exhausted THEN
                RAISE EXCEPTION 'Produto "%" está marcado como ESGOTADO.', v_product.name;
            END IF;

            IF v_daily_stock.current_quantity < v_qty THEN
                RAISE EXCEPTION 'Estoque insuficiente para "%". Disponível: %, Solicitado: %', 
                    v_product.name, v_daily_stock.current_quantity, v_qty;
            END IF;

            v_new_balance := v_daily_stock.current_quantity - v_qty;

            -- Atualiza o saldo atômico do estoque diário
            UPDATE daily_prep_stock
            SET current_quantity = v_new_balance,
                consumed_quantity = consumed_quantity + v_qty,
                is_exhausted = CASE WHEN v_new_balance = 0 THEN true ELSE is_exhausted END,
                exhausted_at = CASE WHEN v_new_balance = 0 THEN NOW() ELSE exhausted_at END,
                updated_at = NOW()
            WHERE id = v_daily_stock.id;

            -- Se zerou o estoque, marca também o produto como indisponível globalmente
            IF v_new_balance = 0 THEN
                UPDATE products SET available = false WHERE id = v_product.id;
            END IF;

            -- Registra o movimento de estoque auditável
            INSERT INTO stock_movements (
                shift_id,
                product_id,
                quantity,
                movement_type,
                previous_balance,
                new_balance,
                order_id,
                reason,
                user_id
            ) VALUES (
                p_shift_id,
                v_product.id,
                -v_qty,
                'VENDA',
                v_daily_stock.current_quantity,
                v_new_balance,
                v_order_id::TEXT,
                'Venda Mesa',
                p_user_id
            );
        END IF;

        -- Insere o item do pedido com histórico imutável de preço e nome
        INSERT INTO order_items (
            order_id,
            shift_id,
            product_id,
            product_name,
            unit_price,
            quantity,
            doneness,
            notes,
            sector,
            status
        ) VALUES (
            v_order_id,
            p_shift_id,
            v_product.id,
            v_product.name,
            v_product.price,
            v_qty,
            v_doneness,
            v_item_notes,
            v_product.sector,
            'RECEIVED'
        );

        v_subtotal := v_subtotal + (v_product.price * v_qty);
    END LOOP;

    -- 5. Atualiza o saldo da comanda e o status da mesa
    UPDATE tabs
    SET subtotal = subtotal + v_subtotal,
        total = (subtotal + v_subtotal) + service_fee - discount
    WHERE id = p_tab_id;

    UPDATE restaurant_tables
    SET status = 'OCUPADA'
    WHERE id = v_table_id AND status = 'LIVRE';

    -- 6. Auditoria
    INSERT INTO audit_logs (
        shift_id,
        user_id,
        action,
        entity_type,
        entity_id,
        new_data
    ) VALUES (
        p_shift_id,
        p_user_id,
        'CRIAR_PEDIDO',
        'orders',
        v_order_id::TEXT,
        jsonb_build_object('tab_id', p_tab_id, 'items_count', jsonb_array_length(p_items), 'subtotal', v_subtotal)
    );

    RETURN v_order_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. TOGGLE EXHAUST PRODUCT (BOTÃO ESGOTAR / REATIVAR DO CHURRASQUEIRO/COZINHA)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toggle_product_exhaustion(
    p_shift_id UUID,
    p_product_id UUID,
    p_is_exhausted BOOLEAN,
    p_user_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_prod_name TEXT;
BEGIN
    SELECT name INTO v_prod_name FROM products WHERE id = p_product_id;

    -- Atualiza no estoque do turno
    UPDATE daily_prep_stock
    SET is_exhausted = p_is_exhausted,
        exhausted_at = CASE WHEN p_is_exhausted THEN NOW() ELSE NULL END,
        exhausted_by = CASE WHEN p_is_exhausted THEN p_user_id ELSE NULL END,
        exhaust_reason = p_reason,
        updated_at = NOW()
    WHERE shift_id = p_shift_id AND product_id = p_product_id;

    -- Atualiza disponibilidade geral do produto no cardápio
    UPDATE products
    SET available = NOT p_is_exhausted,
        updated_at = NOW()
    WHERE id = p_product_id;

    -- Auditoria
    INSERT INTO audit_logs (
        shift_id,
        user_id,
        action,
        entity_type,
        entity_id,
        new_data
    ) VALUES (
        p_shift_id,
        p_user_id,
        CASE WHEN p_is_exhausted THEN 'ESGOTAR_PRODUTO' ELSE 'REATIVAR_PRODUTO' END,
        'daily_prep_stock',
        p_product_id::TEXT,
        jsonb_build_object('product_name', v_prod_name, 'reason', p_reason)
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. CANCEL ORDER ITEM ATOMIC (COM DEVOLUÇÃO CONDICIONAL AO ESTOQUE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_order_item_atomic(
    p_order_item_id UUID,
    p_reason TEXT,
    p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item RECORD;
    v_product RECORD;
    v_daily_stock RECORD;
    v_previous_status order_item_status;
    v_returned_to_stock BOOLEAN := false;
    v_movement_type stock_movement_type;
BEGIN
    -- 1. Busca e trava o item
    SELECT * INTO v_item FROM order_items WHERE id = p_order_item_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item do pedido não encontrado.';
    END IF;

    IF v_item.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'Item já se encontra cancelado.';
    END IF;

    v_previous_status := v_item.status;

    -- 2. Busca o produto
    SELECT * INTO v_product FROM products WHERE id = v_item.product_id;

    -- 3. Regra de Devolução ao Estoque baseada no status:
    -- Se RECEIVED: Não foi para a grelha/cozinha -> Devolve ao saldo comercializável
    -- Se IN_PREPARATION ou READY: Já foi colocado na brasa ou preparado -> Não devolve, registra perda/descarte
    IF v_product.tracks_stock THEN
        SELECT * INTO v_daily_stock 
        FROM daily_prep_stock 
        WHERE shift_id = v_item.shift_id AND product_id = v_item.product_id 
        FOR UPDATE;

        IF FOUND THEN
            IF v_previous_status = 'RECEIVED' THEN
                -- Devolve ao estoque
                v_returned_to_stock := true;
                v_movement_type := 'CANCELAMENTO_RETORNO';

                UPDATE daily_prep_stock
                SET current_quantity = current_quantity + v_item.quantity,
                    consumed_quantity = GREATEST(0, consumed_quantity - v_item.quantity),
                    is_exhausted = false, -- Reabilita se havia zerado
                    updated_at = NOW()
                WHERE id = v_daily_stock.id;

                UPDATE products SET available = true WHERE id = v_product.id;

                INSERT INTO stock_movements (
                    shift_id,
                    product_id,
                    quantity,
                    movement_type,
                    previous_balance,
                    new_balance,
                    order_item_id,
                    reason,
                    user_id
                ) VALUES (
                    v_item.shift_id,
                    v_item.product_id,
                    v_item.quantity,
                    v_movement_type,
                    v_daily_stock.current_quantity,
                    v_daily_stock.current_quantity + v_item.quantity,
                    v_item.id,
                    'Cancelamento antes do preparo: ' || p_reason,
                    p_user_id
                );
            ELSE
                -- Já estava em preparo ou pronto: gera registro de perda/descarte
                v_movement_type := 'PERDA';

                UPDATE daily_prep_stock
                SET discarded_quantity = discarded_quantity + v_item.quantity,
                    updated_at = NOW()
                WHERE id = v_daily_stock.id;

                INSERT INTO stock_movements (
                    shift_id,
                    product_id,
                    quantity,
                    movement_type,
                    previous_balance,
                    new_balance,
                    order_item_id,
                    reason,
                    user_id
                ) VALUES (
                    v_item.shift_id,
                    v_item.product_id,
                    -v_item.quantity,
                    v_movement_type,
                    v_daily_stock.current_quantity,
                    v_daily_stock.current_quantity, -- Saldo disponível não muda, pois já havia saído
                    v_item.id,
                    'Descarte/Perda após início do preparo: ' || p_reason,
                    p_user_id
                );
            END IF;
        END IF;
    END IF;

    -- 4. Atualiza status do item para CANCELLED
    UPDATE order_items
    SET status = 'CANCELLED'
    WHERE id = p_order_item_id;

    -- 5. Atualiza o subtotal e total da comanda
    UPDATE tabs
    SET subtotal = GREATEST(0, subtotal - (v_item.unit_price * v_item.quantity)),
        total = GREATEST(0, (subtotal - (v_item.unit_price * v_item.quantity)) + service_fee - discount)
    WHERE id = (SELECT tab_id FROM orders WHERE id = v_item.order_id);

    -- 6. Histórico de status
    INSERT INTO order_item_status_history (
        order_item_id,
        from_status,
        to_status,
        changed_by,
        notes
    ) VALUES (
        p_order_item_id,
        v_previous_status,
        'CANCELLED',
        p_user_id,
        p_reason
    );

    -- 7. Auditoria obrigatória
    INSERT INTO audit_logs (
        shift_id,
        user_id,
        action,
        entity_type,
        entity_id,
        old_data,
        new_data
    ) VALUES (
        v_item.shift_id,
        p_user_id,
        'CANCELAR_ITEM',
        'order_items',
        p_order_item_id::TEXT,
        jsonb_build_object('status', v_previous_status, 'product_name', v_item.product_name, 'price', v_item.unit_price),
        jsonb_build_object('reason', p_reason, 'returned_to_stock', v_returned_to_stock, 'movement_type', v_movement_type)
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. PHYSICAL STOCK ADJUSTMENT (CONTAGEM FÍSICA / AJUSTE DE CONCILIAÇÃO)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adjust_stock_physical_count(
    p_shift_id UUID,
    p_product_id UUID,
    p_physical_count INT,
    p_reason TEXT,
    p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_stock RECORD;
    v_diff INT;
BEGIN
    IF p_physical_count < 0 THEN
        RAISE EXCEPTION 'Contagem física não pode ser negativa.';
    END IF;

    SELECT * INTO v_stock 
    FROM daily_prep_stock 
    WHERE shift_id = p_shift_id AND product_id = p_product_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado no turno especificado.';
    END IF;

    v_diff := p_physical_count - v_stock.current_quantity;

    -- Atualiza saldo diário
    UPDATE daily_prep_stock
    SET last_counted_quantity = p_physical_count,
        count_difference = v_diff,
        adjusted_quantity = adjusted_quantity + v_diff,
        current_quantity = p_physical_count,
        is_exhausted = CASE WHEN p_physical_count = 0 THEN true ELSE false END,
        updated_at = NOW()
    WHERE id = v_stock.id;

    -- Atualiza disponibilidade
    UPDATE products
    SET available = (p_physical_count > 0)
    WHERE id = p_product_id;

    -- Registra movimentação de ajuste
    INSERT INTO stock_movements (
        shift_id,
        product_id,
        quantity,
        movement_type,
        previous_balance,
        new_balance,
        reason,
        user_id
    ) VALUES (
        p_shift_id,
        p_product_id,
        v_diff,
        'AJUSTE',
        v_stock.current_quantity,
        p_physical_count,
        'Contagem Física: ' || p_reason,
        p_user_id
    );

    -- Auditoria
    INSERT INTO audit_logs (
        shift_id,
        user_id,
        action,
        entity_type,
        entity_id,
        old_data,
        new_data
    ) VALUES (
        p_shift_id,
        p_user_id,
        'AJUSTE_ESTOQUE',
        'daily_prep_stock',
        v_stock.id::TEXT,
        jsonb_build_object('previous_balance', v_stock.current_quantity),
        jsonb_build_object('new_balance', p_physical_count, 'diff', v_diff, 'reason', p_reason)
    );
END;
$$;
