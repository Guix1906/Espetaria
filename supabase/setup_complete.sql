-- ============================================================================
-- ESPETARIA SABOR DA CARNE — SCRIPT COMPLETO E UNIFICADO DO BANCO DE DADOS
-- Consolida todas as migrações (00001 a 00020) e os dados de seed iniciais
-- Gerado automaticamente em 2026-10-10
-- ============================================================================
-- >>> INÍCIO: 00001_initial_schema.sql <<<
-- ============================================================================
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

-- >>> FIM: 00001_initial_schema.sql <<<


-- >>> INÍCIO: 00002_stock_atomic_functions.sql <<<
-- ============================================================================
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

-- >>> FIM: 00002_stock_atomic_functions.sql <<<


-- >>> INÍCIO: 00003_rls_policies.sql <<<
-- ============================================================================
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

-- >>> FIM: 00003_rls_policies.sql <<<


-- >>> INÍCIO: 00004_settings_and_print_queue.sql <<<
-- ============================================================================
-- ============================================================================
-- MIGRATION 00004: SETTINGS & RESILIENT PRINT QUEUE
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE pix_key_type AS ENUM ('CNPJ', 'CPF', 'EMAIL', 'TELEFONE', 'ALEATORIA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE print_status AS ENUM ('PENDING', 'PRINTING', 'PRINTED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE restaurant_settings 
ADD COLUMN IF NOT EXISTS address TEXT DEFAULT 'Rua dos Espetos, 100 — São Paulo/SP',
ADD COLUMN IF NOT EXISTS pix_key TEXT DEFAULT 'contato@espetariasabor.com.br',
ADD COLUMN IF NOT EXISTS pix_key_type pix_key_type DEFAULT 'EMAIL',
ADD COLUMN IF NOT EXISTS pix_merchant_name TEXT DEFAULT 'ESPETARIA SABOR DA CARNE',
ADD COLUMN IF NOT EXISTS pix_merchant_city TEXT DEFAULT 'SAO PAULO',
ADD COLUMN IF NOT EXISTS auto_print_orders BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS print_paper_width TEXT DEFAULT '80mm';

CREATE TABLE IF NOT EXISTS print_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    order_number INTEGER NOT NULL,
    sector production_sector NOT NULL,
    origin TEXT NOT NULL CHECK (origin IN ('SALAO', 'DELIVERY')),
    table_number INTEGER,
    customer_name TEXT,
    items JSONB NOT NULL,
    status print_status NOT NULL DEFAULT 'PENDING',
    idempotency_key TEXT UNIQUE NOT NULL,
    is_reprint BOOLEAN NOT NULL DEFAULT false,
    reprint_reason TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    printed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_print_queue_status ON print_queue(status);
CREATE INDEX IF NOT EXISTS idx_print_queue_order ON print_queue(order_id);
CREATE INDEX IF NOT EXISTS idx_print_queue_sector ON print_queue(sector);

-- >>> FIM: 00004_settings_and_print_queue.sql <<<


-- >>> INÍCIO: 00005_seed_tables_and_demo.sql <<<
-- ============================================================================
-- ============================================================================
-- MIGRATION 00005: SEED RESTAURANT TABLES & PUBLIC POLICIES FOR SYNC
-- ============================================================================

-- Permite leitura de mesas para clientes anônimos (ex: cardápio público, prévia de mesas)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'restaurant_tables' AND policyname = 'Public read for tables'
    ) THEN
        CREATE POLICY "Public read for tables"
            ON restaurant_tables FOR SELECT
            TO anon
            USING (true);
    END IF;
END $$;

-- Insere 20 mesas padrão caso ainda não existam
INSERT INTO restaurant_tables (number, capacity, status, active)
VALUES
    (1, 4, 'LIVRE', true),
    (2, 4, 'LIVRE', true),
    (3, 4, 'LIVRE', true),
    (4, 6, 'LIVRE', true),
    (5, 4, 'LIVRE', true),
    (6, 4, 'LIVRE', true),
    (7, 4, 'LIVRE', true),
    (8, 6, 'LIVRE', true),
    (9, 4, 'LIVRE', true),
    (10, 4, 'LIVRE', true),
    (11, 4, 'LIVRE', true),
    (12, 6, 'LIVRE', true),
    (13, 4, 'LIVRE', true),
    (14, 4, 'LIVRE', true),
    (15, 4, 'LIVRE', true),
    (16, 6, 'LIVRE', true),
    (17, 4, 'LIVRE', true),
    (18, 4, 'LIVRE', true),
    (19, 4, 'LIVRE', true),
    (20, 6, 'LIVRE', true)
ON CONFLICT (number) DO UPDATE 
SET active = true;

-- >>> FIM: 00005_seed_tables_and_demo.sql <<<


-- >>> INÍCIO: 00006_updated_at_and_version.sql <<<
-- ============================================================================
-- ============================================================================
-- MIGRATION 00006: updated_at, updated_by, version para rastreabilidade
-- ============================================================================

-- Adiciona colunas de rastreabilidade em restaurant_tables
ALTER TABLE restaurant_tables
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_by TEXT,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Adiciona colunas de rastreabilidade em tabs
ALTER TABLE tabs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_by TEXT,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Adiciona colunas de rastreabilidade em orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_by TEXT,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Adiciona colunas de rastreabilidade em order_items
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_by TEXT,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Adiciona colunas de rastreabilidade em daily_prep_stock
ALTER TABLE daily_prep_stock
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_by TEXT,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Função para incrementar version
CREATE OR REPLACE FUNCTION increment_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
DROP TRIGGER IF EXISTS update_restaurant_tables_updated_at ON restaurant_tables;
CREATE TRIGGER update_restaurant_tables_updated_at
  BEFORE UPDATE ON restaurant_tables
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tabs_updated_at ON tabs;
CREATE TRIGGER update_tabs_updated_at
  BEFORE UPDATE ON tabs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_order_items_updated_at ON order_items;
CREATE TRIGGER update_order_items_updated_at
  BEFORE UPDATE ON order_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_daily_prep_stock_updated_at ON daily_prep_stock;
CREATE TRIGGER update_daily_prep_stock_updated_at
  BEFORE UPDATE ON daily_prep_stock
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Triggers para version (incrementa a cada UPDATE)
DROP TRIGGER IF EXISTS increment_restaurant_tables_version ON restaurant_tables;
CREATE TRIGGER increment_restaurant_tables_version
  BEFORE UPDATE ON restaurant_tables
  FOR EACH ROW EXECUTE FUNCTION increment_version();

DROP TRIGGER IF EXISTS increment_tabs_version ON tabs;
CREATE TRIGGER increment_tabs_version
  BEFORE UPDATE ON tabs
  FOR EACH ROW EXECUTE FUNCTION increment_version();

DROP TRIGGER IF EXISTS increment_orders_version ON orders;
CREATE TRIGGER increment_orders_version
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION increment_version();

DROP TRIGGER IF EXISTS increment_order_items_version ON order_items;
CREATE TRIGGER increment_order_items_version
  BEFORE UPDATE ON order_items
  FOR EACH ROW EXECUTE FUNCTION increment_version();

DROP TRIGGER IF EXISTS increment_daily_prep_stock_version ON daily_prep_stock;
CREATE TRIGGER increment_daily_prep_stock_version
  BEFORE UPDATE ON daily_prep_stock
  FOR EACH ROW EXECUTE FUNCTION increment_version();

-- >>> FIM: 00006_updated_at_and_version.sql <<<


-- >>> INÍCIO: 00007_secure_rpc_and_auth.sql <<<
-- ============================================================================
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

-- >>> FIM: 00007_secure_rpc_and_auth.sql <<<


-- >>> INÍCIO: 00008_keep_only_admin_profile.sql <<<
-- ============================================================================
-- ============================================================================
-- MIGRATION 00008: REMOVE PERFIS DE EXEMPLO, MANTÉM APENAS O ADMIN (MASTER)
-- Os demais usuários serão cadastrados pelo próprio sistema.
-- ============================================================================

DELETE FROM profiles p
 WHERE p.email IN (
        'gerente@espetaria.com.br',
        'garcom1@espetaria.com.br',
        'churrasqueira@espetaria.com.br',
        'cozinha@espetaria.com.br',
        'caixa@espetaria.com.br'
       )
   -- Segurança: não apaga perfil que já tenha histórico operacional
   AND NOT EXISTS (SELECT 1 FROM shifts s WHERE p.id IN (s.opened_by, s.closed_by))
   AND NOT EXISTS (SELECT 1 FROM tabs t WHERE p.id IN (t.opened_by, t.closed_by))
   AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.created_by = p.id)
   AND NOT EXISTS (SELECT 1 FROM payments pm WHERE pm.received_by = p.id)
   AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.user_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM order_item_status_history h WHERE h.changed_by = p.id);

-- Perfis passam a ser alterados só pela Edge Function "manage-staff"
-- (impede, por exemplo, um gerente de se promover a MASTER via API REST).
DROP POLICY IF EXISTS "Master and Gerente can manage profiles" ON profiles;

-- Garante que o admin exista e esteja ativo
UPDATE profiles SET is_active = true, role = 'MASTER'
 WHERE email = 'master@espetaria.com.br';

-- >>> FIM: 00008_keep_only_admin_profile.sql <<<


-- >>> INÍCIO: 00009_delivery_and_print_pipeline.sql <<<
-- ============================================================================
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

-- >>> FIM: 00009_delivery_and_print_pipeline.sql <<<


-- >>> INÍCIO: 00010_security_hardening.sql <<<
-- ============================================================================
-- ============================================================================
-- MIGRATION 00010: ENDURECIMENTO DE SEGURANÇA (auditoria 2026-10-07)
--  1. Novo usuário do Auth não herda mais perfil existente pelo e-mail
--     (impedia sequestro do perfil MASTER via cadastro público).
--  2. Leitura de dados operacionais só para perfis ATIVOS.
--  3. REPLICA IDENTITY FULL em order_items (payload.old completo no Realtime).
--  4. Delivery público: limite de unidades por pedido e limite global.
-- IMPORTANTE: desative também "Allow new users to sign up" em
-- Authentication > Providers > Email no painel do Supabase.
-- ============================================================================

-- 1. Trigger de novo usuário: vincula perfil existente SOMENTE se o e-mail
--    já estiver confirmado; caso contrário cria perfil próprio e inativo.
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.email_confirmed_at IS NOT NULL THEN
        UPDATE profiles
           SET id = NEW.id, updated_at = NOW()
         WHERE lower(email) = lower(NEW.email) AND id <> NEW.id;
        IF FOUND THEN
            RETURN NEW;
        END IF;
    END IF;

    INSERT INTO profiles (id, name, email, role, is_active)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NEW.email,
        'GARCOM',
        false
    )
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION handle_new_auth_user() FROM PUBLIC, anon, authenticated;

-- 2. RLS: troca USING (true) por "perfil ativo" nas leituras operacionais
DROP POLICY IF EXISTS "Users can view all staff profiles" ON profiles;
CREATE POLICY "Active staff can view staff profiles" ON profiles FOR SELECT TO authenticated
    USING (current_user_role() IS NOT NULL);

DROP POLICY IF EXISTS "Staff can view shifts" ON shifts;
CREATE POLICY "Staff can view shifts" ON shifts FOR SELECT TO authenticated
    USING (current_user_role() IS NOT NULL);

DROP POLICY IF EXISTS "Staff can view daily prep stock" ON daily_prep_stock;
CREATE POLICY "Staff can view daily prep stock" ON daily_prep_stock FOR SELECT TO authenticated
    USING (current_user_role() IS NOT NULL);

DROP POLICY IF EXISTS "Staff can view stock movements" ON stock_movements;
CREATE POLICY "Staff can view stock movements" ON stock_movements FOR SELECT TO authenticated
    USING (current_user_role() IS NOT NULL);

DROP POLICY IF EXISTS "Staff can view and update tables" ON restaurant_tables;
CREATE POLICY "Staff can view tables" ON restaurant_tables FOR SELECT TO authenticated
    USING (current_user_role() IS NOT NULL);

DROP POLICY IF EXISTS "Staff can view order items" ON order_items;
CREATE POLICY "Staff can view order items" ON order_items FOR SELECT TO authenticated
    USING (current_user_role() IS NOT NULL);

DROP POLICY IF EXISTS "Staff can view status history" ON order_item_status_history;
CREATE POLICY "Staff can view status history" ON order_item_status_history FOR SELECT TO authenticated
    USING (current_user_role() IS NOT NULL);

DROP POLICY IF EXISTS "Staff can view payments" ON payments;
CREATE POLICY "Staff can view payments" ON payments FOR SELECT TO authenticated
    USING (current_user_role() IS NOT NULL);

-- 3. Realtime com status anterior completo
ALTER TABLE order_items REPLICA IDENTITY FULL;

-- 4. Delivery público: freio contra pedidos falsos que zeram o estoque
CREATE OR REPLACE FUNCTION check_delivery_order_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (SELECT COUNT(*) FROM delivery_orders WHERE created_at > NOW() - INTERVAL '5 minutes') >= 30 THEN
        RAISE EXCEPTION 'Muitos pedidos no momento. Tente novamente em alguns minutos ou fale conosco pelo WhatsApp.';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION check_delivery_order_limits() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS delivery_order_limits ON delivery_orders;
CREATE TRIGGER delivery_order_limits
    BEFORE INSERT ON delivery_orders
    FOR EACH ROW EXECUTE FUNCTION check_delivery_order_limits();

CREATE OR REPLACE FUNCTION check_delivery_item_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (SELECT COALESCE(SUM(quantity), 0) FROM delivery_order_items
         WHERE delivery_order_id = NEW.delivery_order_id) + NEW.quantity > 60 THEN
        RAISE EXCEPTION 'Pedido acima do limite de 60 unidades. Para encomendas grandes, fale conosco pelo WhatsApp.';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION check_delivery_item_limits() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS delivery_item_limits ON delivery_order_items;
CREATE TRIGGER delivery_item_limits
    BEFORE INSERT ON delivery_order_items
    FOR EACH ROW EXECUTE FUNCTION check_delivery_item_limits();

-- >>> FIM: 00010_security_hardening.sql <<<


-- >>> INÍCIO: 00011_whatsapp_and_delivery_payment.sql <<<
-- ============================================================================
-- ============================================================================
-- MIGRATION 00011: WHATSAPP AUTOMÁTICO + CONFIRMAÇÃO DE PIX NO DELIVERY
--  * delivery_orders.paid_at: o caixa marca "PIX recebido" após conferir no banco.
--  * whatsapp_outbox: fila de mensagens automáticas ao cliente
--      CONFIRMED         -> pedido recebido (com valor e forma de pagamento)
--      OUT_FOR_DELIVERY  -> saiu para entrega (com nome do entregador)
--      DELIVERED         -> entregue
--      CANCELLED         -> cancelado
--  * A cada evento o banco chama a Edge Function "whatsapp-dispatch" (pg_net),
--    que envia pela API configurada (Z-API, Evolution API ou Meta Cloud API).
--    Se a chamada falhar, a mensagem fica PENDING e sai no próximo disparo.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. Pagamento do delivery ------------------------------------------------------
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION mark_delivery_paid(p_order_id UUID, p_paid BOOLEAN DEFAULT true)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'CAIXA']::app_role[]);
    v_order delivery_orders;
BEGIN
    UPDATE delivery_orders
       SET paid_at = CASE WHEN p_paid THEN NOW() END,
           paid_by = CASE WHEN p_paid THEN v_uid END,
           updated_by = v_uid::TEXT
     WHERE id = p_order_id AND status <> 'CANCELLED'
    RETURNING * INTO v_order;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado ou cancelado.'; END IF;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (v_order.shift_id, v_uid, CASE WHEN p_paid THEN 'DELIVERY_PAGO' ELSE 'DELIVERY_PAGAMENTO_ESTORNADO' END,
            'delivery_orders', p_order_id::TEXT, jsonb_build_object('total', v_order.total, 'method', v_order.payment_method));
    RETURN to_jsonb(v_order);
END;
$$;
REVOKE ALL ON FUNCTION mark_delivery_paid(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mark_delivery_paid(UUID, BOOLEAN) TO authenticated;

-- Acompanhamento do cliente também mostra se o PIX já foi confirmado
CREATE OR REPLACE FUNCTION get_delivery_order_status(p_order_id UUID, p_phone TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object('order_number', order_number, 'status', status, 'total', total,
                              'created_at', created_at, 'dispatched_at', dispatched_at,
                              'delivered_at', delivered_at, 'driver_name', driver_name, 'paid_at', paid_at)
      FROM delivery_orders
     WHERE id = p_order_id AND phone = regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
$$;

-- 2. Configuração do WhatsApp (não sensível: tokens ficam nos secrets da função) --
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS whatsapp_auto_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS whatsapp_dispatch_url TEXT;

-- 3. Fila de mensagens --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_order_id UUID NOT NULL REFERENCES delivery_orders(id) ON DELETE CASCADE,
    event TEXT NOT NULL CHECK (event IN ('CONFIRMED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED')),
    phone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED')),
    attempts INT NOT NULL DEFAULT 0,
    last_error TEXT,
    provider_message_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    UNIQUE (delivery_order_id, event)
);
CREATE INDEX IF NOT EXISTS whatsapp_outbox_pending_idx ON whatsapp_outbox (status, created_at);

ALTER TABLE whatsapp_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read whatsapp outbox" ON whatsapp_outbox;
CREATE POLICY "Staff read whatsapp outbox" ON whatsapp_outbox FOR SELECT TO authenticated
    USING (current_user_role() IS NOT NULL);

-- Chama a Edge Function (assíncrono; nunca bloqueia o pedido)
CREATE OR REPLACE FUNCTION wake_whatsapp_dispatch()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_url TEXT;
    v_enabled BOOLEAN;
BEGIN
    SELECT whatsapp_dispatch_url, whatsapp_auto_enabled INTO v_url, v_enabled FROM restaurant_settings LIMIT 1;
    IF NOT COALESCE(v_enabled, false) OR COALESCE(v_url, '') = '' THEN RETURN; END IF;
    PERFORM net.http_post(url := v_url, body := '{}'::jsonb,
                          headers := '{"Content-Type": "application/json"}'::jsonb);
EXCEPTION WHEN OTHERS THEN
    -- Sem pg_net ou URL inválida: a mensagem fica na fila para o próximo disparo
    NULL;
END;
$$;
REVOKE ALL ON FUNCTION wake_whatsapp_dispatch() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION wake_whatsapp_dispatch() TO authenticated;

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
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED') THEN
        v_event := NEW.status;
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

-- DEFERRED: no INSERT o pedido já tem itens e total calculados ao disparar
DROP TRIGGER IF EXISTS queue_delivery_whatsapp ON delivery_orders;
CREATE CONSTRAINT TRIGGER queue_delivery_whatsapp
    AFTER INSERT OR UPDATE OF status ON delivery_orders
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION trg_queue_delivery_whatsapp();

-- Reenvio manual pela equipe
CREATE OR REPLACE FUNCTION retry_whatsapp_message(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'CAIXA', 'ENTREGADOR']::app_role[]);
BEGIN
    UPDATE whatsapp_outbox SET status = 'PENDING', attempts = 0, last_error = NULL
     WHERE id = p_id AND status IN ('FAILED', 'SKIPPED');
    IF NOT FOUND THEN RAISE EXCEPTION 'Somente mensagens com falha podem ser reenviadas.'; END IF;
    PERFORM wake_whatsapp_dispatch();
END;
$$;
REVOKE ALL ON FUNCTION retry_whatsapp_message(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION retry_whatsapp_message(UUID) TO authenticated;

-- 4. API da Edge Function (somente service_role) -----------------------------------
CREATE OR REPLACE FUNCTION claim_whatsapp_messages(p_limit INT DEFAULT 20)
RETURNS SETOF whatsapp_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    UPDATE whatsapp_outbox w
       SET status = 'SENDING', attempts = w.attempts + 1
     WHERE w.id IN (
        SELECT id FROM whatsapp_outbox
         WHERE status = 'PENDING'
            OR (status = 'SENDING' AND created_at < NOW() - INTERVAL '5 minutes')
         ORDER BY created_at
         LIMIT GREATEST(1, LEAST(p_limit, 50))
         FOR UPDATE SKIP LOCKED
     )
    RETURNING w.*;
END;
$$;
REVOKE ALL ON FUNCTION claim_whatsapp_messages(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_whatsapp_messages(INT) TO service_role;

-- 5. Realtime da fila (equipe vê "enviado"/"falhou" na hora) ------------------------
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_outbox;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

select 'MIGRATION_00011_OK' as resultado;

-- >>> FIM: 00011_whatsapp_and_delivery_payment.sql <<<


-- >>> INÍCIO: 00012_whatsapp_dispatch_auth.sql <<<
-- ============================================================================
-- ============================================================================
-- MIGRATION 00012: CHAMADA AUTENTICADA DA FUNÇÃO whatsapp-dispatch
-- A função mantém "Verify JWT" ligado; o banco envia a chave pública (anon) do
-- projeto, a mesma que já vai no site. O app preenche a coluna ao ativar o
-- WhatsApp automático em Configurações.
-- ============================================================================
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS whatsapp_dispatch_token TEXT;

CREATE OR REPLACE FUNCTION wake_whatsapp_dispatch()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_url TEXT;
    v_token TEXT;
    v_enabled BOOLEAN;
BEGIN
    SELECT whatsapp_dispatch_url, whatsapp_dispatch_token, whatsapp_auto_enabled
      INTO v_url, v_token, v_enabled
      FROM restaurant_settings LIMIT 1;
    IF NOT COALESCE(v_enabled, false) OR COALESCE(v_url, '') = '' THEN RETURN; END IF;
    PERFORM net.http_post(
        url := v_url,
        body := '{}'::jsonb,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || COALESCE(v_token, ''),
            'apikey', COALESCE(v_token, '')
        )
    );
EXCEPTION WHEN OTHERS THEN
    -- Sem pg_net ou URL inválida: a mensagem fica na fila para o próximo disparo
    NULL;
END;
$$;
REVOKE ALL ON FUNCTION wake_whatsapp_dispatch() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION wake_whatsapp_dispatch() TO authenticated;

select 'MIGRATION_00012_OK' as resultado;

-- >>> FIM: 00012_whatsapp_dispatch_auth.sql <<<


-- >>> INÍCIO: 00013_print_templates.sql <<<
-- ============================================================================
-- ============================================================================
-- Modelos de impressão configuráveis (churrasqueira, cozinha e etiqueta de delivery).
-- NULL = o printer-bridge usa o modelo padrão.
-- ============================================================================
ALTER TABLE restaurant_settings
  ADD COLUMN IF NOT EXISTS print_templates JSONB;

-- >>> FIM: 00013_print_templates.sql <<<


-- >>> INÍCIO: 00014_realtime_catalog.sql <<<
-- ============================================================================
-- ============================================================================
-- Tempo real do cardápio e das configurações: produto cadastrado/editado/pausado
-- e configurações da loja chegam na hora aos celulares dos garçons e ao caixa.
-- ============================================================================
DO $$
DECLARE
    t TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        FOREACH t IN ARRAY ARRAY['products', 'categories', 'restaurant_settings'] LOOP
            IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
                EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
            END IF;
        END LOOP;
    END IF;
END $$;

-- >>> FIM: 00014_realtime_catalog.sql <<<


-- >>> INÍCIO: 00015_finance_entries.sql <<<
-- ============================================================================
-- ============================================================================
-- Financeiro: contas a pagar e a receber (lançamentos manuais da gerência).
-- As vendas (salão e delivery) NÃO entram aqui: o financeiro lê direto de
-- payments e delivery_orders, então nada precisa ser digitado duas vezes.
-- ============================================================================
CREATE TABLE IF NOT EXISTS finance_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL CHECK (kind IN ('PAGAR', 'RECEBER')),
    description TEXT NOT NULL CHECK (length(trim(description)) > 0),
    category TEXT NOT NULL DEFAULT 'Outros',
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    due_date DATE NOT NULL,
    paid_at TIMESTAMPTZ,                -- NULL = em aberto
    payment_method TEXT,
    supplier TEXT,                      -- fornecedor / cliente
    notes TEXT,
    created_by UUID DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_entries_due ON finance_entries(due_date);
CREATE INDEX IF NOT EXISTS idx_finance_entries_kind ON finance_entries(kind);

ALTER TABLE finance_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Master e Gerente gerenciam o financeiro" ON finance_entries;
CREATE POLICY "Master e Gerente gerenciam o financeiro"
    ON finance_entries FOR ALL
    TO authenticated
    USING (current_user_role() IN ('MASTER', 'GERENTE'))
    WITH CHECK (current_user_role() IN ('MASTER', 'GERENTE'));

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'finance_entries') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.finance_entries;
    END IF;
END $$;

-- >>> FIM: 00015_finance_entries.sql <<<


-- >>> INÍCIO: 00016_void_tab.sql <<<
-- ============================================================================
-- ============================================================================
-- Anular comanda (proprietário/gerente): para lançamentos de teste ou feitos
-- por engano. Cancela todos os itens (devolvendo ao estoque o que não foi
-- preparado e avisando a produção), estorna pagamentos, libera a mesa e deixa
-- registro na auditoria. Nada é apagado: os relatórios ignoram o que foi anulado.
-- ============================================================================
CREATE OR REPLACE FUNCTION void_tab_atomic(p_tab_id UUID, p_reason TEXT)
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
        PERFORM cancel_order_item_atomic(v_item.id, 'Comanda anulada: ' || p_reason);
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
            jsonb_build_object('reason', p_reason, 'items_cancelled', v_items, 'payments_reversed', v_payments));

    RETURN jsonb_build_object('tab_id', p_tab_id, 'items_cancelled', v_items, 'payments_reversed', v_payments);
END;
$$;

REVOKE ALL ON FUNCTION void_tab_atomic(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION void_tab_atomic(UUID, TEXT) TO authenticated;

-- >>> FIM: 00016_void_tab.sql <<<


-- >>> INÍCIO: 00017_audit_rpcs_and_triggers.sql <<<
-- ============================================================================
-- ============================================================================
-- MIGRATION 00017: RPCs DE AUDITORIA + TRIGGERS AUSENTES + DROP FUNÇÕES INSEGURAS
--  1. Cria save_finance_entry, set_finance_paid, remove_finance_entry (com auditoria)
--  2. Cria create_product, update_product, deactivate_product (com auditoria)
--  3. Adiciona triggers updated_at em finance_entries, print_queue, shifts, whatsapp_outbox
--  4. Remove versões inseguras de funções da migração 00002 que aceitavam p_user_id
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TRIGGERS updated_at AUSENTES
-- ----------------------------------------------------------------------------

-- finance_entries
CREATE OR REPLACE TRIGGER trg_finance_entries_updated_at
    BEFORE UPDATE ON finance_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- print_queue
CREATE OR REPLACE TRIGGER trg_print_queue_updated_at
    BEFORE UPDATE ON print_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- shifts
CREATE OR REPLACE TRIGGER trg_shifts_updated_at
    BEFORE UPDATE ON shifts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- whatsapp_outbox (adiciona coluna primeiro)
ALTER TABLE whatsapp_outbox ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE OR REPLACE TRIGGER trg_whatsapp_outbox_updated_at
    BEFORE UPDATE ON whatsapp_outbox
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- categories (adiciona coluna primeiro)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE OR REPLACE TRIGGER trg_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- delivery_zones (adiciona coluna primeiro)
ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE OR REPLACE TRIGGER trg_delivery_zones_updated_at
    BEFORE UPDATE ON delivery_zones
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. RPCs DE FINANCEIRO COM AUDITORIA
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION save_finance_entry(
    p_kind TEXT,
    p_description TEXT,
    p_amount NUMERIC,
    p_due_date DATE,
    p_category TEXT DEFAULT 'Outros',
    p_supplier TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_result finance_entries;
    v_action TEXT;
BEGIN
    IF p_kind NOT IN ('PAGAR', 'RECEBER') THEN
        RAISE EXCEPTION 'Tipo inválido: use PAGAR ou RECEBER.';
    END IF;
    IF COALESCE(TRIM(p_description), '') = '' THEN
        RAISE EXCEPTION 'Descrição é obrigatória.';
    END IF;
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Valor deve ser maior que zero.';
    END IF;

    IF p_id IS NOT NULL THEN
        -- Atualização
        UPDATE finance_entries
           SET kind = p_kind,
               description = TRIM(p_description),
               amount = p_amount,
               due_date = p_due_date,
               category = COALESCE(NULLIF(TRIM(p_category), ''), 'Outros'),
               supplier = p_supplier,
               notes = p_notes,
               updated_at = NOW()
         WHERE id = p_id
        RETURNING * INTO v_result;
        IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado.'; END IF;
        v_action := 'FINANCE_EDITADO';
    ELSE
        -- Inserção
        INSERT INTO finance_entries (kind, description, amount, due_date, category, supplier, notes, created_by)
        VALUES (p_kind, TRIM(p_description), p_amount, p_due_date,
                COALESCE(NULLIF(TRIM(p_category), ''), 'Outros'), p_supplier, p_notes, v_uid)
        RETURNING * INTO v_result;
        v_action := 'FINANCE_CRIADO';
    END IF;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (NULL, v_uid, v_action, 'finance_entries', v_result.id::TEXT,
            jsonb_build_object('kind', v_result.kind, 'description', v_result.description,
                               'amount', v_result.amount, 'due_date', v_result.due_date));

    RETURN to_jsonb(v_result);
END;
$$;
REVOKE ALL ON FUNCTION save_finance_entry(TEXT, TEXT, NUMERIC, DATE, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION save_finance_entry(TEXT, TEXT, NUMERIC, DATE, TEXT, TEXT, TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION set_finance_paid(p_id UUID, p_paid BOOLEAN, p_method TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_result finance_entries;
BEGIN
    UPDATE finance_entries
       SET paid_at = CASE WHEN p_paid THEN NOW() END,
           payment_method = CASE WHEN p_paid THEN p_method END,
           updated_at = NOW()
     WHERE id = p_id
    RETURNING * INTO v_result;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado.'; END IF;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (NULL, v_uid, CASE WHEN p_paid THEN 'FINANCE_PAGO' ELSE 'FINANCE_ESTORNADO' END,
            'finance_entries', p_id::TEXT,
            jsonb_build_object('paid', p_paid, 'method', p_method, 'amount', v_result.amount));

    RETURN to_jsonb(v_result);
END;
$$;
REVOKE ALL ON FUNCTION set_finance_paid(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_finance_paid(UUID, BOOLEAN, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION remove_finance_entry(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_entry finance_entries;
BEGIN
    SELECT * INTO v_entry FROM finance_entries WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado.'; END IF;

    DELETE FROM finance_entries WHERE id = p_id;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (NULL, v_uid, 'FINANCE_REMOVIDO', 'finance_entries', p_id::TEXT,
            jsonb_build_object('kind', v_entry.kind, 'description', v_entry.description,
                               'amount', v_entry.amount));
END;
$$;
REVOKE ALL ON FUNCTION remove_finance_entry(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION remove_finance_entry(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. RPCs DE PRODUTOS COM AUDITORIA
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION create_product(
    p_name TEXT,
    p_price NUMERIC,
    p_category_id UUID,
    p_sector production_sector DEFAULT 'NONE',
    p_type product_type DEFAULT 'OUTROS',
    p_description TEXT DEFAULT NULL,
    p_image_url TEXT DEFAULT NULL,
    p_tracks_stock BOOLEAN DEFAULT false,
    p_is_cubas BOOLEAN DEFAULT false,
    p_portions_per_cuba INT DEFAULT NULL,
    p_allows_doneness BOOLEAN DEFAULT false,
    p_allows_notes BOOLEAN DEFAULT true,
    p_display_order INT DEFAULT 0,
    p_id UUID DEFAULT NULL           -- ID gerado no aparelho (mantém o mesmo código no app e no banco)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_result products;
BEGIN
    IF COALESCE(TRIM(p_name), '') = '' THEN
        RAISE EXCEPTION 'Nome do produto é obrigatório.';
    END IF;
    IF p_price < 0 THEN
        RAISE EXCEPTION 'Preço não pode ser negativo.';
    END IF;

    INSERT INTO products (id, name, price, category_id, sector, type, description, image_url,
                          tracks_stock, is_cubas, portions_per_cuba, allows_doneness, allows_notes, display_order)
    VALUES (COALESCE(p_id, gen_random_uuid()), TRIM(p_name), p_price, p_category_id, p_sector, p_type, p_description, p_image_url,
            p_tracks_stock, p_is_cubas, GREATEST(COALESCE(p_portions_per_cuba, 1), 1), p_allows_doneness, p_allows_notes, p_display_order)
    RETURNING * INTO v_result;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (NULL, v_uid, 'PRODUTO_CRIADO', 'products', v_result.id::TEXT,
            jsonb_build_object('name', v_result.name, 'price', v_result.price));

    RETURN to_jsonb(v_result);
END;
$$;
REVOKE ALL ON FUNCTION create_product(TEXT, NUMERIC, UUID, production_sector, product_type, TEXT, TEXT, BOOLEAN, BOOLEAN, INT, BOOLEAN, BOOLEAN, INT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_product(TEXT, NUMERIC, UUID, production_sector, product_type, TEXT, TEXT, BOOLEAN, BOOLEAN, INT, BOOLEAN, BOOLEAN, INT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION update_product(p_id UUID, p_updates JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_result products;
    v_allowed_cols TEXT[] := ARRAY['name','price','category_id','sector','type','description',
                                   'image_url','tracks_stock','is_cubas','portions_per_cuba',
                                   'allows_doneness','allows_notes','display_order','active','available'];
    v_key TEXT;
    v_set_clauses TEXT[] := '{}';
    v_values JSONB := '{}'::JSONB;
BEGIN
    IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'object' THEN
        RAISE EXCEPTION 'Atualizações devem ser um objeto JSON.';
    END IF;

    -- Valida colunas permitidas
    FOR v_key IN SELECT jsonb_object_keys(p_updates) LOOP
        IF NOT (v_key = ANY(v_allowed_cols)) THEN
            RAISE EXCEPTION 'Coluna não permitida: %', v_key;
        END IF;
    END LOOP;

    UPDATE products
       SET name = COALESCE(p_updates->>'name', name),
           price = COALESCE((p_updates->>'price')::NUMERIC, price),
           category_id = COALESCE((p_updates->>'category_id')::UUID, category_id),
           sector = COALESCE((p_updates->>'sector')::production_sector, sector),
           type = COALESCE((p_updates->>'type')::product_type, type),
           description = COALESCE(p_updates->>'description', description),
           image_url = COALESCE(p_updates->>'image_url', image_url),
           tracks_stock = COALESCE((p_updates->>'tracks_stock')::BOOLEAN, tracks_stock),
           is_cubas = COALESCE((p_updates->>'is_cubas')::BOOLEAN, is_cubas),
           portions_per_cuba = COALESCE((p_updates->>'portions_per_cuba')::INT, portions_per_cuba),
           allows_doneness = COALESCE((p_updates->>'allows_doneness')::BOOLEAN, allows_doneness),
           allows_notes = COALESCE((p_updates->>'allows_notes')::BOOLEAN, allows_notes),
           display_order = COALESCE((p_updates->>'display_order')::INT, display_order),
           active = COALESCE((p_updates->>'active')::BOOLEAN, active),
           available = COALESCE((p_updates->>'available')::BOOLEAN, available),
           updated_at = NOW()
     WHERE id = p_id
    RETURNING * INTO v_result;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado.'; END IF;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (NULL, v_uid, 'PRODUTO_EDITADO', 'products', p_id::TEXT, p_updates);

    RETURN to_jsonb(v_result);
END;
$$;
REVOKE ALL ON FUNCTION update_product(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_product(UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION deactivate_product(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_result products;
BEGIN
    UPDATE products SET active = false, available = false, updated_at = NOW()
     WHERE id = p_id
    RETURNING * INTO v_result;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado.'; END IF;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (NULL, v_uid, 'PRODUTO_DESATIVADO', 'products', p_id::TEXT,
            jsonb_build_object('name', v_result.name));

    RETURN to_jsonb(v_result);
END;
$$;
REVOKE ALL ON FUNCTION deactivate_product(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION deactivate_product(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. DROP FUNÇÕES INSEGURAS DA MIGRAÇÃO 00002 (aceitavam p_user_id)
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS create_order_atomic(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS cancel_order_item_atomic(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS open_shift_with_stock(TEXT, NUMERIC, UUID);
DROP FUNCTION IF EXISTS toggle_product_exhaustion(UUID, BOOLEAN, UUID);
DROP FUNCTION IF EXISTS adjust_stock_physical_count(UUID, INT, TEXT, UUID);

select 'MIGRATION_00017_OK' as resultado;

-- ============================================================================
-- MIGRATION 00018: RETRY DE IMPRESSÃO + SEGURANÇA WHATSAPP + RLS DELIVERY_ZONES
-- 1. Função requeue_print_job para retry com backoff no printer-bridge
-- 2. View restaurant_settings_public dinâmica (só colunas que existem)
-- 3. Remove política pública insegura da tabela restaurant_settings
-- 4. Adiciona políticas de escrita em delivery_zones para MASTER/GERENTE
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. REQUEUE PRINT JOB (usado pelo printer-bridge em retry com backoff)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION requeue_print_job(p_job_id UUID, p_error TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE print_queue
       SET status = 'PENDING',
           last_error = LEFT(COALESCE(p_error, ''), 500),
           attempts = COALESCE(attempts, 0) + 1,
           claimed_at = NULL,
           claimed_by = NULL,
           next_attempt_at = NOW(),
           updated_at = NOW()
     WHERE id = p_job_id AND status IN ('PRINTING', 'FAILED');  -- status reais de print_status
END;
$$;
REVOKE ALL ON FUNCTION requeue_print_job(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION requeue_print_job(UUID, TEXT) TO service_role;

-- ----------------------------------------------------------------------------
-- 2. VIEW SEGURA SEM TOKEN (dinâmica — só colunas que existem)
-- ----------------------------------------------------------------------------
-- Colunas reais de restaurant_settings após migrações 00001–00020:
--   id, name, cnpj, phone, service_fee_percent, allow_custom_service_fee,
--   timezone, created_at, updated_at,
--   address, pix_key, pix_key_type, pix_merchant_name, pix_merchant_city,
--   auto_print_orders, print_paper_width,
--   whatsapp_auto_enabled, whatsapp_dispatch_url, whatsapp_dispatch_token,
--   print_templates, delivery_cutoff_time
-- NÃO existem: logo_url, currency, tax_rate, service_charge_rate, default_printer_ip

-- A coluna é criada na 00020; garantir aqui para a view não falhar quando tudo roda junto
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS delivery_cutoff_time TIME;

DROP VIEW IF EXISTS restaurant_settings_public;
CREATE OR REPLACE VIEW restaurant_settings_public AS
SELECT id, name, address, phone, cnpj,
       service_fee_percent, allow_custom_service_fee,
       timezone, pix_key, pix_key_type, pix_merchant_name, pix_merchant_city,
       auto_print_orders, print_paper_width,
       whatsapp_auto_enabled, whatsapp_dispatch_url,
       print_templates, delivery_cutoff_time,
       created_at, updated_at
  FROM restaurant_settings;

REVOKE ALL ON restaurant_settings_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON restaurant_settings_public TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. REMOVER POLÍTICA PÚBLICA INSEGURA DA TABELA
-- ----------------------------------------------------------------------------
-- A política antiga "Public read for restaurant settings" com USING(true)
-- expunha whatsapp_dispatch_token para anon. Removida.
DROP POLICY IF EXISTS "Public read for restaurant settings" ON restaurant_settings;

-- Política restritiva: só staff autenticado vê a tabela completa (incluindo token)
DROP POLICY IF EXISTS "Staff read restaurant settings" ON restaurant_settings;
CREATE POLICY "Staff read restaurant settings" ON restaurant_settings FOR SELECT TO authenticated
    USING (current_user_role() IS NOT NULL);

-- ----------------------------------------------------------------------------
-- 4. RLS ESCRITA EM delivery_zones
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Master e Gerente gerenciam zonas de entrega" ON delivery_zones;
CREATE POLICY "Master e Gerente gerenciam zonas de entrega" ON delivery_zones FOR ALL TO authenticated
    USING (current_user_role() IN ('MASTER', 'GERENTE'))
    WITH CHECK (current_user_role() IN ('MASTER', 'GERENTE'));

select 'MIGRATION_00018_OK' as resultado;

-- ============================================================================
-- MIGRATION 00019 (versão corrigida): vínculos do financeiro
--
-- A versão anterior desta migração convertia colunas updated_by de TEXT para
-- UUID, trocava status/forma de pagamento do delivery para ENUM e tirava
-- delivery_orders/whatsapp_outbox do Realtime. Isso QUEBRAVA 12 funções em uso
-- (abrir mesa, lançar pedido, cancelar item, pedir/fechar conta, fechar turno,
-- excluir comanda e todo o delivery), que gravam texto nessas colunas, e
-- deixava o painel sem aviso de pedido de delivery novo. Essas partes foram
-- removidas. Se a versão antiga já foi aplicada, rode a 00023, que desfaz.
--
-- O Realtime do Supabase respeita o RLS: só quem tem permissão de leitura
-- recebe as linhas, então manter as tabelas na publicação não expõe dados.
-- ============================================================================

-- Prevenção de duplicidade em finance_entries
ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS external_reference TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_entries_external_ref
    ON finance_entries (external_reference) WHERE external_reference IS NOT NULL;

-- Vínculo finance_entries ↔ shifts (conciliação por turno)
ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_finance_entries_shift ON finance_entries(shift_id);

select 'MIGRATION_00019_OK' as resultado;

-- ============================================================================
-- MIGRATION 00020: PAGAMENTO AUTOMÁTICO DE ENTREGADORES + CPF DE GARÇONS
-- 1. Adiciona coluna cpf em profiles (opcional, único)
-- 2. Cria tabela driver_payouts para registro diário por entregador
-- 3. Função close_delivery_shift calcula R$5/entrega + R$10 fixo combustível
-- 4. Trava de horário no delivery: cutoff_time em restaurant_settings
-- 5. Garçom não pode editar pedido após envio (RLS em order_items)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CPF EM PROFILES
-- ----------------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cpf TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_cpf ON profiles(cpf) WHERE cpf IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. TABELA DE PAGAMENTOS DE ENTREGADORES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    driver_name TEXT NOT NULL,
    deliveries_count INT NOT NULL DEFAULT 0,
    per_delivery_rate NUMERIC(10,2) NOT NULL DEFAULT 5.00,
    fuel_fixed NUMERIC(10,2) NOT NULL DEFAULT 10.00,
    total NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_driver_payouts_shift ON driver_payouts(shift_id);
CREATE INDEX IF NOT EXISTS idx_driver_payouts_driver ON driver_payouts(driver_name);

ALTER TABLE driver_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Master e Gerente veem pagamentos de entregadores" ON driver_payouts;
CREATE POLICY "Master e Gerente veem pagamentos de entregadores" ON driver_payouts FOR ALL TO authenticated
    USING (current_user_role() IN ('MASTER', 'GERENTE'))
    WITH CHECK (current_user_role() IN ('MASTER', 'GERENTE'));

-- ----------------------------------------------------------------------------
-- 3. FUNÇÃO DE FECHAMENTO DE TURNO DE DELIVERY
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION close_delivery_shift(p_shift_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_rate NUMERIC := 5.00;
    v_fuel NUMERIC := 10.00;
    v_drivers TEXT[];
    v_driver TEXT;
    v_count INT;
    v_total NUMERIC;
    v_results JSONB := '[]'::JSONB;
BEGIN
    -- Lista todos os entregadores que fizeram entregas neste turno
    SELECT ARRAY_AGG(DISTINCT driver_name) INTO v_drivers
    FROM delivery_orders
    WHERE shift_id = p_shift_id AND driver_name IS NOT NULL AND status = 'DELIVERED';

    IF v_drivers IS NULL THEN
        RETURN jsonb_build_object('message', 'Nenhuma entrega concluída neste turno.');
    END IF;

    FOREACH v_driver IN ARRAY v_drivers LOOP
        SELECT COUNT(*) INTO v_count
        FROM delivery_orders
        WHERE shift_id = p_shift_id AND driver_name = v_driver AND status = 'DELIVERED';

        v_total := (v_count * v_rate) + v_fuel;

        INSERT INTO driver_payouts (shift_id, driver_name, deliveries_count, per_delivery_rate, fuel_fixed, total)
        VALUES (p_shift_id, v_driver, v_count, v_rate, v_fuel, v_total);

        v_results := v_results || jsonb_build_object(
            'driver', v_driver,
            'deliveries', v_count,
            'total', v_total
        );
    END LOOP;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (p_shift_id, v_uid, 'DELIVERY_PAYOUT_CALCULATED', 'driver_payouts', p_shift_id::TEXT, v_results);

    RETURN v_results;
END;
$$;
REVOKE ALL ON FUNCTION close_delivery_shift(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION close_delivery_shift(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. TRAVA DE HORÁRIO NO DELIVERY
-- ----------------------------------------------------------------------------
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS delivery_cutoff_time TIME;
COMMENT ON COLUMN restaurant_settings.delivery_cutoff_time IS 'Horário limite para aceitar pedidos de delivery (ex: 23:00). NULL = sem trava.';

-- ----------------------------------------------------------------------------
-- 5. BLOQUEIO DE EDIÇÃO PELO GARÇOM APÓS ENVIO
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff can update order items" ON order_items;
CREATE POLICY "Staff can update order items" ON order_items FOR UPDATE TO authenticated
    USING (
        current_user_role() IN ('MASTER', 'GERENTE')
        OR (current_user_role() = 'GARCOM' AND status = 'RECEIVED')
    )
    WITH CHECK (
        current_user_role() IN ('MASTER', 'GERENTE')
        OR (current_user_role() = 'GARCOM' AND status = 'RECEIVED')
    );

select 'MIGRATION_00020_OK' as resultado;
-- >>> FIM: 00020_driver_pay_and_staff_cpf.sql <<<

-- ============================================================================
-- >>> INÍCIO: 00021_table_management.sql <<<
-- ============================================================================
-- ============================================================================
-- MIGRATION 00021: GERENCIAMENTO DE MESAS (ADICIONAR/REMOVER/EDITAR)
-- 1. Função create_restaurant_table para adicionar mesas dinamicamente
-- 2. Função update_restaurant_table para editar capacidade/número
-- 3. Função deactivate_restaurant_table para desativar (não apaga histórico)
-- 4. RLS: apenas MASTER e GERENTE podem gerenciar mesas
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CRIAR MESA
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_restaurant_table(
    p_number INT,
    p_capacity INT DEFAULT 4
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_id UUID;
BEGIN
    IF p_number < 1 OR p_number > 99 THEN
        RAISE EXCEPTION 'Número da mesa deve estar entre 1 e 99.';
    END IF;
    IF p_capacity < 1 OR p_capacity > 50 THEN
        RAISE EXCEPTION 'Capacidade deve estar entre 1 e 50.';
    END IF;
    IF EXISTS (SELECT 1 FROM restaurant_tables WHERE number = p_number AND active) THEN
        RAISE EXCEPTION 'Já existe uma mesa ativa com o número %.', p_number;
    END IF;

    INSERT INTO restaurant_tables (number, capacity, status, active, updated_by)
    VALUES (p_number, p_capacity, 'LIVRE', true, v_uid)
    RETURNING id INTO v_id;

    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_data)
    VALUES (v_uid, 'CRIAR_MESA', 'restaurant_tables', v_id::TEXT,
            jsonb_build_object('number', p_number, 'capacity', p_capacity));

    RETURN v_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. EDITAR MESA
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_restaurant_table(
    p_table_id UUID,
    p_number INT,
    p_capacity INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_old RECORD;
BEGIN
    SELECT * INTO v_old FROM restaurant_tables WHERE id = p_table_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mesa não encontrada.'; END IF;

    IF p_number < 1 OR p_number > 99 THEN
        RAISE EXCEPTION 'Número da mesa deve estar entre 1 e 99.';
    END IF;
    IF p_capacity < 1 OR p_capacity > 50 THEN
        RAISE EXCEPTION 'Capacidade deve estar entre 1 e 50.';
    END IF;
    IF EXISTS (SELECT 1 FROM restaurant_tables WHERE number = p_number AND id <> p_table_id AND active) THEN
        RAISE EXCEPTION 'Já existe outra mesa ativa com o número %.', p_number;
    END IF;
    IF v_old.status = 'OCUPADA' AND p_number <> v_old.number THEN
        RAISE EXCEPTION 'Não é possível alterar o número de uma mesa ocupada.';
    END IF;

    UPDATE restaurant_tables
       SET number = p_number,
           capacity = p_capacity,
           updated_by = v_uid,
           updated_at = NOW()
     WHERE id = p_table_id;

    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (v_uid, 'EDITAR_MESA', 'restaurant_tables', p_table_id::TEXT,
            jsonb_build_object('number', v_old.number, 'capacity', v_old.capacity),
            jsonb_build_object('number', p_number, 'capacity', p_capacity));
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. DESATIVAR MESA
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION deactivate_restaurant_table(p_table_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_table RECORD;
BEGIN
    SELECT * INTO v_table FROM restaurant_tables WHERE id = p_table_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mesa não encontrada.'; END IF;
    IF v_table.status = 'OCUPADA' THEN
        RAISE EXCEPTION 'Não é possível desativar uma mesa ocupada. Encerre a comanda primeiro.';
    END IF;

    UPDATE restaurant_tables
       SET active = false,
           updated_by = v_uid,
           updated_at = NOW()
     WHERE id = p_table_id;

    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_data)
    VALUES (v_uid, 'DESATIVAR_MESA', 'restaurant_tables', p_table_id::TEXT,
            jsonb_build_object('number', v_table.number));
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. PERMISSÕES
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION create_restaurant_table(INT, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION update_restaurant_table(UUID, INT, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION deactivate_restaurant_table(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_restaurant_table(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_restaurant_table(UUID, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION deactivate_restaurant_table(UUID) TO authenticated;
-- >>> FIM: 00021_table_management.sql <<<

-- ============================================================================
-- >>> INÍCIO: 00022_delivery_zones_crud.sql <<<
-- ============================================================================
-- ============================================================================
-- MIGRATION 00022: CRUD DE BAIRROS / TAXAS DE ENTREGA
-- 1. Função upsert_delivery_zone para criar/editar bairro e taxa
-- 2. Função deactivate_delivery_zone para desativar (não apaga histórico)
-- 3. RLS: apenas MASTER e GERENTE podem gerenciar zonas
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CRIAR / EDITAR BAIRRO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION upsert_delivery_zone(
    p_name TEXT,
    p_fee NUMERIC(10,2),
    p_display_order INT DEFAULT NULL,
    p_active BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_id UUID;
    v_trimmed TEXT := TRIM(COALESCE(p_name, ''));
BEGIN
    IF length(v_trimmed) < 2 THEN
        RAISE EXCEPTION 'Nome do bairro deve ter pelo menos 2 caracteres.';
    END IF;
    IF p_fee IS NULL OR p_fee < 0 THEN
        RAISE EXCEPTION 'Taxa de entrega não pode ser negativa.';
    END IF;

    SELECT id INTO v_id FROM delivery_zones WHERE lower(name) = lower(v_trimmed);

    IF FOUND THEN
        UPDATE delivery_zones
           SET fee = p_fee,
               active = p_active,
               display_order = COALESCE(p_display_order, display_order),
               updated_at = NOW()
         WHERE id = v_id;
    ELSE
        INSERT INTO delivery_zones (name, fee, display_order, active)
        VALUES (v_trimmed, p_fee, COALESCE(p_display_order, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM delivery_zones)), p_active)
        RETURNING id INTO v_id;
    END IF;

    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_data)
    VALUES (v_uid, 'UPSERT_DELIVERY_ZONE', 'delivery_zones', v_id::TEXT,
            jsonb_build_object('name', v_trimmed, 'fee', p_fee, 'active', p_active));

    RETURN v_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. DESATIVAR BAIRRO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION deactivate_delivery_zone(p_zone_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
BEGIN
    UPDATE delivery_zones SET active = false, updated_at = NOW() WHERE id = p_zone_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Bairro não encontrado.'; END IF;

    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_data)
    VALUES (v_uid, 'DEACTIVATE_DELIVERY_ZONE', 'delivery_zones', p_zone_id::TEXT, NULL);
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. PERMISSÕES
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION upsert_delivery_zone(TEXT, NUMERIC, INT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION deactivate_delivery_zone(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION upsert_delivery_zone(TEXT, NUMERIC, INT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION deactivate_delivery_zone(UUID) TO authenticated;
-- >>> FIM: 00022_delivery_zones_crud.sql <<<

-- ============================================================================
-- MIGRATION 00023: conserto de compatibilidade (pode rodar sempre, com segurança)
--
-- Desfaz o que a versão ANTIGA da 00019 alterou, caso ela tenha sido aplicada:
--  1. updated_by volta de UUID para TEXT (as funções do sistema gravam texto)
--  2. delivery_orders.status e payment_method voltam de ENUM para TEXT
--  3. delivery_orders e whatsapp_outbox voltam ao Realtime (aviso de pedido novo)
-- Se a 00019 antiga nunca rodou, esta migração não altera nada.
-- ============================================================================

-- 1. updated_by → TEXT
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['tabs', 'orders', 'order_items', 'daily_prep_stock', 'restaurant_tables', 'shifts'] LOOP
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, 'fk_' || t || '_updated_by');
        IF EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = t AND column_name = 'updated_by' AND data_type = 'uuid') THEN
            EXECUTE format('ALTER TABLE public.%I ALTER COLUMN updated_by TYPE TEXT USING updated_by::TEXT', t);
        END IF;
    END LOOP;
END $$;

-- 2. Delivery: status e forma de pagamento → TEXT (mantém as regras de valores válidos)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'delivery_orders' AND column_name = 'status' AND data_type = 'USER-DEFINED') THEN
        ALTER TABLE delivery_orders ALTER COLUMN status DROP DEFAULT;
        ALTER TABLE delivery_orders ALTER COLUMN status TYPE TEXT USING status::TEXT;
        ALTER TABLE delivery_orders ALTER COLUMN status SET DEFAULT 'CONFIRMED';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'delivery_orders' AND column_name = 'payment_method' AND data_type = 'USER-DEFINED') THEN
        ALTER TABLE delivery_orders ALTER COLUMN payment_method TYPE TEXT USING payment_method::TEXT;
    END IF;
END $$;

-- 3. Realtime: aviso de pedido de delivery novo e status do WhatsApp no painel
DO $$
DECLARE
    t TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        FOREACH t IN ARRAY ARRAY['delivery_orders', 'whatsapp_outbox'] LOOP
            IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t)
               AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                                WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
                EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
            END IF;
        END LOOP;
    END IF;
END $$;

select 'MIGRATION_00023_OK' as resultado;

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


-- 00025: reforço de segurança — fixa search_path nas funções SECURITY DEFINER que ainda não tinham.
-- Idempotente: só altera a função se ela existir com essa assinatura.
DO $$
DECLARE
    v_sig TEXT;
BEGIN
    FOREACH v_sig IN ARRAY ARRAY[
        'public.open_shift_with_stock(TEXT, UUID, TEXT, NUMERIC, JSONB)',
        'public.toggle_product_exhaustion(UUID, UUID, BOOLEAN, UUID, TEXT)',
        'public.adjust_stock_physical_count(UUID, UUID, INT, TEXT, UUID)'
    ] LOOP
        IF to_regprocedure(v_sig) IS NOT NULL THEN
            EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', v_sig);
        END IF;
    END LOOP;
END $$;


-- ============================================================================
-- MIGRATION 00026: WHATSAPP — ETAPA "PRONTO", AVISO DE PIX CONFIRMADO E TEXTOS EDITÁVEIS
--  * delivery_orders.status ganha 'READY' (pronto, aguardando o entregador)
--  * whatsapp_outbox.event ganha 'READY' e 'PAID' (PIX conferido pelo caixa)
--  * restaurant_settings.whatsapp_templates: texto e liga/desliga de cada mensagem
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================================

-- 1. Novos valores permitidos ------------------------------------------------------
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT conname FROM pg_constraint
              WHERE conrelid = 'public.delivery_orders'::regclass AND contype = 'c'
                AND pg_get_constraintdef(oid) ILIKE '%OUT_FOR_DELIVERY%' LOOP
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
ALTER TABLE whatsapp_outbox ADD CONSTRAINT whatsapp_outbox_event_check
    CHECK (event IN ('CONFIRMED', 'PAID', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'));

-- 2. Textos das mensagens (null = textos padrão da função whatsapp-dispatch) ------------
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS whatsapp_templates JSONB;

-- 3. Equipe pode marcar o pedido como pronto ----------------------------------------------
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

-- 4. Fila: pronto e PIX confirmado também geram mensagem -------------------------------
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
    ELSIF NEW.status IS DISTINCT FROM OLD.status
          AND NEW.status IN ('READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED') THEN
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

select 'MIGRATION_00026_OK' as resultado;


-- ============================================================================
-- MIGRATION 00027: PÁGINA PÚBLICA DE ACOMPANHAMENTO DO PEDIDO (#/pedido/<id>)
-- O link vai na mensagem de WhatsApp do cliente. O id do pedido é um UUID
-- aleatório (impossível de adivinhar), então funciona como chave de acesso.
-- Não devolve telefone nem dados internos.
-- ============================================================================
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

select 'MIGRATION_00027_OK' as resultado;

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

-- ============================================================================
-- MIGRATION 00029: ROBÔ DE ATENDIMENTO NO WHATSAPP (respostas automáticas)
--  * restaurant_settings.whatsapp_bot: liga/desliga, lista de teste e textos
--  * whatsapp_conversations: uma linha por cliente (robô pausado? até quando?)
--  * whatsapp_bot_messages: histórico curto da conversa (contexto do robô)
-- Quem grava é a Edge Function whatsapp-bot (service_role). A equipe só lê.
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================================

ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS whatsapp_bot JSONB;

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
    phone TEXT PRIMARY KEY,                 -- só dígitos, como a Z-API envia (com DDI)
    customer_name TEXT,
    bot_paused_until TIMESTAMPTZ,           -- robô em silêncio até este horário
    pause_reason TEXT,                      -- HANDOFF (pediu atendente), HUMAN (equipe respondeu), LIMIT (mensagens demais)
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_preview TEXT
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_last ON whatsapp_conversations(last_message_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_bot_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('IN', 'BOT', 'HUMAN')),
    body TEXT NOT NULL,
    provider_message_id TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_bot_messages_phone ON whatsapp_bot_messages(phone, created_at DESC);

-- Conversas de clientes: só proprietário e gerente leem
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_bot_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read whatsapp conversations" ON whatsapp_conversations;
CREATE POLICY "Managers read whatsapp conversations" ON whatsapp_conversations FOR SELECT TO authenticated
    USING (current_user_role() IN ('MASTER', 'GERENTE'));

DROP POLICY IF EXISTS "Managers read whatsapp bot messages" ON whatsapp_bot_messages;
CREATE POLICY "Managers read whatsapp bot messages" ON whatsapp_bot_messages FOR SELECT TO authenticated
    USING (current_user_role() IN ('MASTER', 'GERENTE'));

-- Devolver a conversa ao robô (depois que o atendente resolveu)
CREATE OR REPLACE FUNCTION resume_whatsapp_bot(p_phone TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
BEGIN
    UPDATE whatsapp_conversations SET bot_paused_until = NULL, pause_reason = NULL WHERE phone = p_phone;
END;
$$;
REVOKE ALL ON FUNCTION resume_whatsapp_bot(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION resume_whatsapp_bot(TEXT) TO authenticated;

select 'MIGRATION_00029_OK' as resultado;


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


-- ============================================================================
-- MIGRATION 00031: ESPETO "COM ACOMPANHAMENTO" DESCONTA O ESPETO + 1 ARROZ
-- ----------------------------------------------------------------------------
-- Regra (pelo nome do produto, igual ao printer-bridge):
--   "Picanha com acompanhamento"  →  usa o estoque de "Picanha" + 1 "Arroz".
-- O saldo do combo passa a ser sempre min(saldo do espeto, saldo do arroz).
-- Funciona com TODAS as funções existentes (pedido, delivery, cancelamento,
-- anular comanda, PIX vencido...) porque é feito por gatilho em daily_prep_stock:
-- qualquer mudança no saldo do combo é repassada ao espeto e ao arroz.
-- Idempotente.
-- ============================================================================

-- Peças de estoque de um combo (NULL quando o produto não é combo)
CREATE OR REPLACE FUNCTION combo_stock_parts(p_product_id UUID, OUT base_id UUID, OUT side_id UUID)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
    v_name TEXT;
BEGIN
    SELECT name INTO v_name FROM products WHERE id = p_product_id;
    IF v_name IS NULL OR v_name !~* '\s+com acompanhamento\s*$' THEN RETURN; END IF;
    SELECT id INTO base_id FROM products
     WHERE active AND id <> p_product_id
       AND lower(trim(name)) = lower(trim(regexp_replace(v_name, '\s+com acompanhamento\s*$', '', 'i')))
     ORDER BY created_at LIMIT 1;
    SELECT id INTO side_id FROM products
     WHERE active AND lower(trim(name)) = 'arroz'
     ORDER BY created_at LIMIT 1;
END;
$$;

-- Quanto dá para vender do combo no turno (menor saldo entre as peças que têm estoque no turno)
CREATE OR REPLACE FUNCTION combo_available(p_shift_id UUID, p_product_id UUID, p_fallback INT)
RETURNS INT LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
    v_base UUID; v_side UUID; v_min INT;
BEGIN
    SELECT base_id, side_id INTO v_base, v_side FROM combo_stock_parts(p_product_id);
    SELECT MIN(current_quantity) INTO v_min FROM daily_prep_stock
     WHERE shift_id = p_shift_id AND product_id IN (v_base, v_side);
    RETURN COALESCE(v_min, p_fallback);
END;
$$;

-- Recalcula (e cria, se faltar) as linhas dos combos do turno
CREATE OR REPLACE FUNCTION sync_combo_stock(p_shift_id UUID, p_exclude_id UUID DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_prod RECORD; v_avail INT;
BEGIN
    PERFORM set_config('app.combo_sync', 'on', true);
    FOR v_prod IN SELECT p.id FROM products p
                   WHERE p.active AND p.tracks_stock AND p.name ~* '\s+com acompanhamento\s*$' LOOP
        IF NOT EXISTS (SELECT 1 FROM daily_prep_stock d, combo_stock_parts(v_prod.id) c
                        WHERE d.shift_id = p_shift_id AND d.product_id IN (c.base_id, c.side_id)) THEN
            CONTINUE;
        END IF;
        v_avail := GREATEST(0, combo_available(p_shift_id, v_prod.id, 0));
        IF EXISTS (SELECT 1 FROM daily_prep_stock WHERE shift_id = p_shift_id AND product_id = v_prod.id) THEN
            UPDATE daily_prep_stock
               SET current_quantity = v_avail,
                   is_exhausted = CASE WHEN v_avail <= 0 THEN true
                                       WHEN current_quantity <= 0 THEN false
                                       ELSE is_exhausted END,
                   exhausted_at = CASE WHEN v_avail <= 0 THEN COALESCE(exhausted_at, NOW())
                                       WHEN current_quantity <= 0 THEN NULL
                                       ELSE exhausted_at END
             WHERE shift_id = p_shift_id AND product_id = v_prod.id
               AND id IS DISTINCT FROM p_exclude_id
               AND (current_quantity <> v_avail OR (v_avail <= 0) <> is_exhausted);
        ELSE
            INSERT INTO daily_prep_stock (shift_id, product_id, initial_quantity, current_quantity, is_exhausted)
            VALUES (p_shift_id, v_prod.id, v_avail, v_avail, v_avail <= 0)
            ON CONFLICT (shift_id, product_id) DO NOTHING;
        END IF;
    END LOOP;
    PERFORM set_config('app.combo_sync', 'off', true);
END;
$$;

-- Venda/cancelamento do combo → repassa ao espeto e ao arroz
CREATE OR REPLACE FUNCTION trg_combo_stock_before()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_base UUID; v_side UUID; v_part UUID; v_row daily_prep_stock; v_name TEXT;
    v_d_cur INT; v_d_cons INT; v_d_disc INT;
BEGIN
    IF current_setting('app.combo_sync', true) = 'on' THEN RETURN NEW; END IF;
    SELECT base_id, side_id INTO v_base, v_side FROM combo_stock_parts(NEW.product_id);
    IF v_base IS NULL AND v_side IS NULL THEN RETURN NEW; END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.current_quantity := GREATEST(0, combo_available(NEW.shift_id, NEW.product_id, NEW.current_quantity));
        IF NEW.current_quantity <= 0 THEN NEW.is_exhausted := true; END IF;
        RETURN NEW;
    END IF;

    v_d_cur := NEW.current_quantity - OLD.current_quantity;
    v_d_cons := NEW.consumed_quantity - OLD.consumed_quantity;
    v_d_disc := GREATEST(0, NEW.discarded_quantity - OLD.discarded_quantity);
    IF v_d_cur = 0 AND v_d_cons = 0 AND v_d_disc = 0 THEN RETURN NEW; END IF;

    PERFORM set_config('app.combo_sync', 'on', true);
    FOREACH v_part IN ARRAY ARRAY[v_base, v_side] LOOP
        CONTINUE WHEN v_part IS NULL;
        SELECT * INTO v_row FROM daily_prep_stock
         WHERE shift_id = NEW.shift_id AND product_id = v_part FOR UPDATE;
        CONTINUE WHEN NOT FOUND;
        IF v_row.current_quantity + v_d_cur < 0 THEN
            SELECT name INTO v_name FROM products WHERE id = v_part;
            RAISE EXCEPTION 'Estoque insuficiente de "%" (disponível: %).', v_name, v_row.current_quantity;
        END IF;
        UPDATE daily_prep_stock
           SET current_quantity = current_quantity + v_d_cur,
               consumed_quantity = GREATEST(0, consumed_quantity + v_d_cons),
               discarded_quantity = discarded_quantity + v_d_disc,
               is_exhausted = CASE WHEN current_quantity + v_d_cur <= 0 THEN true
                                   WHEN v_d_cur > 0 THEN false ELSE is_exhausted END,
               exhausted_at = CASE WHEN current_quantity + v_d_cur <= 0 THEN COALESCE(exhausted_at, NOW())
                                   WHEN v_d_cur > 0 THEN NULL ELSE exhausted_at END
         WHERE id = v_row.id;
        IF v_d_cur <> 0 THEN
            UPDATE products SET available = (v_row.current_quantity + v_d_cur > 0) WHERE id = v_part;
        END IF;
    END LOOP;
    PERFORM set_config('app.combo_sync', 'off', true);

    -- Os outros combos que usam o mesmo espeto/arroz (esta linha é recalculada aqui mesmo)
    PERFORM sync_combo_stock(NEW.shift_id, NEW.id);
    NEW.current_quantity := GREATEST(0, combo_available(NEW.shift_id, NEW.product_id, NEW.current_quantity));
    IF NEW.current_quantity <= 0 THEN
        NEW.is_exhausted := true;
        NEW.exhausted_at := COALESCE(NEW.exhausted_at, NOW());
    END IF;
    RETURN NEW;
END;
$$;

-- Espeto ou arroz mudou (venda avulsa, ajuste, abertura do turno) → recalcula os combos
CREATE OR REPLACE FUNCTION trg_combo_stock_after()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_name TEXT;
BEGIN
    IF current_setting('app.combo_sync', true) = 'on' THEN RETURN NULL; END IF;
    IF TG_OP = 'UPDATE' AND NEW.current_quantity = OLD.current_quantity THEN RETURN NULL; END IF;
    SELECT name INTO v_name FROM products WHERE id = NEW.product_id;
    IF v_name IS NULL OR v_name ~* '\s+com acompanhamento\s*$' THEN RETURN NULL; END IF;
    IF lower(trim(v_name)) = 'arroz'
       OR EXISTS (SELECT 1 FROM products WHERE active AND lower(trim(name)) = lower(trim(v_name)) || ' com acompanhamento') THEN
        PERFORM sync_combo_stock(NEW.shift_id, NULL);
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS combo_stock_before ON daily_prep_stock;
CREATE TRIGGER combo_stock_before
    BEFORE INSERT OR UPDATE OF current_quantity, consumed_quantity, discarded_quantity ON daily_prep_stock
    FOR EACH ROW EXECUTE FUNCTION trg_combo_stock_before();

DROP TRIGGER IF EXISTS combo_stock_after ON daily_prep_stock;
CREATE TRIGGER combo_stock_after
    AFTER INSERT OR UPDATE OF current_quantity ON daily_prep_stock
    FOR EACH ROW EXECUTE FUNCTION trg_combo_stock_after();

REVOKE ALL ON FUNCTION sync_combo_stock(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Acerta o turno aberto agora
DO $$
DECLARE v_shift UUID;
BEGIN
    FOR v_shift IN SELECT id FROM shifts WHERE status = 'ABERTO' LOOP
        PERFORM sync_combo_stock(v_shift, NULL);
    END LOOP;
END $$;


-- ============================================================================
-- MIGRATION 00032: EXCLUIR CUPONS DA FILA DE IMPRESSÃO
-- ----------------------------------------------------------------------------
-- Gerência pode excluir cupons recentes (impressos, com falha ou aguardando).
-- Cupom aguardando que for excluído NÃO é mais impresso pelo printer-bridge.
-- Não mexe em pedido/venda: só na fila de cupons. Fica registrado na auditoria.
-- Idempotente.
-- ============================================================================

CREATE OR REPLACE FUNCTION delete_print_jobs(p_job_ids UUID[])
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_count INT;
BEGIN
    IF p_job_ids IS NULL OR array_length(p_job_ids, 1) IS NULL THEN
        RETURN 0;
    END IF;

    WITH removed AS (
        DELETE FROM print_queue WHERE id = ANY(p_job_ids)
        RETURNING id, order_number, sector, status
    )
    SELECT COUNT(*) INTO v_count FROM removed;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (NULL, v_uid, 'CUPONS_EXCLUIDOS', 'print_queue', array_to_string(p_job_ids[1:5], ','),
            jsonb_build_object('quantidade', v_count));

    RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION delete_print_jobs(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_print_jobs(UUID[]) TO authenticated;
