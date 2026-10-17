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
