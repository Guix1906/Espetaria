-- ============================================================================
-- Migration: 00065_combo_requires_both_parts.sql
-- Garante que combo_available exija a presença de AMBAS as peças no turno
-- (espeto base E arroz). Se o espeto base não estiver no turno, o saldo do
-- combo é 0 (e não herda sozinho o saldo do arroz de 130).
-- ============================================================================

CREATE OR REPLACE FUNCTION combo_available(p_shift_id UUID, p_product_id UUID, p_fallback INT)
RETURNS INT LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
    v_base UUID; v_side UUID; v_min INT; v_count INT;
BEGIN
    SELECT base_id, side_id INTO v_base, v_side FROM combo_stock_parts(p_product_id);
    IF v_base IS NULL OR v_side IS NULL THEN
        RETURN 0;
    END IF;

    -- Confere se AMBOS (espeto base e arroz) estão presentes no turno
    SELECT COUNT(*), MIN(current_quantity) INTO v_count, v_min
      FROM daily_prep_stock
     WHERE shift_id = p_shift_id AND product_id IN (v_base, v_side);

    -- Se qualquer uma das peças não estiver no turno, o combo não pode ser vendido (saldo = 0)
    IF v_count < 2 THEN
        RETURN 0;
    END IF;

    RETURN COALESCE(v_min, 0);
END;
$$;

-- Sincroniza os combos do turno atual para corrigir imediatamente
DO $$
DECLARE
    v_shift_id UUID;
BEGIN
    SELECT id INTO v_shift_id FROM shifts WHERE status = 'ABERTO' LIMIT 1;
    IF v_shift_id IS NOT NULL THEN
        PERFORM sync_combo_stock(v_shift_id);
    END IF;
END $$;
