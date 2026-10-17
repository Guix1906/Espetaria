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