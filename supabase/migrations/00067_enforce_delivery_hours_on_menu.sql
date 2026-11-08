-- ============================================================================
-- Migration: 00067_enforce_delivery_hours_on_menu.sql
-- Cardápio digital e status público respeitam fielmente o horário de
-- funcionamento oficial (18h às 23h, fechado às quartas), mesmo se o turno
-- tiver ficado aberto de um dia para o outro por esquecimento do cliente.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_public_menu()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_shift_id UUID;
    v_is_open BOOLEAN;
BEGIN
    SELECT id INTO v_shift_id FROM shifts WHERE status = 'ABERTO' ORDER BY opened_at DESC LIMIT 1;

    -- O cardápio só é considerado aberto se houver turno aberto E estiver dentro do horário de funcionamento oficial
    v_is_open := (v_shift_id IS NOT NULL AND COALESCE(delivery_hours_open(NOW()), FALSE));

    RETURN jsonb_build_object(
        'is_open', v_is_open,
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

GRANT EXECUTE ON FUNCTION get_public_menu() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
