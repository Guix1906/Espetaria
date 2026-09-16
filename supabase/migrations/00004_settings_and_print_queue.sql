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
