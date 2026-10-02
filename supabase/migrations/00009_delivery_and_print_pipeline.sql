-- ============================================================================
-- MIGRATION 00009: DELIVERY PÚBLICO (CARDÁPIO DIGITAL) + FILA DE IMPRESSÃO REAL
-- ----------------------------------------------------------------------------
-- * Cupons de produção são gerados DENTRO do banco, na mesma transação do
--   pedido (salão e delivery). Nenhum cupom depende do celular do garçom.
-- * O printer-bridge (PC da loja) consome a fila com claim_print_jobs /
--   complete_print_job usando a service_role.
-- * Cardápio digital público (anon) via get_public_menu / place_delivery_order,
--   com preço, taxa e estoque validados no servidor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FILA DE IMPRESSÃO: colunas de controle
-- ----------------------------------------------------------------------------
ALTER TABLE print_queue
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'ORDER'
      CHECK (kind IN ('ORDER', 'CANCEL', 'DELIVERY_SUMMARY', 'TEST')),
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed_by TEXT,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS printer TEXT;

ALTER TABLE print_queue DROP CONSTRAINT IF EXISTS print_queue_origin_check;
ALTER TABLE print_queue ADD CONSTRAINT print_queue_origin_check
  CHECK (origin IN ('SALAO', 'DELIVERY', 'SISTEMA'));

CREATE INDEX IF NOT EXISTS idx_print_queue_pending ON print_queue(status, next_attempt_at);

-- ----------------------------------------------------------------------------
-- 2. DELIVERY: zonas, pedidos e itens
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS delivery_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    fee NUMERIC(10, 2) NOT NULL CHECK (fee >= 0),
    active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO delivery_zones (name, fee, display_order) VALUES
    ('Centro', 5.00, 1),
    ('Jardim das Américas', 7.00, 2),
    ('Bairro Alto', 8.00, 3),
    ('Vila Nova', 6.00, 4),
    ('Morumbi', 9.00, 5),
    ('Parque Residencial', 7.50, 6),
    ('Outros Bairros', 10.00, 7)
ON CONFLICT (name) DO NOTHING;

CREATE SEQUENCE IF NOT EXISTS delivery_order_number_seq START 1001;

CREATE TABLE IF NOT EXISTS delivery_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number INTEGER NOT NULL DEFAULT nextval('delivery_order_number_seq') UNIQUE,
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address_street TEXT NOT NULL,
    address_number TEXT NOT NULL,
    address_neighborhood TEXT NOT NULL,
    address_complement TEXT,
    address_reference TEXT,
    delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
    subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    total NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('PIX', 'DINHEIRO', 'CARTAO_ENTREGA')),
    cash_change_for NUMERIC(10, 2),
    status TEXT NOT NULL DEFAULT 'CONFIRMED'
        CHECK (status IN ('PENDING', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED')),
    notes TEXT,
    driver_name TEXT,
    cancel_reason TEXT,
    idempotency_key TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    dispatched_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT,
    version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_delivery_orders_shift ON delivery_orders(shift_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_status ON delivery_orders(status);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_phone ON delivery_orders(phone, created_at);

CREATE TABLE IF NOT EXISTS delivery_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_order_id UUID NOT NULL REFERENCES delivery_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name TEXT NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    doneness meat_doneness,
    notes TEXT,
    sector production_sector NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_items_order ON delivery_order_items(delivery_order_id);

DROP TRIGGER IF EXISTS update_delivery_orders_updated_at ON delivery_orders;
CREATE TRIGGER update_delivery_orders_updated_at
  BEFORE UPDATE ON delivery_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS increment_delivery_orders_version ON delivery_orders;
CREATE TRIGGER increment_delivery_orders_version
  BEFORE UPDATE ON delivery_orders FOR EACH ROW EXECUTE FUNCTION increment_version();

ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active zones" ON delivery_zones;
CREATE POLICY "Public read active zones" ON delivery_zones FOR SELECT TO anon, authenticated USING (active);

DROP POLICY IF EXISTS "Staff read delivery orders" ON delivery_orders;
CREATE POLICY "Staff read delivery orders" ON delivery_orders FOR SELECT TO authenticated
    USING (current_user_role() IS NOT NULL);

DROP POLICY IF EXISTS "Staff read delivery items" ON delivery_order_items;
CREATE POLICY "Staff read delivery items" ON delivery_order_items FOR SELECT TO authenticated
    USING (current_user_role() IS NOT NULL);

-- Fila de impressão: equipe só LÊ; escrita via funções
DROP POLICY IF EXISTS "Staff manage print queue" ON print_queue;
DROP POLICY IF EXISTS "Staff read print queue" ON print_queue;
CREATE POLICY "Staff read print queue" ON print_queue FOR SELECT TO authenticated
    USING (current_user_role() IS NOT NULL);

-- ----------------------------------------------------------------------------
-- 3. ENFILEIRAMENTO DE CUPONS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enqueue_print(
    p_kind TEXT,
    p_order_id UUID,
    p_order_number INT,
    p_sector production_sector,
    p_origin TEXT,
    p_table_number INT,
    p_customer_name TEXT,
    p_items JSONB,
    p_payload JSONB,
    p_idempotency_key TEXT,
    p_is_reprint BOOLEAN DEFAULT false,
    p_reprint_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO print_queue (kind, order_id, order_number, sector, origin, table_number, customer_name,
                             items, payload, status, idempotency_key, is_reprint, reprint_reason)
    VALUES (p_kind, p_order_id, p_order_number, p_sector, p_origin, p_table_number, p_customer_name,
            COALESCE(p_items, '[]'::jsonb), COALESCE(p_payload, '{}'::jsonb), 'PENDING',
            p_idempotency_key, p_is_reprint, p_reprint_reason)
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION auto_print_enabled()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((SELECT auto_print_orders FROM restaurant_settings LIMIT 1), true);
$$;

-- Pedido do SALÃO: disparado no COMMIT (DEFERRED), quando todos os itens já existem.
CREATE OR REPLACE FUNCTION trg_enqueue_order_prints()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r RECORD;
    v_table_number INT;
    v_customer TEXT;
    v_waiter TEXT;
BEGIN
    IF NOT auto_print_enabled() THEN
        RETURN NULL;
    END IF;

    SELECT number INTO v_table_number FROM restaurant_tables WHERE id = NEW.table_id;
    SELECT customer_name INTO v_customer FROM tabs WHERE id = NEW.tab_id;
    SELECT name INTO v_waiter FROM profiles WHERE id = NEW.created_by;

    FOR r IN
        SELECT sector,
               jsonb_agg(jsonb_build_object('name', product_name, 'quantity', quantity,
                                            'doneness', doneness, 'notes', notes) ORDER BY created_at, product_name) AS items
          FROM order_items
         WHERE order_id = NEW.id AND sector <> 'NONE' AND status <> 'CANCELLED'
         GROUP BY sector
    LOOP
        PERFORM enqueue_print('ORDER', NEW.id, NEW.order_number, r.sector, 'SALAO', v_table_number, v_customer,
                              r.items, jsonb_build_object('waiter', v_waiter, 'order_notes', NEW.notes),
                              'ORD-' || NEW.id || '-' || r.sector);
    END LOOP;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_order_prints ON orders;
CREATE CONSTRAINT TRIGGER enqueue_order_prints
    AFTER INSERT ON orders
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION trg_enqueue_order_prints();

-- Cancelamento de item já enviado à produção: imprime aviso no setor
CREATE OR REPLACE FUNCTION trg_enqueue_item_cancel_print()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_table_number INT;
    v_reason TEXT;
BEGIN
    IF NEW.status <> 'CANCELLED' OR OLD.status = 'CANCELLED' OR OLD.status = 'DELIVERED' OR NEW.sector = 'NONE' THEN
        RETURN NULL;
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = NEW.order_id;
    SELECT number INTO v_table_number FROM restaurant_tables WHERE id = v_order.table_id;
    SELECT notes INTO v_reason FROM order_item_status_history
     WHERE order_item_id = NEW.id AND to_status = 'CANCELLED' ORDER BY created_at DESC LIMIT 1;

    PERFORM enqueue_print('CANCEL', NEW.order_id, v_order.order_number, NEW.sector, 'SALAO', v_table_number, NULL,
                          jsonb_build_array(jsonb_build_object('name', NEW.product_name, 'quantity', NEW.quantity,
                                                               'doneness', NEW.doneness, 'notes', NEW.notes)),
                          jsonb_build_object('reason', v_reason, 'previous_status', OLD.status),
                          'CANCEL-' || NEW.id);
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_item_cancel_print ON order_items;
CREATE CONSTRAINT TRIGGER enqueue_item_cancel_print
    AFTER UPDATE OF status ON order_items
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION trg_enqueue_item_cancel_print();

-- ----------------------------------------------------------------------------
-- 4. CARDÁPIO PÚBLICO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_public_menu()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_shift_id UUID;
BEGIN
    SELECT id INTO v_shift_id FROM shifts WHERE status = 'ABERTO' ORDER BY opened_at DESC LIMIT 1;

    RETURN jsonb_build_object(
        'is_open', v_shift_id IS NOT NULL,
        'shift_id', v_shift_id,
        'restaurant', (SELECT jsonb_build_object('name', name, 'phone', phone, 'address', address,
                                                 'pix_key', pix_key, 'pix_key_type', pix_key_type,
                                                 'pix_merchant_name', pix_merchant_name, 'pix_merchant_city', pix_merchant_city)
                         FROM restaurant_settings LIMIT 1),
        'zones', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', name, 'fee', fee) ORDER BY display_order, name)
                             FROM delivery_zones WHERE active), '[]'::jsonb),
        'categories', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.display_order)
                                  FROM categories c WHERE c.active), '[]'::jsonb),
        'products', COALESCE((
            SELECT jsonb_agg(to_jsonb(p) || jsonb_build_object(
                       'stock_available', CASE WHEN p.tracks_stock THEN COALESCE(s.current_quantity, 0) END,
                       'is_exhausted', CASE WHEN p.tracks_stock THEN (s.id IS NULL OR s.is_exhausted OR s.current_quantity <= 0) ELSE NOT p.available END
                   ) ORDER BY p.display_order, p.name)
              FROM products p
              LEFT JOIN daily_prep_stock s ON s.product_id = p.id AND s.shift_id = v_shift_id
             WHERE p.active), '[]'::jsonb)
    );
END;
$$;

-- Baixa de estoque reutilizável (com lock de linha)
CREATE OR REPLACE FUNCTION consume_stock_for_sale(
    p_shift_id UUID,
    p_product_id UUID,
    p_qty INT,
    p_user_id UUID,
    p_order_id UUID,
    p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_stock RECORD;
    v_name TEXT;
    v_new INT;
BEGIN
    SELECT name INTO v_name FROM products WHERE id = p_product_id;
    SELECT * INTO v_stock FROM daily_prep_stock
     WHERE shift_id = p_shift_id AND product_id = p_product_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto "%" não está disponível hoje.', v_name;
    END IF;
    IF v_stock.is_exhausted OR v_stock.current_quantity < p_qty THEN
        RAISE EXCEPTION 'Produto "%" esgotado ou sem quantidade suficiente (disponível: %).', v_name, v_stock.current_quantity;
    END IF;

    v_new := v_stock.current_quantity - p_qty;
    UPDATE daily_prep_stock
       SET current_quantity = v_new,
           consumed_quantity = consumed_quantity + p_qty,
           is_exhausted = (v_new = 0) OR is_exhausted,
           exhausted_at = CASE WHEN v_new = 0 THEN NOW() ELSE exhausted_at END
     WHERE id = v_stock.id;

    IF v_new = 0 THEN
        UPDATE products SET available = false WHERE id = p_product_id;
    END IF;

    INSERT INTO stock_movements (shift_id, product_id, quantity, movement_type, previous_balance, new_balance,
                                 order_id, reason, user_id)
    VALUES (p_shift_id, p_product_id, -p_qty, 'VENDA', v_stock.current_quantity, v_new, p_order_id, p_reason, p_user_id);
END;
$$;

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
    IF length(v_street) < 3 OR length(v_number) < 1 THEN RAISE EXCEPTION 'Informe o endereço completo.'; END IF;
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

    SELECT fee INTO v_fee FROM delivery_zones WHERE name = v_zone AND active;
    IF v_fee IS NULL THEN RAISE EXCEPTION 'Bairro não atendido. Selecione um bairro da lista.'; END IF;

    INSERT INTO delivery_orders (shift_id, customer_name, phone, address_street, address_number, address_neighborhood,
                                 address_complement, address_reference, delivery_fee, payment_method, cash_change_for,
                                 status, notes, confirmed_at, idempotency_key)
    VALUES (v_shift.id, v_name, v_phone, v_street, v_number, v_zone,
            NULLIF(LEFT(TRIM(COALESCE(p_order->>'address_complement', '')), 80), ''),
            NULLIF(LEFT(TRIM(COALESCE(p_order->>'address_reference', '')), 120), ''),
            v_fee, v_payment, CASE WHEN v_payment = 'DINHEIRO' THEN v_change END,
            'CONFIRMED', NULLIF(LEFT(TRIM(COALESCE(p_order->>'notes', '')), 300), ''), NOW(), v_idem)
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
                                           'Venda Delivery #' || v_order.order_number);
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
                                  jsonb_build_object('neighborhood', v_order.address_neighborhood),
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
                              'subtotal', v_order.subtotal, 'delivery_fee', v_order.delivery_fee, 'duplicate', false);
END;
$$;

-- Acompanhamento pelo cliente (exige o telefone do pedido)
CREATE OR REPLACE FUNCTION get_delivery_order_status(p_order_id UUID, p_phone TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object('order_number', order_number, 'status', status, 'total', total,
                              'created_at', created_at, 'dispatched_at', dispatched_at,
                              'delivered_at', delivered_at, 'driver_name', driver_name)
      FROM delivery_orders
     WHERE id = p_order_id AND phone = regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
$$;

-- ----------------------------------------------------------------------------
-- 5. GESTÃO DO DELIVERY PELA EQUIPE
-- ----------------------------------------------------------------------------
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
    IF p_status NOT IN ('CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED') THEN
        RAISE EXCEPTION 'Status inválido. Para cancelar use cancel_delivery_order.';
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

CREATE OR REPLACE FUNCTION cancel_delivery_order(p_order_id UUID, p_reason TEXT)
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

    -- Devolve ao estoque apenas se ainda não entrou em preparo
    v_return := v_order.status IN ('PENDING', 'CONFIRMED');

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
                              v_order.customer_name, r.items, jsonb_build_object('reason', p_reason),
                              'DLV-CANCEL-' || p_order_id || '-' || r.sector);
    END LOOP;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (v_order.shift_id, v_uid, 'CANCELAR_DELIVERY', 'delivery_orders', p_order_id::TEXT,
            jsonb_build_object('reason', p_reason, 'returned_to_stock', v_return));
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. OPERAÇÃO DA FILA PELA EQUIPE (reimprimir, tentar de novo, teste)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reprint_print_job(p_job_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'CAIXA', 'GARCOM', 'CHURRASQUEIRA', 'COZINHA', 'BAR']::app_role[]);
    v_job print_queue;
BEGIN
    SELECT * INTO v_job FROM print_queue WHERE id = p_job_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cupom não encontrado.'; END IF;

    RETURN enqueue_print(v_job.kind, v_job.order_id, v_job.order_number, v_job.sector, v_job.origin,
                         v_job.table_number, v_job.customer_name, v_job.items, v_job.payload,
                         v_job.idempotency_key || '-REP-' || extract(epoch FROM clock_timestamp())::BIGINT,
                         true, COALESCE(NULLIF(TRIM(p_reason), ''), 'Reimpressão solicitada'));
END;
$$;

CREATE OR REPLACE FUNCTION retry_print_job(p_job_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'CAIXA', 'GARCOM', 'CHURRASQUEIRA', 'COZINHA', 'BAR']::app_role[]);
BEGIN
    UPDATE print_queue SET status = 'PENDING', next_attempt_at = NOW(), last_error = NULL, attempts = 0
     WHERE id = p_job_id AND status = 'FAILED';
    IF NOT FOUND THEN RAISE EXCEPTION 'Apenas cupons com falha podem ser reenviados.'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION enqueue_test_print(p_sector production_sector)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
BEGIN
    RETURN enqueue_print('TEST', gen_random_uuid(), 0, p_sector, 'SISTEMA', NULL, NULL,
                         jsonb_build_array(jsonb_build_object('name', 'Teste de impressão', 'quantity', 1)),
                         jsonb_build_object('requested_by', (SELECT name FROM profiles WHERE id = v_uid)),
                         'TEST-' || gen_random_uuid());
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. API DO PRINTER-BRIDGE (somente service_role)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_print_jobs(p_worker TEXT, p_limit INT DEFAULT 10)
RETURNS SETOF print_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    UPDATE print_queue q
       SET status = 'PRINTING',
           claimed_at = NOW(),
           claimed_by = p_worker,
           attempts = q.attempts + 1,
           updated_at = NOW(),
           -- Job que ficou "PRINTING" por muito tempo (bridge caiu no meio): sai como 2ª via
           is_reprint = q.is_reprint OR q.status = 'PRINTING',
           reprint_reason = CASE WHEN q.status = 'PRINTING'
                                 THEN 'Reenvio após queda do servidor de impressão (conferir duplicidade)'
                                 ELSE q.reprint_reason END
     WHERE q.id IN (
        SELECT id FROM print_queue
         WHERE (status = 'PENDING' AND next_attempt_at <= NOW())
            OR (status = 'PRINTING' AND claimed_at < NOW() - INTERVAL '2 minutes')
         ORDER BY created_at
         LIMIT GREATEST(1, LEAST(p_limit, 50))
         FOR UPDATE SKIP LOCKED
     )
    RETURNING q.*;
END;
$$;

CREATE OR REPLACE FUNCTION complete_print_job(p_job_id UUID, p_success BOOLEAN, p_error TEXT DEFAULT NULL, p_printer TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_max_attempts CONSTANT INT := 6;
BEGIN
    IF p_success THEN
        UPDATE print_queue
           SET status = 'PRINTED', printed_at = NOW(), last_error = NULL, printer = p_printer, updated_at = NOW()
         WHERE id = p_job_id;
    ELSE
        UPDATE print_queue
           SET status = CASE WHEN attempts >= v_max_attempts THEN 'FAILED'::print_status ELSE 'PENDING'::print_status END,
               last_error = LEFT(p_error, 500),
               printer = p_printer,
               -- backoff: 5s, 10s, 20s, 40s, 60s...
               next_attempt_at = NOW() + LEAST(INTERVAL '60 seconds', INTERVAL '5 seconds' * power(2, GREATEST(attempts - 1, 0))),
               updated_at = NOW()
         WHERE id = p_job_id;
    END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. PERMISSÕES
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION enqueue_print(TEXT, UUID, INT, production_sector, TEXT, INT, TEXT, JSONB, JSONB, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION consume_stock_for_sale(UUID, UUID, INT, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION trg_enqueue_order_prints() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION trg_enqueue_item_cancel_print() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION claim_print_jobs(TEXT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION complete_print_job(UUID, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_print_jobs(TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION complete_print_job(UUID, BOOLEAN, TEXT, TEXT) TO service_role;

-- Públicas (cardápio digital)
REVOKE ALL ON FUNCTION get_public_menu() FROM PUBLIC;
REVOKE ALL ON FUNCTION place_delivery_order(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_delivery_order_status(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_menu() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION place_delivery_order(JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_delivery_order_status(UUID, TEXT) TO anon, authenticated;

-- Equipe
DO $$
DECLARE
    fn TEXT;
BEGIN
    FOREACH fn IN ARRAY ARRAY[
        'update_delivery_status(UUID, TEXT, TEXT)',
        'cancel_delivery_order(UUID, TEXT)',
        'reprint_print_job(UUID, TEXT)',
        'retry_print_job(UUID)',
        'enqueue_test_print(production_sector)'
    ]
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 9. REALTIME
-- ----------------------------------------------------------------------------
ALTER TABLE print_queue REPLICA IDENTITY FULL;
ALTER TABLE delivery_orders REPLICA IDENTITY FULL;

DO $$
DECLARE
    t TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        FOREACH t IN ARRAY ARRAY['print_queue', 'delivery_orders', 'delivery_order_items']
        LOOP
            IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
                EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
            END IF;
        END LOOP;
    END IF;
END $$;
