-- ============================================================================
-- MIGRATION 00041: ABRIR TURNO COM ESPETO "COM ACOMPANHAMENTO" NÃO DÁ MAIS ERRO
-- ----------------------------------------------------------------------------
-- Ao gravar o estoque do espeto (ou do arroz), o gatilho da 00031 já cria a linha
-- do combo "X com acompanhamento" no turno. Quando a carga do turno trazia o combo
-- depois, o INSERT batia em uq_shift_product (duplicate key). Agora a linha que já
-- existe é mantida: o saldo do combo vem sempre do espeto + arroz.
-- Idempotente.
-- ============================================================================
CREATE OR REPLACE FUNCTION open_shift_with_stock(
    p_shift_name TEXT,
    p_opened_by UUID,
    p_initial_notes TEXT,
    p_cash_start NUMERIC(10, 2),
    p_stock_items JSONB -- Array of { product_id, cubas_count, portions_per_cuba, quantity }
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_shift_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_cubas NUMERIC(6, 2);
    v_portions_per_cuba INT;
    v_initial_qty INT;
    v_active_shift_id UUID;
    v_row_id UUID;
BEGIN
    SELECT id INTO v_active_shift_id FROM shifts WHERE status = 'ABERTO' LIMIT 1;
    IF v_active_shift_id IS NOT NULL THEN
        RAISE EXCEPTION 'Já existe um turno aberto (%s). Feche o turno atual antes de abrir um novo.', v_active_shift_id;
    END IF;

    INSERT INTO shifts (name, opened_by, initial_notes, cash_drawer_start, status)
    VALUES (p_shift_name, p_opened_by, p_initial_notes, COALESCE(p_cash_start, 0.00), 'ABERTO')
    RETURNING id INTO v_shift_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_stock_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_cubas := COALESCE((v_item->>'cubas_count')::NUMERIC, 0);
        v_portions_per_cuba := COALESCE((v_item->>'portions_per_cuba')::INT, 1);

        IF v_cubas > 0 THEN
            v_initial_qty := ROUND(v_cubas * v_portions_per_cuba);
        ELSE
            v_initial_qty := COALESCE((v_item->>'quantity')::INT, 0);
        END IF;

        IF v_initial_qty > 0 THEN
            v_row_id := NULL;
            INSERT INTO daily_prep_stock (shift_id, product_id, cubas_count, portions_per_cuba,
                                          initial_quantity, current_quantity, is_exhausted)
            VALUES (v_shift_id, v_product_id, v_cubas, v_portions_per_cuba, v_initial_qty, v_initial_qty, false)
            ON CONFLICT (shift_id, product_id) DO NOTHING
            RETURNING id INTO v_row_id;

            -- Linha já criada pelo gatilho do combo (ou produto repetido na carga): mantém a existente
            CONTINUE WHEN v_row_id IS NULL;

            INSERT INTO stock_movements (shift_id, product_id, quantity, movement_type,
                                         previous_balance, new_balance, reason, user_id)
            VALUES (v_shift_id, v_product_id, v_initial_qty, 'PRODUCAO', 0, v_initial_qty,
                    'Abertura de turno - Produção do dia (Mise en place)', p_opened_by);

            UPDATE products SET available = true WHERE id = v_product_id;
        END IF;
    END LOOP;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (v_shift_id, p_opened_by, 'ABERTURA_TURNO', 'shifts', v_shift_id::TEXT,
            jsonb_build_object('shift_name', p_shift_name, 'items_count', jsonb_array_length(p_stock_items)));

    RETURN v_shift_id;
END;
$$;

REVOKE ALL ON FUNCTION open_shift_with_stock(TEXT, UUID, TEXT, NUMERIC, JSONB) FROM PUBLIC, anon, authenticated;
