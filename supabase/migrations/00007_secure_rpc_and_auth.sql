-- ============================================================================
-- MIGRATION 00007: AUTENTICAÇÃO, RPCs ATÔMICAS SEGURAS E RLS RESTRITA
-- ----------------------------------------------------------------------------
-- * Toda mutação operacional passa por funções SECURITY DEFINER que usam
--   auth.uid() (o cliente não informa mais "quem" está agindo).
-- * Cada função valida o perfil (app_role) e se o perfil está ativo.
-- * Escritas diretas em tabs/orders/order_items/restaurant_tables/payments
--   deixam de ser permitidas pelo RLS.
-- * Corrige o cast inválido TEXT -> UUID em stock_movements.order_id.
-- * Taxa de serviço respeita a opção da comanda e o % configurado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. AJUSTES DE SCHEMA
-- ----------------------------------------------------------------------------
ALTER TABLE tabs
  ADD COLUMN IF NOT EXISTS service_fee_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS updated_by TEXT,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Só pode existir UMA comanda aberta por mesa (proteção contra corrida entre aparelhos)
CREATE UNIQUE INDEX IF NOT EXISTS uq_tabs_one_open_per_table
  ON tabs(table_id) WHERE status = 'OPEN';

-- Fila de impressão estava sem RLS
ALTER TABLE print_queue ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 1. HELPERS DE AUTORIZAÇÃO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM profiles WHERE id = auth.uid() AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION require_role(p_roles app_role[])
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role app_role;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sessão expirada. Faça login novamente.' USING ERRCODE = '28000';
    END IF;
    v_role := current_user_role();
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Perfil inexistente ou inativo.' USING ERRCODE = '42501';
    END IF;
    IF NOT (v_role = ANY(p_roles)) THEN
        RAISE EXCEPTION 'Perfil % sem permissão para esta operação.', v_role USING ERRCODE = '42501';
    END IF;
    RETURN auth.uid();
END;
$$;

-- Novo usuário do Supabase Auth:
--  * se já existe perfil com o mesmo e-mail (ex.: seed), vincula-o ao usuário
--    mantendo papel e status;
--  * senão cria perfil INATIVO (GARCOM) para a gerência ativar.
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE profiles
       SET id = NEW.id, updated_at = NOW()
     WHERE lower(email) = lower(NEW.email) AND id <> NEW.id;
    IF FOUND THEN
        RETURN NEW;
    END IF;

    INSERT INTO profiles (id, name, email, role, is_active)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NEW.email,
        'GARCOM',
        false
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- ----------------------------------------------------------------------------
-- 2. HELPERS DE CÁLCULO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalc_tab_totals(p_tab_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_subtotal NUMERIC(10, 2);
    v_pct NUMERIC(5, 2);
BEGIN
    SELECT COALESCE(SUM(oi.unit_price * oi.quantity), 0)
      INTO v_subtotal
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
     WHERE o.tab_id = p_tab_id AND oi.status <> 'CANCELLED';

    SELECT COALESCE((SELECT service_fee_percent FROM restaurant_settings LIMIT 1), 10.00) INTO v_pct;

    UPDATE tabs
       SET subtotal = v_subtotal,
           service_fee = CASE WHEN service_fee_enabled THEN ROUND(v_subtotal * v_pct / 100, 2) ELSE 0 END,
           discount = LEAST(discount, v_subtotal + CASE WHEN service_fee_enabled THEN ROUND(v_subtotal * v_pct / 100, 2) ELSE 0 END),
           total = GREATEST(0, v_subtotal
                    + CASE WHEN service_fee_enabled THEN ROUND(v_subtotal * v_pct / 100, 2) ELSE 0 END
                    - discount),
           updated_by = auth.uid()::TEXT
     WHERE id = p_tab_id;
END;
$$;

CREATE OR REPLACE FUNCTION recompute_order_status(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total INT;
    v_delivered INT;
    v_ready_or_delivered INT;
    v_in_prep INT;
    v_status order_status;
BEGIN
    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE status = 'DELIVERED'),
           COUNT(*) FILTER (WHERE status IN ('READY', 'DELIVERED')),
           COUNT(*) FILTER (WHERE status IN ('IN_PREPARATION', 'READY'))
      INTO v_total, v_delivered, v_ready_or_delivered, v_in_prep
      FROM order_items
     WHERE order_id = p_order_id AND status <> 'CANCELLED';

    IF v_total = 0 THEN
        v_status := 'CANCELLED';
    ELSIF v_delivered = v_total THEN
        v_status := 'DELIVERED';
    ELSIF v_ready_or_delivered = v_total THEN
        v_status := 'READY';
    ELSIF v_in_prep > 0 THEN
        v_status := 'IN_PREPARATION';
    ELSE
        v_status := 'CONFIRMED';
    END IF;

    UPDATE orders SET status = v_status
     WHERE id = p_order_id AND status <> 'CLOSED' AND status IS DISTINCT FROM v_status;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. TURNO (wrappers seguros sobre as funções da migration 00002)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION open_shift(
    p_shift_name TEXT,
    p_initial_notes TEXT,
    p_cash_start NUMERIC(10, 2),
    p_stock_items JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
BEGIN
    RETURN open_shift_with_stock(p_shift_name, v_uid, p_initial_notes, p_cash_start, COALESCE(p_stock_items, '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION close_shift(
    p_shift_id UUID,
    p_closing_notes TEXT,
    p_cash_end NUMERIC(10, 2)
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
BEGIN
    IF EXISTS (SELECT 1 FROM tabs WHERE shift_id = p_shift_id AND status = 'OPEN') THEN
        RAISE EXCEPTION 'Existem comandas abertas neste turno. Encerre-as antes de fechar o turno.';
    END IF;

    UPDATE shifts
       SET status = 'FECHADO',
           closed_by = v_uid,
           closed_at = NOW(),
           closing_notes = p_closing_notes,
           cash_drawer_end = p_cash_end,
           updated_at = NOW(),
           updated_by = v_uid::TEXT,
           version = version + 1
     WHERE id = p_shift_id AND status = 'ABERTO';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Turno não encontrado ou já encerrado.';
    END IF;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (p_shift_id, v_uid, 'FECHAMENTO_TURNO', 'shifts', p_shift_id::TEXT,
            jsonb_build_object('cash_drawer_end', p_cash_end, 'notes', p_closing_notes));
END;
$$;

CREATE OR REPLACE FUNCTION toggle_exhaustion(
    p_shift_id UUID,
    p_product_id UUID,
    p_is_exhausted BOOLEAN,
    p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'CHURRASQUEIRA', 'COZINHA', 'BAR']::app_role[]);
BEGIN
    PERFORM toggle_product_exhaustion(p_shift_id, p_product_id, p_is_exhausted, v_uid, p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION adjust_stock(
    p_shift_id UUID,
    p_product_id UUID,
    p_physical_count INT,
    p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
BEGIN
    PERFORM adjust_stock_physical_count(p_shift_id, p_product_id, p_physical_count, p_reason, v_uid);
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. COMANDAS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION open_tab_atomic(
    p_tab_id UUID,
    p_shift_id UUID,
    p_table_id UUID,
    p_customer_name TEXT,
    p_people_count INT,
    p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'GARCOM', 'CAIXA']::app_role[]);
    v_table RECORD;
    v_tab tabs;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM shifts WHERE id = p_shift_id AND status = 'ABERTO') THEN
        RAISE EXCEPTION 'Turno inválido ou encerrado.';
    END IF;

    SELECT * INTO v_table FROM restaurant_tables WHERE id = p_table_id AND active FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Mesa não encontrada.';
    END IF;

    IF EXISTS (SELECT 1 FROM tabs WHERE table_id = p_table_id AND status = 'OPEN') THEN
        RAISE EXCEPTION 'A Mesa % já possui uma comanda aberta.', v_table.number;
    END IF;

    INSERT INTO tabs (id, shift_id, table_id, customer_name, people_count, status, opened_by, notes, updated_by)
    VALUES (
        COALESCE(p_tab_id, gen_random_uuid()),
        p_shift_id,
        p_table_id,
        COALESCE(NULLIF(TRIM(p_customer_name), ''), 'Mesa ' || v_table.number),
        GREATEST(1, COALESCE(p_people_count, 1)),
        'OPEN',
        v_uid,
        NULLIF(p_notes, ''),
        v_uid::TEXT
    )
    RETURNING * INTO v_tab;

    UPDATE restaurant_tables SET status = 'OCUPADA', updated_by = v_uid::TEXT WHERE id = p_table_id;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (p_shift_id, v_uid, 'ABRIR_COMANDA', 'tabs', v_tab.id::TEXT,
            jsonb_build_object('table_number', v_table.number, 'customer_name', v_tab.customer_name));

    RETURN to_jsonb(v_tab);
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. PEDIDOS (substitui a versão da 00002 que confiava em p_user_id)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS create_order_atomic(UUID, UUID, UUID, JSONB, TEXT, TEXT);

CREATE OR REPLACE FUNCTION create_order_atomic(
    p_order_id UUID,
    p_shift_id UUID,
    p_tab_id UUID,
    p_items JSONB, -- [{ id?, product_id, quantity, doneness?, notes? }]
    p_idempotency_key TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'GARCOM', 'CAIXA']::app_role[]);
    v_order orders;
    v_table_id UUID;
    v_item JSONB;
    v_product RECORD;
    v_stock RECORD;
    v_qty INT;
    v_doneness meat_doneness;
    v_new_balance INT;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_order FROM orders WHERE idempotency_key = p_idempotency_key;
        IF FOUND THEN
            RETURN jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'duplicate', true);
        END IF;
    END IF;

    IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'O pedido precisa ter pelo menos um item.';
    END IF;

    SELECT table_id INTO v_table_id FROM tabs WHERE id = p_tab_id AND status = 'OPEN' AND shift_id = p_shift_id FOR UPDATE;
    IF v_table_id IS NULL THEN
        RAISE EXCEPTION 'Comanda inválida ou já finalizada.';
    END IF;

    INSERT INTO orders (id, shift_id, tab_id, table_id, status, notes, idempotency_key, created_by, updated_by)
    VALUES (COALESCE(p_order_id, gen_random_uuid()), p_shift_id, p_tab_id, v_table_id, 'CONFIRMED',
            p_notes, p_idempotency_key, v_uid, v_uid::TEXT)
    RETURNING * INTO v_order;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty := (v_item->>'quantity')::INT;
        IF v_qty IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'Quantidade do item deve ser maior que zero.';
        END IF;

        SELECT * INTO v_product FROM products WHERE id = (v_item->>'product_id')::UUID;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Produto não encontrado.';
        END IF;
        IF NOT v_product.active THEN
            RAISE EXCEPTION 'Produto % está inativo no cardápio.', v_product.name;
        END IF;

        IF v_product.allows_doneness AND (v_item->>'doneness') IS NOT NULL THEN
            v_doneness := (v_item->>'doneness')::meat_doneness;
        ELSE
            v_doneness := NULL;
        END IF;

        IF v_product.tracks_stock THEN
            SELECT * INTO v_stock FROM daily_prep_stock
             WHERE shift_id = p_shift_id AND product_id = v_product.id
             FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Produto "%" não foi lançado na produção deste turno.', v_product.name;
            END IF;
            IF v_stock.is_exhausted THEN
                RAISE EXCEPTION 'Produto "%" está marcado como ESGOTADO.', v_product.name;
            END IF;
            IF v_stock.current_quantity < v_qty THEN
                RAISE EXCEPTION 'Estoque insuficiente para "%". Disponível: %, Solicitado: %',
                    v_product.name, v_stock.current_quantity, v_qty;
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

            INSERT INTO stock_movements (shift_id, product_id, quantity, movement_type,
                                         previous_balance, new_balance, order_id, reason, user_id)
            VALUES (p_shift_id, v_product.id, -v_qty, 'VENDA',
                    v_stock.current_quantity, v_new_balance, v_order.id, 'Venda Mesa', v_uid);
        END IF;

        INSERT INTO order_items (id, order_id, shift_id, product_id, product_name, unit_price,
                                 quantity, doneness, notes, sector, status, updated_by)
        VALUES (COALESCE((v_item->>'id')::UUID, gen_random_uuid()), v_order.id, p_shift_id, v_product.id,
                v_product.name, v_product.price, v_qty, v_doneness, v_item->>'notes',
                v_product.sector, 'RECEIVED', v_uid::TEXT);
    END LOOP;

    PERFORM recalc_tab_totals(p_tab_id);

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (p_shift_id, v_uid, 'CRIAR_PEDIDO', 'orders', v_order.id::TEXT,
            jsonb_build_object('tab_id', p_tab_id, 'items_count', jsonb_array_length(p_items)));

    RETURN jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'duplicate', false);
END;
$$;

DROP FUNCTION IF EXISTS cancel_order_item_atomic(UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION cancel_order_item_atomic(
    p_order_item_id UUID,
    p_reason TEXT
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

    SELECT * INTO v_product FROM products WHERE id = v_item.product_id;

    IF v_product.tracks_stock THEN
        SELECT * INTO v_stock FROM daily_prep_stock
         WHERE shift_id = v_item.shift_id AND product_id = v_item.product_id
         FOR UPDATE;

        IF FOUND THEN
            IF v_item.status = 'RECEIVED' THEN
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
                        v_item.id, 'Cancelamento antes do preparo: ' || p_reason, v_uid);
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

CREATE OR REPLACE FUNCTION update_order_item_status(
    p_order_item_id UUID,
    p_status order_item_status,
    p_expected_version INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'GARCOM', 'CAIXA', 'CHURRASQUEIRA', 'COZINHA', 'BAR']::app_role[]);
    v_item order_items;
    v_prev_status order_item_status;
BEGIN
    IF p_status = 'CANCELLED' THEN
        RAISE EXCEPTION 'Use cancel_order_item_atomic para cancelar itens.';
    END IF;

    SELECT * INTO v_item FROM order_items WHERE id = p_order_item_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item do pedido não encontrado.';
    END IF;
    IF v_item.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'Item cancelado não pode mudar de status.';
    END IF;
    IF p_expected_version IS NOT NULL AND v_item.version <> p_expected_version THEN
        RAISE EXCEPTION 'CONFLITO: o item foi alterado em outro aparelho (versão % ≠ %).',
            v_item.version, p_expected_version USING ERRCODE = '40001';
    END IF;
    IF v_item.status = p_status THEN
        RETURN to_jsonb(v_item);
    END IF;
    v_prev_status := v_item.status;

    UPDATE order_items
       SET status = p_status,
           prepared_at = CASE WHEN p_status = 'READY' THEN NOW() ELSE prepared_at END,
           delivered_at = CASE WHEN p_status = 'DELIVERED' THEN NOW() ELSE delivered_at END,
           updated_by = v_uid::TEXT
     WHERE id = p_order_item_id
    RETURNING * INTO v_item;

    INSERT INTO order_item_status_history (order_item_id, from_status, to_status, changed_by)
    VALUES (p_order_item_id, v_prev_status, p_status, v_uid);

    PERFORM recompute_order_status(v_item.order_id);
    RETURN to_jsonb(v_item);
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. CONTA / PAGAMENTOS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION request_bill(p_table_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'GARCOM', 'CAIXA']::app_role[]);
BEGIN
    UPDATE restaurant_tables
       SET status = 'AGUARDANDO_CONTA', updated_by = v_uid::TEXT
     WHERE id = p_table_id
       AND EXISTS (SELECT 1 FROM tabs WHERE table_id = p_table_id AND status = 'OPEN');
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Mesa sem comanda aberta.';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION update_tab_adjustments(
    p_tab_id UUID,
    p_service_fee_enabled BOOLEAN,
    p_discount NUMERIC(10, 2)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'CAIXA']::app_role[]);
    v_old tabs;
    v_new tabs;
BEGIN
    SELECT * INTO v_old FROM tabs WHERE id = p_tab_id AND status = 'OPEN' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Comanda não encontrada ou já encerrada.';
    END IF;

    UPDATE tabs
       SET service_fee_enabled = p_service_fee_enabled,
           discount = GREATEST(0, COALESCE(p_discount, discount))
     WHERE id = p_tab_id;

    PERFORM recalc_tab_totals(p_tab_id);
    SELECT * INTO v_new FROM tabs WHERE id = p_tab_id;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (v_old.shift_id, v_uid, 'AJUSTE_CONTA', 'tabs', p_tab_id::TEXT,
            jsonb_build_object('service_fee', v_old.service_fee, 'discount', v_old.discount, 'total', v_old.total),
            jsonb_build_object('service_fee', v_new.service_fee, 'discount', v_new.discount, 'total', v_new.total));

    RETURN to_jsonb(v_new);
END;
$$;

CREATE OR REPLACE FUNCTION add_payment_atomic(
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
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'CAIXA']::app_role[]);
    v_tab tabs;
    v_payment payments;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'O valor do pagamento deve ser maior que zero.';
    END IF;

    SELECT * INTO v_tab FROM tabs WHERE id = p_tab_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Comanda não encontrada.';
    END IF;
    IF v_tab.status <> 'OPEN' THEN
        RAISE EXCEPTION 'Comanda já encerrada.';
    END IF;

    INSERT INTO payments (id, shift_id, tab_id, amount, method, status, notes, received_by)
    VALUES (COALESCE(p_payment_id, gen_random_uuid()), v_tab.shift_id, p_tab_id, ROUND(p_amount, 2),
            p_method, 'PAID', p_notes, v_uid)
    RETURNING * INTO v_payment;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (v_tab.shift_id, v_uid, 'REGISTRAR_PAGAMENTO', 'payments', v_payment.id::TEXT,
            jsonb_build_object('tab_id', p_tab_id, 'amount', v_payment.amount, 'method', p_method));

    RETURN to_jsonb(v_payment);
END;
$$;

CREATE OR REPLACE FUNCTION cancel_payment(p_payment_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'CAIXA']::app_role[]);
    v_payment payments;
BEGIN
    SELECT * INTO v_payment FROM payments WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pagamento não encontrado.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM tabs WHERE id = v_payment.tab_id AND status = 'OPEN') THEN
        RAISE EXCEPTION 'Não é possível remover pagamento de uma comanda já fechada.';
    END IF;

    UPDATE payments SET status = 'CANCELLED' WHERE id = p_payment_id;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (v_payment.shift_id, v_uid, 'CANCELAR_PAGAMENTO', 'payments', p_payment_id::TEXT,
            jsonb_build_object('amount', v_payment.amount, 'method', v_payment.method),
            jsonb_build_object('reason', p_reason));
END;
$$;

CREATE OR REPLACE FUNCTION close_tab_atomic(p_tab_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'CAIXA']::app_role[]);
    v_tab tabs;
    v_paid NUMERIC(10, 2);
BEGIN
    SELECT * INTO v_tab FROM tabs WHERE id = p_tab_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Comanda não encontrada.';
    END IF;
    IF v_tab.status <> 'OPEN' THEN
        RAISE EXCEPTION 'Esta comanda já foi encerrada anteriormente.';
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM payments WHERE tab_id = p_tab_id AND status = 'PAID';
    IF v_paid < v_tab.total THEN
        RAISE EXCEPTION 'Pagamento insuficiente. Total devido: R$ %, Total pago: R$ %.', v_tab.total, v_paid;
    END IF;

    UPDATE tabs
       SET status = 'CLOSED', closed_by = v_uid, closed_at = NOW(), updated_by = v_uid::TEXT
     WHERE id = p_tab_id
    RETURNING * INTO v_tab;

    UPDATE orders SET status = 'CLOSED', updated_by = v_uid::TEXT WHERE tab_id = p_tab_id AND status <> 'CANCELLED';
    UPDATE restaurant_tables SET status = 'LIVRE', updated_by = v_uid::TEXT WHERE id = v_tab.table_id;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (v_tab.shift_id, v_uid, 'FECHAR_COMANDA', 'tabs', p_tab_id::TEXT,
            jsonb_build_object('total', v_tab.total, 'paid', v_paid));

    RETURN to_jsonb(v_tab);
END;
$$;

CREATE OR REPLACE FUNCTION reopen_tab_atomic(p_tab_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_tab tabs;
BEGIN
    IF COALESCE(TRIM(p_reason), '') = '' THEN
        RAISE EXCEPTION 'Informe o motivo da reabertura.';
    END IF;

    SELECT * INTO v_tab FROM tabs WHERE id = p_tab_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Comanda não encontrada.';
    END IF;
    IF v_tab.status <> 'CLOSED' THEN
        RAISE EXCEPTION 'Apenas comandas fechadas podem ser reabertas.';
    END IF;
    IF EXISTS (SELECT 1 FROM tabs WHERE table_id = v_tab.table_id AND status = 'OPEN') THEN
        RAISE EXCEPTION 'A mesa já possui outra comanda aberta.';
    END IF;

    UPDATE tabs
       SET status = 'OPEN', closed_by = NULL, closed_at = NULL, updated_by = v_uid::TEXT
     WHERE id = p_tab_id
    RETURNING * INTO v_tab;

    UPDATE restaurant_tables SET status = 'OCUPADA', updated_by = v_uid::TEXT WHERE id = v_tab.table_id;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (v_tab.shift_id, v_uid, 'REABRIR_COMANDA', 'tabs', p_tab_id::TEXT,
            jsonb_build_object('reason', p_reason));

    RETURN to_jsonb(v_tab);
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. PERMISSÕES DE EXECUÇÃO
-- ----------------------------------------------------------------------------
-- Funções internas (aceitam p_user_id arbitrário): ninguém chama diretamente.
REVOKE ALL ON FUNCTION open_shift_with_stock(TEXT, UUID, TEXT, NUMERIC, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION toggle_product_exhaustion(UUID, UUID, BOOLEAN, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION adjust_stock_physical_count(UUID, UUID, INT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION recalc_tab_totals(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION recompute_order_status(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION handle_new_auth_user() FROM PUBLIC, anon, authenticated;

-- API pública do app (somente usuários autenticados)
DO $$
DECLARE
    fn TEXT;
BEGIN
    FOREACH fn IN ARRAY ARRAY[
        'open_shift(TEXT, TEXT, NUMERIC, JSONB)',
        'close_shift(UUID, TEXT, NUMERIC)',
        'toggle_exhaustion(UUID, UUID, BOOLEAN, TEXT)',
        'adjust_stock(UUID, UUID, INT, TEXT)',
        'open_tab_atomic(UUID, UUID, UUID, TEXT, INT, TEXT)',
        'create_order_atomic(UUID, UUID, UUID, JSONB, TEXT, TEXT)',
        'cancel_order_item_atomic(UUID, TEXT)',
        'update_order_item_status(UUID, order_item_status, INT)',
        'request_bill(UUID)',
        'update_tab_adjustments(UUID, BOOLEAN, NUMERIC)',
        'add_payment_atomic(UUID, UUID, NUMERIC, payment_method, TEXT)',
        'cancel_payment(UUID, TEXT)',
        'close_tab_atomic(UUID)',
        'reopen_tab_atomic(UUID, TEXT)',
        'require_role(app_role[])'
    ]
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 8. RLS: remove escrita direta (tudo passa pelas RPCs acima)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff can update table status" ON restaurant_tables;
DROP POLICY IF EXISTS "Public read for tables" ON restaurant_tables;

DROP POLICY IF EXISTS "Staff can view and manage tabs" ON tabs;
CREATE POLICY "Staff can view tabs" ON tabs FOR SELECT TO authenticated
    USING (current_user_role() IS NOT NULL);

DROP POLICY IF EXISTS "Staff can view and create orders" ON orders;
CREATE POLICY "Staff can view orders" ON orders FOR SELECT TO authenticated
    USING (current_user_role() IS NOT NULL);

DROP POLICY IF EXISTS "Staff can update order items status" ON order_items;

DROP POLICY IF EXISTS "Cashier, Gerente and Master can register payments" ON payments;

DROP POLICY IF EXISTS "Master and Gerente can manage shifts" ON shifts;

-- Usuário sempre pode ler o próprio perfil (necessário para login de perfil inativo)
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile" ON profiles FOR SELECT TO authenticated
    USING (id = auth.uid());

-- Fila de impressão: equipe ativa lê/escreve
DROP POLICY IF EXISTS "Staff manage print queue" ON print_queue;
CREATE POLICY "Staff manage print queue" ON print_queue FOR ALL TO authenticated
    USING (current_user_role() IS NOT NULL)
    WITH CHECK (current_user_role() IS NOT NULL);

-- ----------------------------------------------------------------------------
-- 9. REALTIME: publicação + payload completo em DELETE/UPDATE
-- ----------------------------------------------------------------------------
ALTER TABLE restaurant_tables REPLICA IDENTITY FULL;
ALTER TABLE tabs REPLICA IDENTITY FULL;
ALTER TABLE orders REPLICA IDENTITY FULL;
ALTER TABLE order_items REPLICA IDENTITY FULL;
ALTER TABLE payments REPLICA IDENTITY FULL;
ALTER TABLE daily_prep_stock REPLICA IDENTITY FULL;
ALTER TABLE shifts REPLICA IDENTITY FULL;

DO $$
DECLARE
    t TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        FOREACH t IN ARRAY ARRAY['restaurant_tables', 'tabs', 'orders', 'order_items', 'payments', 'daily_prep_stock', 'shifts', 'products']
        LOOP
            IF NOT EXISTS (
                SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
            ) THEN
                EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
            END IF;
        END LOOP;
    END IF;
END $$;
