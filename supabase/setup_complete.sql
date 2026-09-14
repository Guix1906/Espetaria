-- ============================================================================
-- MIGRATION 00001: INITIAL SCHEMA FOR ESPETARIA SABOR DA CARNE
-- ============================================================================

-- Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. ENUMS
-- ----------------------------------------------------------------------------
CREATE TYPE app_role AS ENUM (
    'MASTER',
    'GERENTE',
    'GARCOM',
    'CHURRASQUEIRA',
    'COZINHA',
    'BAR',
    'CAIXA',
    'ENTREGADOR'
);

CREATE TYPE shift_status AS ENUM (
    'ABERTO',
    'FECHADO'
);

CREATE TYPE production_sector AS ENUM (
    'GRILL',
    'KITCHEN',
    'BAR',
    'NONE'
);

CREATE TYPE product_type AS ENUM (
    'ESPETO',
    'PORCAO',
    'BEBIDA',
    'SOBREMESA',
    'OUTROS'
);

CREATE TYPE stock_movement_type AS ENUM (
    'PRODUCAO',
    'VENDA',
    'CANCELAMENTO_RETORNO',
    'PERDA',
    'AJUSTE',
    'DESCARTE'
);

CREATE TYPE order_status AS ENUM (
    'OPEN',
    'CONFIRMED',
    'IN_PREPARATION',
    'PARTIALLY_READY',
    'READY',
    'DELIVERED',
    'CLOSED',
    'CANCELLED'
);

CREATE TYPE order_item_status AS ENUM (
    'RECEIVED',
    'IN_PREPARATION',
    'READY',
    'DELIVERED',
    'CANCELLED'
);

CREATE TYPE meat_doneness AS ENUM (
    'MAL_PASSADA',
    'AO_PONTO_PARA_MAL',
    'AO_PONTO',
    'AO_PONTO_PARA_BEM',
    'BEM_PASSADA'
);

CREATE TYPE table_status AS ENUM (
    'LIVRE',
    'OCUPADA',
    'AGUARDANDO_CONTA',
    'RESERVADA'
);

CREATE TYPE payment_method AS ENUM (
    'DINHEIRO',
    'PIX',
    'DEBITO',
    'CREDITO',
    'OUTROS'
);

CREATE TYPE payment_status AS ENUM (
    'PENDING',
    'PROCESSING',
    'PAID',
    'FAILED',
    'REFUNDED',
    'CANCELLED'
);

-- ----------------------------------------------------------------------------
-- 2. RESTAURANT SETTINGS
-- ----------------------------------------------------------------------------
CREATE TABLE restaurant_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL DEFAULT 'Espetaria Sabor da Carne',
    cnpj TEXT,
    phone TEXT,
    service_fee_percent NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
    allow_custom_service_fee BOOLEAN NOT NULL DEFAULT true,
    timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. USER PROFILES
-- ----------------------------------------------------------------------------
CREATE TABLE profiles (
    id UUID PRIMARY KEY, -- Maps to auth.users.id
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role app_role NOT NULL DEFAULT 'GARCOM',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_role ON profiles(role);

-- ----------------------------------------------------------------------------
-- 4. SHIFTS (TURNOS DE TRABALHO)
-- ----------------------------------------------------------------------------
CREATE TABLE shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    name TEXT NOT NULL, -- e.g. "14/09/2026 — Noite"
    status shift_status NOT NULL DEFAULT 'ABERTO',
    opened_by UUID NOT NULL REFERENCES profiles(id),
    closed_by UUID REFERENCES profiles(id),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    initial_notes TEXT,
    closing_notes TEXT,
    cash_drawer_start NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    cash_drawer_end NUMERIC(10, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shifts_status ON shifts(status);
CREATE INDEX idx_shifts_date ON shifts(date);

-- ----------------------------------------------------------------------------
-- 5. CATEGORIES & PRODUCTS
-- ----------------------------------------------------------------------------
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    image_url TEXT,
    active BOOLEAN NOT NULL DEFAULT true,       -- Pertence ao cardápio geral
    available BOOLEAN NOT NULL DEFAULT true,    -- Disponibilidade imediata (não esgotado)
    sector production_sector NOT NULL DEFAULT 'GRILL',
    type product_type NOT NULL DEFAULT 'ESPETO',
    tracks_stock BOOLEAN NOT NULL DEFAULT true, -- Exige controle de produção diária
    is_cubas BOOLEAN NOT NULL DEFAULT false,    -- Controlado por cubas gastronômicas
    portions_per_cuba INTEGER NOT NULL DEFAULT 1 CHECK (portions_per_cuba >= 1),
    allows_doneness BOOLEAN NOT NULL DEFAULT false, -- Requer seleção de ponto da carne
    allows_notes BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_sector ON products(sector);
CREATE INDEX idx_products_available ON products(available);
CREATE INDEX idx_products_active ON products(active);

-- ----------------------------------------------------------------------------
-- 6. DAILY PREPARATION STOCK (MISE EN PLACE DO TURNO)
-- ----------------------------------------------------------------------------
CREATE TABLE daily_prep_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    
    -- Quantidades e Fator de Cubas
    cubas_count NUMERIC(6, 2) DEFAULT 0,       -- Ex: 3.0 cubas
    portions_per_cuba INTEGER DEFAULT 1,       -- Ex: 15 porções por cuba
    initial_quantity INTEGER NOT NULL CHECK (initial_quantity >= 0), -- 3 * 15 = 45
    current_quantity INTEGER NOT NULL CHECK (current_quantity >= 0), -- Saldo real disponível (NUNCA NEGATIVO)
    
    -- Movimentações acumuladas para conciliação rápida
    reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
    consumed_quantity INTEGER NOT NULL DEFAULT 0 CHECK (consumed_quantity >= 0),
    discarded_quantity INTEGER NOT NULL DEFAULT 0 CHECK (discarded_quantity >= 0),
    adjusted_quantity INTEGER NOT NULL DEFAULT 0,
    
    -- Contagem física no fechamento
    last_counted_quantity INTEGER,
    count_difference INTEGER,
    
    -- Esgotamento manual imediato
    is_exhausted BOOLEAN NOT NULL DEFAULT false,
    exhausted_at TIMESTAMPTZ,
    exhausted_by UUID REFERENCES profiles(id),
    exhaust_reason TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_shift_product UNIQUE (shift_id, product_id)
);

CREATE INDEX idx_daily_prep_shift ON daily_prep_stock(shift_id);
CREATE INDEX idx_daily_prep_product ON daily_prep_stock(product_id);
CREATE INDEX idx_daily_prep_exhausted ON daily_prep_stock(is_exhausted);

-- ----------------------------------------------------------------------------
-- 7. STOCK MOVEMENTS (TRILHA DE AUDITORIA DE ESTOQUE)
-- ----------------------------------------------------------------------------
CREATE TABLE stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL, -- Positivo (+80 na produção) ou Negativo (-1 na venda)
    movement_type stock_movement_type NOT NULL,
    previous_balance INTEGER NOT NULL CHECK (previous_balance >= 0),
    new_balance INTEGER NOT NULL CHECK (new_balance >= 0),
    order_id UUID,             -- Ligação com o pedido (se aplicável)
    order_item_id UUID,        -- Ligação com o item (se aplicável)
    reason TEXT,               -- Motivo do ajuste/descarte/perda
    user_id UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stock_movements_shift ON stock_movements(shift_id);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX idx_stock_movements_type ON stock_movements(movement_type);

-- ----------------------------------------------------------------------------
-- 8. RESTAURANT TABLES & TABS (COMANDAS DE MESA)
-- ----------------------------------------------------------------------------
CREATE TABLE restaurant_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number INTEGER UNIQUE NOT NULL CHECK (number > 0),
    capacity INTEGER NOT NULL DEFAULT 4,
    status table_status NOT NULL DEFAULT 'LIVRE',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tables_status ON restaurant_tables(status);

CREATE TABLE tabs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
    table_id UUID NOT NULL REFERENCES restaurant_tables(id) ON DELETE RESTRICT,
    customer_name TEXT,
    people_count INTEGER NOT NULL DEFAULT 1 CHECK (people_count >= 1),
    status order_status NOT NULL DEFAULT 'OPEN',
    opened_by UUID NOT NULL REFERENCES profiles(id),
    closed_by UUID REFERENCES profiles(id),
    subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
    service_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (service_fee >= 0),
    discount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (discount >= 0),
    total NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (total >= 0),
    notes TEXT,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

CREATE INDEX idx_tabs_shift ON tabs(shift_id);
CREATE INDEX idx_tabs_table ON tabs(table_id);
CREATE INDEX idx_tabs_status ON tabs(status);

-- ----------------------------------------------------------------------------
-- 9. ORDERS & ORDER ITEMS
-- ----------------------------------------------------------------------------
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
    tab_id UUID NOT NULL REFERENCES tabs(id) ON DELETE RESTRICT,
    table_id UUID NOT NULL REFERENCES restaurant_tables(id) ON DELETE RESTRICT,
    order_number SERIAL,
    status order_status NOT NULL DEFAULT 'CONFIRMED',
    notes TEXT,
    idempotency_key TEXT UNIQUE, -- Garante que envio duplicado não crie 2 pedidos
    created_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_tab ON orders(tab_id);
CREATE INDEX idx_orders_shift ON orders(shift_id);
CREATE INDEX idx_orders_status ON orders(status);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name TEXT NOT NULL, -- Preserva histórico do nome se mudar depois
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0), -- Histórico do preço
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    doneness meat_doneness,     -- Ponto da carne (opcional conforme produto)
    notes TEXT,
    sector production_sector NOT NULL,
    status order_item_status NOT NULL DEFAULT 'RECEIVED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    prepared_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_sector ON order_items(sector);
CREATE INDEX idx_order_items_status ON order_items(status);
CREATE INDEX idx_order_items_shift ON order_items(shift_id);

CREATE TABLE order_item_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    from_status order_item_status NOT NULL,
    to_status order_item_status NOT NULL,
    changed_by UUID NOT NULL REFERENCES profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 10. PAYMENTS
-- ----------------------------------------------------------------------------
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
    tab_id UUID NOT NULL REFERENCES tabs(id) ON DELETE RESTRICT,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    method payment_method NOT NULL,
    status payment_status NOT NULL DEFAULT 'PAID',
    external_reference TEXT,     -- Código PIX E2E ou ID transação TEF
    notes TEXT,
    received_by UUID NOT NULL REFERENCES profiles(id),
    paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_tab ON payments(tab_id);
CREATE INDEX idx_payments_shift ON payments(shift_id);

-- ----------------------------------------------------------------------------
-- 11. AUDIT LOGS
-- ----------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,       -- Ex: 'ESGOTAR_PRODUTO', 'CANCELAR_ITEM', 'AJUSTAR_ESTOQUE'
    entity_type TEXT NOT NULL,  -- Ex: 'daily_prep_stock', 'order_item', 'tab'
    entity_id TEXT NOT NULL,
    old_data JSONB,
    new_data JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);


-- ==========================================

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


-- ==========================================

-- ============================================================================
-- MIGRATION 00003: ROW LEVEL SECURITY (RLS) & ACCESS CONTROL POLICIES
-- ============================================================================

-- Helper function to check user role from profiles table
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- ----------------------------------------------------------------------------
-- ENABLE RLS ON ALL OPERATIONAL TABLES
-- ----------------------------------------------------------------------------
ALTER TABLE restaurant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_prep_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 1. RESTAURANT SETTINGS
-- ----------------------------------------------------------------------------
CREATE POLICY "Public read for restaurant settings"
    ON restaurant_settings FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Only MASTER can update settings"
    ON restaurant_settings FOR ALL
    TO authenticated
    USING (current_user_role() = 'MASTER')
    WITH CHECK (current_user_role() = 'MASTER');

-- ----------------------------------------------------------------------------
-- 2. PROFILES
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view all staff profiles"
    ON profiles FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Master and Gerente can manage profiles"
    ON profiles FOR ALL
    TO authenticated
    USING (current_user_role() IN ('MASTER', 'GERENTE'))
    WITH CHECK (current_user_role() IN ('MASTER', 'GERENTE'));

-- ----------------------------------------------------------------------------
-- 3. SHIFTS
-- ----------------------------------------------------------------------------
CREATE POLICY "Staff can view shifts"
    ON shifts FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Master and Gerente can manage shifts"
    ON shifts FOR ALL
    TO authenticated
    USING (current_user_role() IN ('MASTER', 'GERENTE'))
    WITH CHECK (current_user_role() IN ('MASTER', 'GERENTE'));

-- ----------------------------------------------------------------------------
-- 4. CATEGORIES & PRODUCTS (Cardápio visível para todos e delivery)
-- ----------------------------------------------------------------------------
CREATE POLICY "Anyone can view active categories"
    ON categories FOR SELECT
    TO anon, authenticated
    USING (active = true);

CREATE POLICY "Master and Gerente can manage categories"
    ON categories FOR ALL
    TO authenticated
    USING (current_user_role() IN ('MASTER', 'GERENTE'))
    WITH CHECK (current_user_role() IN ('MASTER', 'GERENTE'));

CREATE POLICY "Anyone can view products"
    ON products FOR SELECT
    TO anon, authenticated
    USING (active = true);

CREATE POLICY "Master and Gerente can manage products"
    ON products FOR ALL
    TO authenticated
    USING (current_user_role() IN ('MASTER', 'GERENTE'))
    WITH CHECK (current_user_role() IN ('MASTER', 'GERENTE'));

-- ----------------------------------------------------------------------------
-- 5. DAILY PREP STOCK & MOVEMENTS
-- ----------------------------------------------------------------------------
CREATE POLICY "Staff can view daily prep stock"
    ON daily_prep_stock FOR SELECT
    TO authenticated
    USING (true);

-- Updates occur via SECURITY DEFINER functions (open_shift, create_order, toggle_exhaust)
CREATE POLICY "Only Master and Gerente can manually edit daily prep stock"
    ON daily_prep_stock FOR ALL
    TO authenticated
    USING (current_user_role() IN ('MASTER', 'GERENTE'))
    WITH CHECK (current_user_role() IN ('MASTER', 'GERENTE'));

CREATE POLICY "Staff can view stock movements"
    ON stock_movements FOR SELECT
    TO authenticated
    USING (true);

-- Stock movements cannot be directly deleted or updated by any user (immutable audit)
CREATE POLICY "Nobody can modify stock movements directly"
    ON stock_movements FOR UPDATE
    TO authenticated
    USING (false);

CREATE POLICY "Nobody can delete stock movements directly"
    ON stock_movements FOR DELETE
    TO authenticated
    USING (false);

-- ----------------------------------------------------------------------------
-- 6. TABLES & TABS (Mesas e Comandas)
-- ----------------------------------------------------------------------------
CREATE POLICY "Staff can view and update tables"
    ON restaurant_tables FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Staff can update table status"
    ON restaurant_tables FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Staff can view and manage tabs"
    ON tabs FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 7. ORDERS & ORDER ITEMS
-- ----------------------------------------------------------------------------
CREATE POLICY "Staff can view and create orders"
    ON orders FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Staff can view order items"
    ON order_items FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Staff can update order items status"
    ON order_items FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Staff can view status history"
    ON order_item_status_history FOR SELECT
    TO authenticated
    USING (true);

-- ----------------------------------------------------------------------------
-- 8. PAYMENTS
-- ----------------------------------------------------------------------------
CREATE POLICY "Staff can view payments"
    ON payments FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Cashier, Gerente and Master can register payments"
    ON payments FOR INSERT
    TO authenticated
    WITH CHECK (current_user_role() IN ('CAIXA', 'GERENTE', 'MASTER'));

-- ----------------------------------------------------------------------------
-- 9. AUDIT LOGS (IMMUTABLE)
-- ----------------------------------------------------------------------------
CREATE POLICY "Master and Gerente can view audit logs"
    ON audit_logs FOR SELECT
    TO authenticated
    USING (current_user_role() IN ('MASTER', 'GERENTE'));

-- NUNCA permitir UPDATE ou DELETE em audit_logs
CREATE POLICY "Nobody can update audit logs"
    ON audit_logs FOR UPDATE
    TO authenticated
    USING (false);

CREATE POLICY "Nobody can delete audit logs"
    ON audit_logs FOR DELETE
    TO authenticated
    USING (false);


-- ==========================================

-- ============================================================================
-- SEED DATA FOR ESPETARIA SABOR DA CARNE
-- ============================================================================

-- 1. Restaurant Settings
INSERT INTO restaurant_settings (name, phone, service_fee_percent, timezone)
VALUES ('Espetaria Sabor da Carne', '(11) 99999-9999', 10.00, 'America/Sao_Paulo')
ON CONFLICT DO NOTHING;

-- 2. Mock User Profiles for Development
-- (In production, these UUIDs match Supabase auth.users)
INSERT INTO profiles (id, name, email, role) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Carlos Master (Dono)', 'master@espetaria.com.br', 'MASTER'),
    ('22222222-2222-2222-2222-222222222222', 'Renata Gerente', 'gerente@espetaria.com.br', 'GERENTE'),
    ('33333333-3333-3333-3333-333333333333', 'Lucas Garçom', 'garcom1@espetaria.com.br', 'GARCOM'),
    ('44444444-4444-4444-4444-444444444444', 'José Churrasqueiro', 'churrasqueira@espetaria.com.br', 'CHURRASQUEIRA'),
    ('55555555-5555-5555-5555-555555555555', 'Maria Cozinheira', 'cozinha@espetaria.com.br', 'COZINHA'),
    ('66666666-6666-6666-6666-666666666666', 'Ana Caixa', 'caixa@espetaria.com.br', 'CAIXA')
ON CONFLICT (id) DO NOTHING;

-- 3. Categories
INSERT INTO categories (id, name, display_order) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'Espetos Nobres', 1),
    ('a0000000-0000-0000-0000-000000000002', 'Espetos Tradicionais', 2),
    ('a0000000-0000-0000-0000-000000000003', 'Acompanhamentos & Cubas', 3),
    ('a0000000-0000-0000-0000-000000000004', 'Bebidas & Cervejas', 4),
    ('a0000000-0000-0000-0000-000000000005', 'Sobremesas', 5)
ON CONFLICT (id) DO NOTHING;

-- 4. Products
INSERT INTO products (
    id, category_id, name, description, price, sector, type, 
    tracks_stock, is_cubas, portions_per_cuba, allows_doneness, display_order
) VALUES
    -- Espetos Nobres
    ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Espeto de Picanha Grill', 'Picanha maturada na brasa com sal grosso especial', 24.00, 'GRILL', 'ESPETO', true, false, 1, true, 1),
    ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Espeto de Alcatra Especial', 'Miolo de alcatra macio e suculento', 21.00, 'GRILL', 'ESPETO', true, false, 1, true, 2),
    ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Fraldinha na Mostarda', 'Fraldinha grelhada com toque de mostarda Dijon', 22.00, 'GRILL', 'ESPETO', true, false, 1, true, 3),
    
    -- Espetos Tradicionais
    ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 'Coração de Frango', 'Coraçõezinhos marinados com ervas finas', 16.00, 'GRILL', 'ESPETO', true, false, 1, false, 4),
    ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000002', 'Medalhão de Frango c/ Bacon', 'Peito de frango envolvido em fatias crocantes de bacon', 17.00, 'GRILL', 'ESPETO', true, false, 1, false, 5),
    ('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000002', 'Queijo Coalho c/ Melaço', 'Queijo coalho tostadinho acompanhado de melaço de cana', 16.00, 'GRILL', 'ESPETO', true, false, 1, false, 6),
    ('b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000002', 'Pão de Alho Tradicional', 'Cremoso com queijo e alho assado', 13.00, 'GRILL', 'ESPETO', true, false, 1, false, 7),

    -- Acompanhamentos & Cubas
    ('b0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000003', 'Arroz Branco Soltinho (Porção)', 'Produzido em cubas gastronômicas de alta qualidade', 12.00, 'KITCHEN', 'PORCAO', true, true, 15, false, 8),
    ('b0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000003', 'Feijão Tropeiro da Casa (Porção)', 'Com bacon, ovos, couve e farinha especial de milho', 16.00, 'KITCHEN', 'PORCAO', true, true, 15, false, 9),
    ('b0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000003', 'Mandioca Cozida na Manteiga', 'Mandioca macia desfiando com manteiga de garrafa', 14.00, 'KITCHEN', 'PORCAO', true, true, 12, false, 10),
    ('b0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000003', 'Vinagrete Especial', 'Tomates frescos, cebola roxa, cheiro verde e azeite', 8.00, 'KITCHEN', 'PORCAO', false, false, 1, false, 11),
    ('b0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000003', 'Farofa Crocante de Alho', 'Farinha de mandioca torrada com alho crocante', 7.00, 'KITCHEN', 'PORCAO', false, false, 1, false, 12),

    -- Bebidas
    ('b0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000004', 'Cerveja Original 600ml', 'Garrafa 600ml gelada trincando', 15.00, 'BAR', 'BEBIDA', true, false, 1, false, 13),
    ('b0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000004', 'Cerveja Heineken 600ml', 'Garrafa 600ml premium lager', 18.00, 'BAR', 'BEBIDA', true, false, 1, false, 14),
    ('b0000000-0000-0000-0000-000000000015', 'a0000000-0000-0000-0000-000000000004', 'Coca-Cola Lata 350ml', 'Original ou Zero Açúcar', 7.00, 'BAR', 'BEBIDA', true, false, 1, false, 15),
    ('b0000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000004', 'Água Mineral 500ml', 'Com ou sem gás', 5.00, 'BAR', 'BEBIDA', true, false, 1, false, 16),

    -- Sobremesas
    ('b0000000-0000-0000-0000-000000000017', 'a0000000-0000-0000-0000-000000000005', 'Pudim de Leite Condensado', 'Fatia generosa com calda de caramelo brilhante', 12.00, 'KITCHEN', 'SOBREMESA', true, false, 1, false, 17)
ON CONFLICT (id) DO NOTHING;

-- 5. Mesas (01 a 20)
INSERT INTO restaurant_tables (number, capacity, status)
SELECT 
    i AS number,
    CASE WHEN i % 4 = 0 THEN 6 ELSE 4 END AS capacity,
    'LIVRE'::table_status AS status
FROM generate_series(1, 20) AS i
ON CONFLICT (number) DO NOTHING;
