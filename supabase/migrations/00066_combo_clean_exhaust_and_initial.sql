-- ============================================================================
-- Migration: 00066_combo_clean_exhaust_and_initial.sql
-- 1. Ao reativar ou atualizar saldo do combo, limpa exhaust_reason
-- 2. Alinha initial_quantity do combo com o espeto base (em vez de herdar 130 do arroz)
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_combo_stock(p_shift_id UUID, p_exclude_id UUID DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_prod RECORD;
    v_avail INT;
    v_base UUID;
    v_side UUID;
    v_base_initial INT;
BEGIN
    PERFORM set_config('app.combo_sync', 'on', true);
    FOR v_prod IN SELECT p.id FROM products p
                   WHERE p.active AND p.tracks_stock AND p.name ~* '\s+com acompanhamento\s*$' LOOP
        IF NOT EXISTS (SELECT 1 FROM daily_prep_stock d, combo_stock_parts(v_prod.id) c
                        WHERE d.shift_id = p_shift_id AND d.product_id IN (c.base_id, c.side_id)) THEN
            CONTINUE;
        END IF;

        v_avail := GREATEST(0, combo_available(p_shift_id, v_prod.id, 0));
        SELECT base_id, side_id INTO v_base, v_side FROM combo_stock_parts(v_prod.id);
        
        -- Busca quantidade inicial do espeto base
        SELECT initial_quantity INTO v_base_initial
          FROM daily_prep_stock
         WHERE shift_id = p_shift_id AND product_id = v_base;

        IF EXISTS (SELECT 1 FROM daily_prep_stock WHERE shift_id = p_shift_id AND product_id = v_prod.id) THEN
            UPDATE daily_prep_stock
               SET current_quantity = v_avail,
                   initial_quantity = COALESCE(v_base_initial, v_avail, initial_quantity),
                   is_exhausted = (v_avail <= 0),
                   exhausted_at = CASE WHEN v_avail <= 0 THEN COALESCE(exhausted_at, NOW()) ELSE NULL END,
                   exhaust_reason = CASE WHEN v_avail <= 0 THEN exhaust_reason ELSE NULL END,
                   updated_at = NOW()
             WHERE shift_id = p_shift_id AND product_id = v_prod.id
               AND id IS DISTINCT FROM p_exclude_id;
        ELSE
            INSERT INTO daily_prep_stock (
                shift_id,
                product_id,
                initial_quantity,
                current_quantity,
                is_exhausted,
                exhaust_reason
            )
            VALUES (
                p_shift_id,
                v_prod.id,
                COALESCE(v_base_initial, v_avail),
                v_avail,
                (v_avail <= 0),
                CASE WHEN v_avail <= 0 THEN 'Sem estoque no turno' ELSE NULL END
            )
            ON CONFLICT (shift_id, product_id) DO NOTHING;
        END IF;
    END LOOP;
    PERFORM set_config('app.combo_sync', 'off', true);
END;
$$;

-- Sincroniza e limpa imediatamente o turno aberto
DO $$
DECLARE
    v_shift_id UUID;
BEGIN
    SELECT id INTO v_shift_id FROM shifts WHERE status = 'ABERTO' LIMIT 1;
    IF v_shift_id IS NOT NULL THEN
        PERFORM sync_combo_stock(v_shift_id);
    END IF;
END $$;
