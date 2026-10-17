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
