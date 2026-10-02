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
