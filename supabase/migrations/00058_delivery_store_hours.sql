-- 00058 (05/11/2026): horário do delivery garantido no banco.
-- Delivery/retirada só entra das 18h às 23h (horário de Brasília) e nunca na quarta,
-- mesmo que o turno tenha ficado aberto por esquecimento.
-- Exceção: o gerente pode liberar "só hoje" em Configurações (delivery_open_override_date = hoje).
-- Idempotente: pode rodar mais de uma vez.

ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS delivery_open_override_date DATE;

-- Visão pública do cardápio passa a mostrar a exceção do dia (coluna nova no fim)
CREATE OR REPLACE VIEW restaurant_settings_public AS
SELECT id, name, address, phone, cnpj, service_fee_percent, allow_custom_service_fee, timezone,
       pix_key, pix_key_type, pix_merchant_name, pix_merchant_city, auto_print_orders, print_paper_width,
       whatsapp_auto_enabled, whatsapp_dispatch_url, print_templates, delivery_cutoff_time,
       created_at, updated_at, delivery_eta, pickup_eta, daily_rice_flavors, daily_juice_flavors,
       delivery_open_override_date
  FROM restaurant_settings;
GRANT SELECT ON restaurant_settings_public TO anon, authenticated;

CREATE OR REPLACE FUNCTION delivery_hours_open(p_at TIMESTAMPTZ DEFAULT NOW())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT
        COALESCE((SELECT delivery_open_override_date FROM restaurant_settings LIMIT 1) = (p_at AT TIME ZONE 'America/Sao_Paulo')::DATE, FALSE)
        OR (
            EXTRACT(DOW FROM p_at AT TIME ZONE 'America/Sao_Paulo') <> 3          -- quarta fechado
            AND EXTRACT(HOUR FROM p_at AT TIME ZONE 'America/Sao_Paulo') >= 18
            AND EXTRACT(HOUR FROM p_at AT TIME ZONE 'America/Sao_Paulo') < 23
        );
$$;

CREATE OR REPLACE FUNCTION enforce_delivery_hours()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
    IF NOT COALESCE(delivery_hours_open(NOW()), FALSE) THEN
        RAISE EXCEPTION 'Estamos fechados no momento. Delivery das 18h às 23h, fechado às quartas.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_delivery_hours ON delivery_orders;
CREATE TRIGGER trg_enforce_delivery_hours
    BEFORE INSERT ON delivery_orders
    FOR EACH ROW EXECUTE FUNCTION enforce_delivery_hours();

NOTIFY pgrst, 'reload schema';
