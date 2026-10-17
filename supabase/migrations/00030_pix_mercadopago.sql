-- ============================================================================
-- MIGRATION 00030: PIX AUTOMÁTICO (MERCADO PAGO)
--  * Com restaurant_settings.pix_auto_enabled ligado, pedido do cardápio pago por PIX
--    nasce AWAITING_PAYMENT: estoque reservado, mas SEM cupom e SEM produção.
--  * A Edge Function pix-mercadopago gera o QR Code do pedido e, quando o Mercado Pago
--    avisa que o pagamento foi aprovado, chama release_paid_delivery_order
--    (só service_role): marca pago, manda para a brasa e imprime.
--  * "PIX recebido" manual do caixa também libera (mark_delivery_paid).
--  * Sem pagamento no prazo (pix_auto_minutes, padrão 15): cancela e devolve o estoque
--    (expire_unpaid_pix_orders, chamada a cada pedido novo, consulta e pela função).
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================================

-- 1. Configuração e dados do PIX no pedido ---------------------------------------
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS pix_auto_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS pix_auto_minutes INT NOT NULL DEFAULT 15;

ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS pix_provider_id TEXT;
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS pix_qr_code TEXT;
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS pix_expires_at TIMESTAMPTZ;

ALTER TABLE delivery_orders DROP CONSTRAINT IF EXISTS delivery_orders_status_check;
ALTER TABLE delivery_orders ADD CONSTRAINT delivery_orders_status_check
    CHECK (status IN ('AWAITING_PAYMENT', 'PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'));

CREATE INDEX IF NOT EXISTS idx_delivery_orders_awaiting ON delivery_orders(created_at) WHERE status = 'AWAITING_PAYMENT';

-- 2. Cupons de produção do delivery (usado na criação e na liberação do PIX) --------
CREATE OR REPLACE FUNCTION enqueue_delivery_production(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order delivery_orders;
    r RECORD;
BEGIN
    IF NOT auto_print_enabled() THEN RETURN; END IF;
    SELECT * INTO v_order FROM delivery_orders WHERE id = p_order_id;
    IF NOT FOUND THEN RETURN; END IF;

    FOR r IN
        SELECT sector,
               jsonb_agg(jsonb_build_object('name', product_name, 'quantity', quantity,
                                            'doneness', doneness, 'notes', notes) ORDER BY product_name) AS items
          FROM delivery_order_items
         WHERE delivery_order_id = v_order.id AND sector <> 'NONE'
         GROUP BY sector
    LOOP
        PERFORM enqueue_print('ORDER', v_order.id, v_order.order_number, r.sector, 'DELIVERY', NULL,
                              v_order.customer_name, r.items,
                              jsonb_build_object('neighborhood', v_order.address_neighborhood, 'order_type', v_order.order_type),
                              'DLV-' || v_order.id || '-' || r.sector);
    END LOOP;

    PERFORM enqueue_print('DELIVERY_SUMMARY', v_order.id, v_order.order_number, 'NONE', 'DELIVERY', NULL,
                          v_order.customer_name,
                          (SELECT jsonb_agg(jsonb_build_object('name', product_name, 'quantity', quantity,
                                                               'doneness', doneness, 'notes', notes,
                                                               'unit_price', unit_price) ORDER BY product_name)
                             FROM delivery_order_items WHERE delivery_order_id = v_order.id),
                          to_jsonb(v_order) - 'shift_id' - 'version' - 'idempotency_key' - 'pix_qr_code',
                          'DLV-' || v_order.id || '-SUMMARY');
END;
$$;
REVOKE ALL ON FUNCTION enqueue_delivery_production(UUID) FROM PUBLIC, anon, authenticated;

-- 3. PIX vencido: cancela e devolve o estoque reservado ------------------------------
CREATE OR REPLACE FUNCTION expire_unpaid_pix_orders()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_minutes INT := COALESCE((SELECT pix_auto_minutes FROM restaurant_settings LIMIT 1), 15);
    v_order RECORD;
    v_item RECORD;
    v_stock RECORD;
    v_count INT := 0;
BEGIN
    FOR v_order IN
        SELECT o.*, s.opened_by
          FROM delivery_orders o JOIN shifts s ON s.id = o.shift_id
         WHERE o.status = 'AWAITING_PAYMENT'
           AND o.paid_at IS NULL
           AND o.created_at < NOW() - make_interval(mins => GREATEST(v_minutes, 5))
         FOR UPDATE OF o SKIP LOCKED
    LOOP
        FOR v_item IN
            SELECT i.*, p.tracks_stock FROM delivery_order_items i JOIN products p ON p.id = i.product_id
             WHERE i.delivery_order_id = v_order.id
        LOOP
            IF v_item.tracks_stock THEN
                SELECT * INTO v_stock FROM daily_prep_stock
                 WHERE shift_id = v_order.shift_id AND product_id = v_item.product_id FOR UPDATE;
                IF FOUND THEN
                    UPDATE daily_prep_stock
                       SET current_quantity = current_quantity + v_item.quantity,
                           consumed_quantity = GREATEST(0, consumed_quantity - v_item.quantity),
                           is_exhausted = false
                     WHERE id = v_stock.id;
                    UPDATE products SET available = true WHERE id = v_item.product_id;
                    INSERT INTO stock_movements (shift_id, product_id, quantity, movement_type, previous_balance,
                                                 new_balance, order_id, reason, user_id)
                    VALUES (v_order.shift_id, v_item.product_id, v_item.quantity, 'CANCELAMENTO_RETORNO',
                            v_stock.current_quantity, v_stock.current_quantity + v_item.quantity, v_order.id,
                            'PIX não pago no prazo: delivery #' || v_order.order_number, v_order.opened_by);
                END IF;
            END IF;
        END LOOP;

        UPDATE delivery_orders
           SET status = 'CANCELLED', cancel_reason = 'PIX não pago no prazo', updated_by = 'PIX_AUTOMATICO'
         WHERE id = v_order.id;
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION expire_unpaid_pix_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION expire_unpaid_pix_orders() TO anon, authenticated;

-- 4. Pagamento aprovado: libera para a produção (só a Edge Function, com service_role) --
CREATE OR REPLACE FUNCTION release_paid_delivery_order(p_order_id UUID, p_provider_id TEXT, p_amount NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order delivery_orders;
BEGIN
    SELECT * INTO v_order FROM delivery_orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
    IF p_amount IS NULL OR p_amount + 0.01 < v_order.total THEN
        RAISE EXCEPTION 'Valor pago (%) menor que o total do pedido (%).', p_amount, v_order.total;
    END IF;

    IF v_order.status = 'AWAITING_PAYMENT' THEN
        UPDATE delivery_orders
           SET status = 'PREPARING', paid_at = NOW(), confirmed_at = NOW(),
               pix_provider_id = COALESCE(p_provider_id, pix_provider_id), updated_by = 'PIX_AUTOMATICO'
         WHERE id = p_order_id RETURNING * INTO v_order;
        PERFORM enqueue_delivery_production(p_order_id);
        INSERT INTO audit_logs (shift_id, action, entity_type, entity_id, new_data)
        VALUES (v_order.shift_id, 'DELIVERY_PIX_AUTOMATICO', 'delivery_orders', p_order_id::TEXT,
                jsonb_build_object('total', v_order.total, 'provider_id', p_provider_id));
        RETURN jsonb_build_object('released', true, 'status', v_order.status);
    END IF;

    -- Já liberado (aviso repetido) ou pago depois de vencer: só registra o pagamento
    IF v_order.paid_at IS NULL THEN
        UPDATE delivery_orders SET paid_at = NOW(), pix_provider_id = COALESCE(p_provider_id, pix_provider_id),
                                   updated_by = 'PIX_AUTOMATICO'
         WHERE id = p_order_id RETURNING * INTO v_order;
        IF v_order.status = 'CANCELLED' THEN
            INSERT INTO audit_logs (shift_id, action, entity_type, entity_id, new_data)
            VALUES (v_order.shift_id, 'PIX_PAGO_APOS_CANCELAMENTO', 'delivery_orders', p_order_id::TEXT,
                    jsonb_build_object('total', v_order.total, 'provider_id', p_provider_id));
        END IF;
    END IF;
    RETURN jsonb_build_object('released', false, 'status', v_order.status);
END;
$$;
REVOKE ALL ON FUNCTION release_paid_delivery_order(UUID, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION release_paid_delivery_order(UUID, TEXT, NUMERIC) TO service_role;

-- 5. "PIX recebido" manual também libera o pedido que esperava pagamento -------------
CREATE OR REPLACE FUNCTION mark_delivery_paid(p_order_id UUID, p_paid BOOLEAN DEFAULT true)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'CAIXA']::app_role[]);
    v_order delivery_orders;
    v_was_awaiting BOOLEAN;
BEGIN
    SELECT status = 'AWAITING_PAYMENT' INTO v_was_awaiting FROM delivery_orders WHERE id = p_order_id FOR UPDATE;
    IF v_was_awaiting AND NOT p_paid THEN RAISE EXCEPTION 'Pedido ainda não foi pago.'; END IF;

    UPDATE delivery_orders
       SET paid_at = CASE WHEN p_paid THEN NOW() END,
           paid_by = CASE WHEN p_paid THEN v_uid END,
           status = CASE WHEN p_paid AND status = 'AWAITING_PAYMENT' THEN 'PREPARING' ELSE status END,
           confirmed_at = CASE WHEN p_paid AND status = 'AWAITING_PAYMENT' THEN NOW() ELSE confirmed_at END,
           updated_by = v_uid::TEXT
     WHERE id = p_order_id AND status <> 'CANCELLED'
    RETURNING * INTO v_order;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado ou cancelado.'; END IF;

    IF v_was_awaiting THEN PERFORM enqueue_delivery_production(p_order_id); END IF;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (v_order.shift_id, v_uid, CASE WHEN p_paid THEN 'DELIVERY_PAGO' ELSE 'DELIVERY_PAGAMENTO_ESTORNADO' END,
            'delivery_orders', p_order_id::TEXT, jsonb_build_object('total', v_order.total, 'method', v_order.payment_method));
    RETURN to_jsonb(v_order);
END;
$$;
REVOKE ALL ON FUNCTION mark_delivery_paid(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mark_delivery_paid(UUID, BOOLEAN) TO authenticated;

-- 6. Pedido do cardápio: com PIX automático, espera o pagamento antes de produzir -----
CREATE OR REPLACE FUNCTION place_delivery_order(p_order JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_shift RECORD;
    v_order delivery_orders;
    v_item JSONB;
    v_product RECORD;
    v_qty INT;
    v_doneness meat_doneness;
    v_subtotal NUMERIC(10, 2) := 0;
    v_fee NUMERIC(10, 2);
    v_type TEXT := CASE WHEN p_order->>'order_type' = 'PICKUP' THEN 'PICKUP' ELSE 'DELIVERY' END;
    v_phone TEXT := regexp_replace(COALESCE(p_order->>'phone', ''), '\D', '', 'g');
    v_name TEXT := LEFT(TRIM(COALESCE(p_order->>'customer_name', '')), 80);
    v_street TEXT := LEFT(TRIM(COALESCE(p_order->>'address_street', '')), 120);
    v_number TEXT := LEFT(TRIM(COALESCE(p_order->>'address_number', '')), 20);
    v_zone TEXT := TRIM(COALESCE(p_order->>'address_neighborhood', ''));
    v_payment TEXT := p_order->>'payment_method';
    v_change NUMERIC(10, 2) := NULLIF(p_order->>'cash_change_for', '')::NUMERIC;
    v_idem TEXT := LEFT(p_order->>'idempotency_key', 80);
    v_awaiting BOOLEAN;
BEGIN
    -- Idempotência: clique duplo / reenvio do navegador
    IF v_idem IS NOT NULL THEN
        SELECT * INTO v_order FROM delivery_orders WHERE idempotency_key = v_idem;
        IF FOUND THEN
            RETURN jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number, 'total', v_order.total,
                                      'subtotal', v_order.subtotal, 'delivery_fee', v_order.delivery_fee,
                                      'order_type', v_order.order_type, 'status', v_order.status,
                                      'awaiting_payment', v_order.status = 'AWAITING_PAYMENT', 'duplicate', true);
        END IF;
    END IF;

    -- Libera o estoque de PIX vencidos antes de validar este pedido
    PERFORM expire_unpaid_pix_orders();

    -- Validações de entrada
    IF length(v_name) < 2 THEN RAISE EXCEPTION 'Informe seu nome.'; END IF;
    IF length(v_phone) < 10 OR length(v_phone) > 13 THEN RAISE EXCEPTION 'Informe um telefone com DDD válido.'; END IF;
    IF v_type = 'DELIVERY' AND (length(v_street) < 3 OR length(v_number) < 1) THEN RAISE EXCEPTION 'Informe o endereço completo.'; END IF;
    IF v_payment NOT IN ('PIX', 'DINHEIRO', 'CARTAO_ENTREGA') THEN RAISE EXCEPTION 'Forma de pagamento inválida.'; END IF;
    IF jsonb_typeof(p_order->'items') <> 'array' OR jsonb_array_length(p_order->'items') = 0 THEN
        RAISE EXCEPTION 'Seu carrinho está vazio.';
    END IF;
    IF jsonb_array_length(p_order->'items') > 40 THEN RAISE EXCEPTION 'Pedido com itens demais.'; END IF;

    -- Anti-spam simples: no máximo 3 pedidos por telefone em 10 minutos
    IF (SELECT COUNT(*) FROM delivery_orders WHERE phone = v_phone AND created_at > NOW() - INTERVAL '10 minutes') >= 3 THEN
        RAISE EXCEPTION 'Muitos pedidos em sequência. Aguarde alguns minutos ou fale conosco pelo WhatsApp.';
    END IF;

    SELECT * INTO v_shift FROM shifts WHERE status = 'ABERTO' ORDER BY opened_at DESC LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Estamos fechados no momento. Volte no horário de funcionamento!';
    END IF;

    IF v_type = 'PICKUP' THEN
        v_fee := 0;
        v_street := '';
        v_number := '';
        v_zone := '';
    ELSE
        SELECT fee INTO v_fee FROM delivery_zones WHERE name = v_zone AND active;
        IF v_fee IS NULL THEN RAISE EXCEPTION 'Bairro não atendido. Selecione um bairro da lista.'; END IF;
    END IF;

    v_awaiting := v_payment = 'PIX' AND COALESCE((SELECT pix_auto_enabled FROM restaurant_settings LIMIT 1), false);

    INSERT INTO delivery_orders (shift_id, order_type, customer_name, phone, address_street, address_number, address_neighborhood,
                                 address_complement, address_reference, delivery_fee, payment_method, cash_change_for,
                                 status, notes, confirmed_at, idempotency_key)
    VALUES (v_shift.id, v_type, v_name, v_phone, v_street, v_number, v_zone,
            CASE WHEN v_type = 'DELIVERY' THEN NULLIF(LEFT(TRIM(COALESCE(p_order->>'address_complement', '')), 80), '') END,
            CASE WHEN v_type = 'DELIVERY' THEN NULLIF(LEFT(TRIM(COALESCE(p_order->>'address_reference', '')), 120), '') END,
            v_fee, v_payment, CASE WHEN v_payment = 'DINHEIRO' THEN v_change END,
            CASE WHEN v_awaiting THEN 'AWAITING_PAYMENT' ELSE 'PREPARING' END,
            NULLIF(LEFT(TRIM(COALESCE(p_order->>'notes', '')), 300), ''),
            CASE WHEN v_awaiting THEN NULL ELSE NOW() END, v_idem)
    RETURNING * INTO v_order;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_order->'items')
    LOOP
        v_qty := (v_item->>'quantity')::INT;
        IF v_qty IS NULL OR v_qty < 1 OR v_qty > 50 THEN RAISE EXCEPTION 'Quantidade inválida.'; END IF;

        SELECT * INTO v_product FROM products WHERE id = (v_item->>'product_id')::UUID AND active;
        IF NOT FOUND THEN RAISE EXCEPTION 'Um dos produtos não está mais disponível.'; END IF;
        IF NOT v_product.tracks_stock AND NOT v_product.available THEN
            RAISE EXCEPTION 'Produto "%" indisponível no momento.', v_product.name;
        END IF;

        v_doneness := CASE WHEN v_product.allows_doneness AND (v_item->>'doneness') IS NOT NULL
                           THEN (v_item->>'doneness')::meat_doneness END;

        -- Estoque é reservado já na criação (mesmo esperando o PIX); volta se vencer
        IF v_product.tracks_stock THEN
            PERFORM consume_stock_for_sale(v_shift.id, v_product.id, v_qty, v_shift.opened_by, v_order.id,
                                           CASE WHEN v_type = 'PICKUP' THEN 'Venda Retirada #' ELSE 'Venda Delivery #' END
                                           || v_order.order_number);
        END IF;

        INSERT INTO delivery_order_items (delivery_order_id, product_id, product_name, unit_price, quantity,
                                          doneness, notes, sector)
        VALUES (v_order.id, v_product.id, v_product.name, v_product.price, v_qty, v_doneness,
                NULLIF(LEFT(TRIM(COALESCE(v_item->>'notes', '')), 140), ''), v_product.sector);

        v_subtotal := v_subtotal + v_product.price * v_qty;
    END LOOP;

    UPDATE delivery_orders SET subtotal = v_subtotal, total = v_subtotal + v_fee
     WHERE id = v_order.id RETURNING * INTO v_order;

    -- Sem PIX automático: cupons na hora. Com PIX automático: só depois de pago.
    IF NOT v_awaiting THEN
        PERFORM enqueue_delivery_production(v_order.id);
    END IF;

    RETURN jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number, 'total', v_order.total,
                              'subtotal', v_order.subtotal, 'delivery_fee', v_order.delivery_fee,
                              'order_type', v_type, 'status', v_order.status,
                              'awaiting_payment', v_awaiting, 'duplicate', false);
END;
$$;
REVOKE ALL ON FUNCTION place_delivery_order(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION place_delivery_order(JSONB) TO anon, authenticated;

-- 7. Equipe não pula a etapa do pagamento ---------------------------------------------
CREATE OR REPLACE FUNCTION update_delivery_status(p_order_id UUID, p_status TEXT, p_driver_name TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'CAIXA', 'ENTREGADOR', 'COZINHA', 'CHURRASQUEIRA']::app_role[]);
    v_order delivery_orders;
BEGIN
    IF p_status NOT IN ('CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED') THEN
        RAISE EXCEPTION 'Status inválido. Para cancelar use cancel_delivery_order.';
    END IF;

    IF EXISTS (SELECT 1 FROM delivery_orders WHERE id = p_order_id AND status = 'AWAITING_PAYMENT') THEN
        RAISE EXCEPTION 'Pedido aguardando o PIX. Use "PIX recebido" depois de conferir o pagamento.';
    END IF;

    IF p_status = 'OUT_FOR_DELIVERY'
       AND EXISTS (SELECT 1 FROM delivery_orders WHERE id = p_order_id AND order_type = 'PICKUP') THEN
        RAISE EXCEPTION 'Pedido de retirada não sai para entrega.';
    END IF;

    UPDATE delivery_orders
       SET status = p_status,
           driver_name = COALESCE(NULLIF(p_driver_name, ''), driver_name),
           dispatched_at = CASE WHEN p_status = 'OUT_FOR_DELIVERY' THEN NOW() ELSE dispatched_at END,
           delivered_at = CASE WHEN p_status = 'DELIVERED' THEN NOW() ELSE delivered_at END,
           updated_by = v_uid::TEXT
     WHERE id = p_order_id AND status NOT IN ('CANCELLED', 'DELIVERED')
    RETURNING * INTO v_order;

    IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado ou já finalizado.'; END IF;
    RETURN to_jsonb(v_order);
END;
$$;

-- 8. Cancelar: pedido que só esperava o PIX volta ao estoque e não avisa a produção ----
CREATE OR REPLACE FUNCTION cancel_delivery_order(p_order_id UUID, p_reason TEXT, p_return_stock BOOLEAN DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'CAIXA']::app_role[]);
    v_order delivery_orders;
    v_item RECORD;
    v_stock RECORD;
    v_return BOOLEAN;
    r RECORD;
BEGIN
    IF COALESCE(TRIM(p_reason), '') = '' THEN RAISE EXCEPTION 'Informe o motivo do cancelamento.'; END IF;

    SELECT * INTO v_order FROM delivery_orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
    IF v_order.status IN ('CANCELLED', 'DELIVERED') THEN RAISE EXCEPTION 'Pedido já finalizado.'; END IF;

    -- Pronto ou já saiu nunca volta; na brasa vale a escolha de quem cancela
    v_return := v_order.status = 'AWAITING_PAYMENT'
                OR (v_order.status IN ('PENDING', 'CONFIRMED', 'PREPARING')
                    AND COALESCE(p_return_stock, v_order.status IN ('PENDING', 'CONFIRMED')));

    FOR v_item IN
        SELECT i.*, p.tracks_stock FROM delivery_order_items i JOIN products p ON p.id = i.product_id
         WHERE i.delivery_order_id = p_order_id
    LOOP
        IF v_item.tracks_stock THEN
            SELECT * INTO v_stock FROM daily_prep_stock
             WHERE shift_id = v_order.shift_id AND product_id = v_item.product_id FOR UPDATE;
            IF FOUND THEN
                IF v_return THEN
                    UPDATE daily_prep_stock
                       SET current_quantity = current_quantity + v_item.quantity,
                           consumed_quantity = GREATEST(0, consumed_quantity - v_item.quantity),
                           is_exhausted = false
                     WHERE id = v_stock.id;
                    UPDATE products SET available = true WHERE id = v_item.product_id;
                    INSERT INTO stock_movements (shift_id, product_id, quantity, movement_type, previous_balance,
                                                 new_balance, order_id, reason, user_id)
                    VALUES (v_order.shift_id, v_item.product_id, v_item.quantity, 'CANCELAMENTO_RETORNO',
                            v_stock.current_quantity, v_stock.current_quantity + v_item.quantity, p_order_id,
                            'Cancelamento delivery #' || v_order.order_number || ': ' || p_reason, v_uid);
                ELSE
                    UPDATE daily_prep_stock SET discarded_quantity = discarded_quantity + v_item.quantity
                     WHERE id = v_stock.id;
                    INSERT INTO stock_movements (shift_id, product_id, quantity, movement_type, previous_balance,
                                                 new_balance, order_id, reason, user_id)
                    VALUES (v_order.shift_id, v_item.product_id, -v_item.quantity, 'PERDA',
                            v_stock.current_quantity, v_stock.current_quantity, p_order_id,
                            'Perda delivery #' || v_order.order_number || ': ' || p_reason, v_uid);
                END IF;
            END IF;
        END IF;
    END LOOP;

    UPDATE delivery_orders SET status = 'CANCELLED', cancel_reason = p_reason, updated_by = v_uid::TEXT
     WHERE id = p_order_id;

    -- Avisa os setores de produção (quem esperava o PIX nunca foi impresso)
    IF v_order.status <> 'AWAITING_PAYMENT' THEN
        FOR r IN
            SELECT sector,
                   jsonb_agg(jsonb_build_object('name', product_name, 'quantity', quantity,
                                                'doneness', doneness, 'notes', notes)) AS items
              FROM delivery_order_items WHERE delivery_order_id = p_order_id AND sector <> 'NONE'
             GROUP BY sector
        LOOP
            PERFORM enqueue_print('CANCEL', p_order_id, v_order.order_number, r.sector, 'DELIVERY', NULL,
                                  v_order.customer_name, r.items,
                                  jsonb_build_object('reason', p_reason, 'order_type', v_order.order_type),
                                  'DLV-CANCEL-' || p_order_id || '-' || r.sector);
        END LOOP;
    END IF;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (v_order.shift_id, v_uid, 'CANCELAR_DELIVERY', 'delivery_orders', p_order_id::TEXT,
            jsonb_build_object('reason', p_reason, 'returned_to_stock', v_return));
END;
$$;
REVOKE ALL ON FUNCTION cancel_delivery_order(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancel_delivery_order(UUID, TEXT, BOOLEAN) TO authenticated;

-- 9. WhatsApp: esperando PIX não manda "recebido"; o aviso vai como "PIX confirmado" ---
CREATE OR REPLACE FUNCTION trg_queue_delivery_whatsapp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'AWAITING_PAYMENT' THEN RETURN NULL; END IF;
        v_event := 'CONFIRMED';
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'CANCELLED' THEN
        v_event := 'CANCELLED';
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.order_type = 'PICKUP' AND NEW.status = 'READY' THEN
        v_event := 'READY';
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.order_type = 'DELIVERY'
          AND NEW.status IN ('OUT_FOR_DELIVERY', 'DELIVERED') THEN
        v_event := NEW.status;
    ELSIF OLD.paid_at IS NULL AND NEW.paid_at IS NOT NULL
          AND NEW.payment_method = 'PIX' AND NEW.status <> 'CANCELLED' THEN
        v_event := 'PAID';
    ELSE
        RETURN NULL;
    END IF;

    INSERT INTO whatsapp_outbox (delivery_order_id, event, phone)
    VALUES (NEW.id, v_event, NEW.phone)
    ON CONFLICT (delivery_order_id, event) DO NOTHING;

    PERFORM wake_whatsapp_dispatch();
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION trg_queue_delivery_whatsapp() FROM PUBLIC, anon, authenticated;

-- 10. Cliente vê o QR Code do PIX ao reabrir o acompanhamento --------------------------
CREATE OR REPLACE FUNCTION get_delivery_order_status(p_order_id UUID, p_phone TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object('order_number', order_number, 'status', status, 'total', total,
                              'created_at', created_at, 'dispatched_at', dispatched_at,
                              'delivered_at', delivered_at, 'driver_name', driver_name, 'paid_at', paid_at,
                              'ready_at', ready_at, 'cancel_reason', cancel_reason,
                              'pix_qr_code', CASE WHEN status = 'AWAITING_PAYMENT' THEN pix_qr_code END,
                              'pix_expires_at', pix_expires_at)
      FROM delivery_orders
     WHERE id = p_order_id AND phone = regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
$$;
REVOKE ALL ON FUNCTION get_delivery_order_status(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_delivery_order_status(UUID, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_delivery_tracking(p_order_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'id', o.id,
        'order_number', o.order_number,
        'order_type', o.order_type,
        'status', o.status,
        'customer_name', split_part(trim(o.customer_name), ' ', 1),
        'address_street', o.address_street,
        'address_number', o.address_number,
        'address_neighborhood', o.address_neighborhood,
        'address_complement', o.address_complement,
        'address_reference', o.address_reference,
        'subtotal', o.subtotal,
        'delivery_fee', o.delivery_fee,
        'total', o.total,
        'payment_method', o.payment_method,
        'cash_change_for', o.cash_change_for,
        'paid_at', o.paid_at,
        'driver_name', o.driver_name,
        'cancel_reason', o.cancel_reason,
        'created_at', o.created_at,
        'ready_at', o.ready_at,
        'dispatched_at', o.dispatched_at,
        'delivered_at', o.delivered_at,
        'pix_qr_code', CASE WHEN o.status = 'AWAITING_PAYMENT' THEN o.pix_qr_code END,
        'pix_expires_at', o.pix_expires_at,
        'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'id', i.id, 'product_name', i.product_name, 'quantity', i.quantity,
                       'unit_price', i.unit_price, 'doneness', i.doneness, 'notes', i.notes)
                   ORDER BY i.product_name)
              FROM delivery_order_items i
             WHERE i.delivery_order_id = o.id), '[]'::jsonb)
    )
      FROM delivery_orders o
     WHERE o.id = p_order_id;
$$;
REVOKE ALL ON FUNCTION get_delivery_tracking(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_delivery_tracking(UUID) TO anon, authenticated;

select 'MIGRATION_00030_OK' as resultado;
