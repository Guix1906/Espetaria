-- ============================================================================
-- MIGRATION 00028: FLUXO SIMPLIFICADO DA CHURRASQUEIRA + RETIRADA NO LOCAL
--  * Espetos entram direto "Na brasa" (sem o churrasqueiro aceitar nada):
--      - salão: itens da churrasqueira nascem IN_PREPARATION
--      - delivery/retirada: pedido nasce PREPARING
--  * delivery_orders.order_type: 'DELIVERY' (entrega) ou 'PICKUP' (retirada no local)
--  * Hora de cada mudança de status (preparing_at, ready_at, cancelled_at) e
--    histórico completo em delivery_order_status_history
--  * WhatsApp: "pronto" só avisa o cliente na RETIRADA; no delivery o cliente é
--    avisado quando sai para entrega
--  * Cancelamento: quem cancela escolhe se volta ao estoque (p_return_stock)
-- Inclui o que as migrações 00026 e 00027 criaram (rodar só esta já basta).
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================================

-- 1. Colunas novas -------------------------------------------------------------------
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'DELIVERY';
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS preparing_at TIMESTAMPTZ;
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ;
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS whatsapp_templates JSONB;

DO $$
DECLARE
    r RECORD;
BEGIN
    -- Valores permitidos (refaz as regras de 00026 caso ainda não tenham rodado)
    FOR r IN SELECT conname FROM pg_constraint
              WHERE conrelid = 'public.delivery_orders'::regclass AND contype = 'c'
                AND (pg_get_constraintdef(oid) ILIKE '%OUT_FOR_DELIVERY%' OR pg_get_constraintdef(oid) ILIKE '%PICKUP%') LOOP
        EXECUTE format('ALTER TABLE public.delivery_orders DROP CONSTRAINT %I', r.conname);
    END LOOP;
    FOR r IN SELECT conname FROM pg_constraint
              WHERE conrelid = 'public.whatsapp_outbox'::regclass AND contype = 'c'
                AND pg_get_constraintdef(oid) ILIKE '%OUT_FOR_DELIVERY%' LOOP
        EXECUTE format('ALTER TABLE public.whatsapp_outbox DROP CONSTRAINT %I', r.conname);
    END LOOP;
END $$;

ALTER TABLE delivery_orders ADD CONSTRAINT delivery_orders_status_check
    CHECK (status IN ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'));
ALTER TABLE delivery_orders ADD CONSTRAINT delivery_orders_order_type_check
    CHECK (order_type IN ('DELIVERY', 'PICKUP'));
ALTER TABLE whatsapp_outbox ADD CONSTRAINT whatsapp_outbox_event_check
    CHECK (event IN ('CONFIRMED', 'PAID', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'));

-- 2. Hora e histórico de cada mudança de status do delivery ----------------------------
CREATE TABLE IF NOT EXISTS delivery_order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_order_id UUID NOT NULL REFERENCES delivery_orders(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    changed_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_delivery_status_history_order ON delivery_order_status_history(delivery_order_id, created_at);

ALTER TABLE delivery_order_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read delivery status history" ON delivery_order_status_history;
CREATE POLICY "Staff read delivery status history" ON delivery_order_status_history FOR SELECT TO authenticated
    USING (current_user_role() IS NOT NULL);

CREATE OR REPLACE FUNCTION trg_stamp_delivery_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status = 'PREPARING' THEN NEW.preparing_at := COALESCE(NEW.preparing_at, NOW()); END IF;
        IF NEW.status = 'READY' THEN NEW.ready_at := NOW(); END IF;
        IF NEW.status = 'CANCELLED' THEN NEW.cancelled_at := NOW(); END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_delivery_status ON delivery_orders;
CREATE TRIGGER stamp_delivery_status
    BEFORE INSERT OR UPDATE OF status ON delivery_orders
    FOR EACH ROW EXECUTE FUNCTION trg_stamp_delivery_status();

CREATE OR REPLACE FUNCTION trg_log_delivery_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO delivery_order_status_history (delivery_order_id, from_status, to_status, changed_by)
        VALUES (NEW.id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END, NEW.status, NEW.updated_by);
    END IF;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION trg_log_delivery_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS log_delivery_status ON delivery_orders;
CREATE TRIGGER log_delivery_status
    AFTER INSERT OR UPDATE OF status ON delivery_orders
    FOR EACH ROW EXECUTE FUNCTION trg_log_delivery_status();

-- 3. Salão: espeto enviado pelo garçom já entra "Na brasa" --------------------------------
CREATE OR REPLACE FUNCTION trg_grill_items_start_on_grill()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.sector = 'GRILL' AND NEW.status = 'RECEIVED' THEN
        NEW.status := 'IN_PREPARATION';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grill_items_start_on_grill ON order_items;
CREATE TRIGGER grill_items_start_on_grill
    BEFORE INSERT ON order_items
    FOR EACH ROW EXECUTE FUNCTION trg_grill_items_start_on_grill();

-- Registra a hora em que foi para a brasa e atualiza o status do pedido
CREATE OR REPLACE FUNCTION trg_log_grill_item_start()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user UUID;
BEGIN
    IF NEW.sector = 'GRILL' AND NEW.status = 'IN_PREPARATION' THEN
        BEGIN
            v_user := NULLIF(NEW.updated_by, '')::UUID;
        EXCEPTION WHEN invalid_text_representation THEN
            v_user := NULL;
        END;
        IF v_user IS NOT NULL AND EXISTS (SELECT 1 FROM profiles WHERE id = v_user) THEN
            INSERT INTO order_item_status_history (order_item_id, from_status, to_status, changed_by, notes)
            VALUES (NEW.id, 'RECEIVED', 'IN_PREPARATION', v_user, 'Automático: enviado para a brasa');
        END IF;
        PERFORM recompute_order_status(NEW.order_id);
    END IF;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION trg_log_grill_item_start() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS log_grill_item_start ON order_items;
CREATE TRIGGER log_grill_item_start
    AFTER INSERT ON order_items
    FOR EACH ROW EXECUTE FUNCTION trg_log_grill_item_start();

-- 4. Cancelar item do salão: quem cancela escolhe se volta ao estoque ----------------------
--    p_return_stock NULL = regra antiga (só devolve se ainda não entrou em preparo)
DROP FUNCTION IF EXISTS cancel_order_item_atomic(UUID, TEXT);
DROP FUNCTION IF EXISTS cancel_order_item_atomic(UUID, TEXT, BOOLEAN);

CREATE FUNCTION cancel_order_item_atomic(
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
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'GARCOM', 'CAIXA']::app_role[]);
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
    VALUES (v_item.shift_id, v_uid, 'CANCELAR_ITEM', 'order_items', p_order_item_id::TEXT,
            jsonb_build_object('status', v_item.status, 'product_name', v_item.product_name, 'price', v_item.unit_price),
            jsonb_build_object('reason', p_reason, 'returned_to_stock', v_returned));
END;
$$;
REVOKE ALL ON FUNCTION cancel_order_item_atomic(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancel_order_item_atomic(UUID, TEXT, BOOLEAN) TO authenticated;

-- 5. Anular comanda: mesma escolha de estoque para os itens ainda não prontos -------------
DROP FUNCTION IF EXISTS void_tab_atomic(UUID, TEXT);
DROP FUNCTION IF EXISTS void_tab_atomic(UUID, TEXT, BOOLEAN);

CREATE FUNCTION void_tab_atomic(p_tab_id UUID, p_reason TEXT, p_return_stock BOOLEAN DEFAULT NULL)
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
        PERFORM cancel_order_item_atomic(v_item.id, 'Comanda anulada: ' || p_reason, p_return_stock);
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
            jsonb_build_object('reason', p_reason, 'items_cancelled', v_items, 'payments_reversed', v_payments,
                               'returned_to_stock', p_return_stock));

    RETURN jsonb_build_object('tab_id', p_tab_id, 'items_cancelled', v_items, 'payments_reversed', v_payments);
END;
$$;
REVOKE ALL ON FUNCTION void_tab_atomic(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION void_tab_atomic(UUID, TEXT, BOOLEAN) TO authenticated;

-- 6. Cardápio digital: entrega ou retirada, e o pedido já entra "Na brasa" ---------------
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
    r RECORD;
BEGIN
    -- Idempotência: clique duplo / reenvio do navegador
    IF v_idem IS NOT NULL THEN
        SELECT * INTO v_order FROM delivery_orders WHERE idempotency_key = v_idem;
        IF FOUND THEN
            RETURN jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number, 'total', v_order.total, 'duplicate', true);
        END IF;
    END IF;

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
        -- Retirada no local: sem endereço e sem taxa
        v_fee := 0;
        v_street := '';
        v_number := '';
        v_zone := '';
    ELSE
        SELECT fee INTO v_fee FROM delivery_zones WHERE name = v_zone AND active;
        IF v_fee IS NULL THEN RAISE EXCEPTION 'Bairro não atendido. Selecione um bairro da lista.'; END IF;
    END IF;

    INSERT INTO delivery_orders (shift_id, order_type, customer_name, phone, address_street, address_number, address_neighborhood,
                                 address_complement, address_reference, delivery_fee, payment_method, cash_change_for,
                                 status, notes, confirmed_at, idempotency_key)
    VALUES (v_shift.id, v_type, v_name, v_phone, v_street, v_number, v_zone,
            CASE WHEN v_type = 'DELIVERY' THEN NULLIF(LEFT(TRIM(COALESCE(p_order->>'address_complement', '')), 80), '') END,
            CASE WHEN v_type = 'DELIVERY' THEN NULLIF(LEFT(TRIM(COALESCE(p_order->>'address_reference', '')), 120), '') END,
            v_fee, v_payment, CASE WHEN v_payment = 'DINHEIRO' THEN v_change END,
            'PREPARING', NULLIF(LEFT(TRIM(COALESCE(p_order->>'notes', '')), 300), ''), NOW(), v_idem)
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

    -- Cupons de produção por setor
    IF auto_print_enabled() THEN
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
                                  jsonb_build_object('neighborhood', v_order.address_neighborhood, 'order_type', v_type),
                                  'DLV-' || v_order.id || '-' || r.sector);
        END LOOP;

        -- Cupom de expedição (dados do cliente, endereço, pagamento e totais)
        PERFORM enqueue_print('DELIVERY_SUMMARY', v_order.id, v_order.order_number, 'NONE', 'DELIVERY', NULL,
                              v_order.customer_name,
                              (SELECT jsonb_agg(jsonb_build_object('name', product_name, 'quantity', quantity,
                                                                   'doneness', doneness, 'notes', notes,
                                                                   'unit_price', unit_price) ORDER BY product_name)
                                 FROM delivery_order_items WHERE delivery_order_id = v_order.id),
                              to_jsonb(v_order) - 'shift_id' - 'version' - 'idempotency_key',
                              'DLV-' || v_order.id || '-SUMMARY');
    END IF;

    RETURN jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number, 'total', v_order.total,
                              'subtotal', v_order.subtotal, 'delivery_fee', v_order.delivery_fee,
                              'order_type', v_type, 'duplicate', false);
END;
$$;
REVOKE ALL ON FUNCTION place_delivery_order(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION place_delivery_order(JSONB) TO anon, authenticated;

-- 7. Mudança de status pela equipe (retirada não "sai para entrega") ----------------------
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

-- 8. Cancelar delivery/retirada: quem cancela escolhe se volta ao estoque -------------------
DROP FUNCTION IF EXISTS cancel_delivery_order(UUID, TEXT);
DROP FUNCTION IF EXISTS cancel_delivery_order(UUID, TEXT, BOOLEAN);

CREATE FUNCTION cancel_delivery_order(p_order_id UUID, p_reason TEXT, p_return_stock BOOLEAN DEFAULT NULL)
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
    v_return := v_order.status IN ('PENDING', 'CONFIRMED', 'PREPARING')
                AND COALESCE(p_return_stock, v_order.status IN ('PENDING', 'CONFIRMED'));

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

    -- Avisa os setores de produção
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

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (v_order.shift_id, v_uid, 'CANCELAR_DELIVERY', 'delivery_orders', p_order_id::TEXT,
            jsonb_build_object('reason', p_reason, 'returned_to_stock', v_return));
END;
$$;
REVOKE ALL ON FUNCTION cancel_delivery_order(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancel_delivery_order(UUID, TEXT, BOOLEAN) TO authenticated;

-- 9. WhatsApp: quando avisar o cliente --------------------------------------------------
--    Entrega:  recebido, PIX confirmado, saiu para entrega, entregue, cancelado
--    Retirada: recebido, PIX confirmado, pronto para retirar, cancelado
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

DROP TRIGGER IF EXISTS queue_delivery_whatsapp ON delivery_orders;
CREATE CONSTRAINT TRIGGER queue_delivery_whatsapp
    AFTER INSERT OR UPDATE OF status, paid_at ON delivery_orders
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION trg_queue_delivery_whatsapp();

-- 10. Página pública de acompanhamento (#/pedido/<id>) ------------------------------------
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

select 'MIGRATION_00028_OK' as resultado;
