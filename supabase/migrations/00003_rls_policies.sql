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
