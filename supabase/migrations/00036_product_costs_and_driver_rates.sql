-- ============================================================================
-- MIGRATION 00036: CUSTO DOS PRODUTOS + VALORES DO ENTREGADOR CONFIGURÁVEIS
-- 1. product_costs: custo de cada produto (só Master/Gerente leem; fica fora de
--    products porque products é lido pelo cardápio público)
-- 2. restaurant_settings.driver_per_delivery / driver_fuel_fixed (antes fixos
--    em R$ 5,00 + R$ 10,00 dentro de close_delivery_shift). Padrão 0.
-- 3. close_delivery_shift passa a usar os valores das configurações
-- Tudo idempotente: pode rodar mais de uma vez.
-- ============================================================================

-- 1. Custo dos produtos
CREATE TABLE IF NOT EXISTS product_costs (
    product_id UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    cost NUMERIC(10,2) NOT NULL CHECK (cost >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID
);

ALTER TABLE product_costs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON product_costs FROM anon;
DROP POLICY IF EXISTS "Master e Gerente gerenciam custos" ON product_costs;
CREATE POLICY "Master e Gerente gerenciam custos" ON product_costs FOR ALL TO authenticated
    USING (current_user_role() IN ('MASTER', 'GERENTE'))
    WITH CHECK (current_user_role() IN ('MASTER', 'GERENTE'));

-- 2. Valores pagos ao entregador
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS driver_per_delivery NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS driver_fuel_fixed NUMERIC(10,2) NOT NULL DEFAULT 0;

-- 3. Cálculo do pagamento dos entregadores com os valores das configurações
CREATE OR REPLACE FUNCTION close_delivery_shift(p_shift_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    v_rate NUMERIC := 0;
    v_fuel NUMERIC := 0;
    v_drivers TEXT[];
    v_driver TEXT;
    v_count INT;
    v_total NUMERIC;
    v_results JSONB := '[]'::JSONB;
BEGIN
    SELECT COALESCE(driver_per_delivery, 0), COALESCE(driver_fuel_fixed, 0)
      INTO v_rate, v_fuel
      FROM restaurant_settings LIMIT 1;
    v_rate := COALESCE(v_rate, 0);
    v_fuel := COALESCE(v_fuel, 0);

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

        v_results := v_results || jsonb_build_object('driver', v_driver, 'deliveries', v_count, 'total', v_total);
    END LOOP;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (p_shift_id, v_uid, 'DELIVERY_PAYOUT_CALCULATED', 'driver_payouts', p_shift_id::TEXT, v_results);

    RETURN v_results;
END;
$$;
REVOKE ALL ON FUNCTION close_delivery_shift(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION close_delivery_shift(UUID) TO authenticated;

select 'MIGRATION_00036_OK' as resultado;
