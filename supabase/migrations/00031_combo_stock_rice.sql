-- ============================================================================
-- MIGRATION 00031: ESPETO "COM ACOMPANHAMENTO" DESCONTA O ESPETO + 1 ARROZ
-- ----------------------------------------------------------------------------
-- Regra (pelo nome do produto, igual ao printer-bridge):
--   "Picanha com acompanhamento"  →  usa o estoque de "Picanha" + 1 "Arroz".
-- O saldo do combo passa a ser sempre min(saldo do espeto, saldo do arroz).
-- Funciona com TODAS as funções existentes (pedido, delivery, cancelamento,
-- anular comanda, PIX vencido...) porque é feito por gatilho em daily_prep_stock:
-- qualquer mudança no saldo do combo é repassada ao espeto e ao arroz.
-- Idempotente.
-- ============================================================================

-- Peças de estoque de um combo (NULL quando o produto não é combo)
CREATE OR REPLACE FUNCTION combo_stock_parts(p_product_id UUID, OUT base_id UUID, OUT side_id UUID)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
    v_name TEXT;
BEGIN
    SELECT name INTO v_name FROM products WHERE id = p_product_id;
    IF v_name IS NULL OR v_name !~* '\s+com acompanhamento\s*$' THEN RETURN; END IF;
    SELECT id INTO base_id FROM products
     WHERE active AND id <> p_product_id
       AND lower(trim(name)) = lower(trim(regexp_replace(v_name, '\s+com acompanhamento\s*$', '', 'i')))
     ORDER BY created_at LIMIT 1;
    SELECT id INTO side_id FROM products
     WHERE active AND lower(trim(name)) = 'arroz'
     ORDER BY created_at LIMIT 1;
END;
$$;

-- Quanto dá para vender do combo no turno (menor saldo entre as peças que têm estoque no turno)
CREATE OR REPLACE FUNCTION combo_available(p_shift_id UUID, p_product_id UUID, p_fallback INT)
RETURNS INT LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
    v_base UUID; v_side UUID; v_min INT;
BEGIN
    SELECT base_id, side_id INTO v_base, v_side FROM combo_stock_parts(p_product_id);
    SELECT MIN(current_quantity) INTO v_min FROM daily_prep_stock
     WHERE shift_id = p_shift_id AND product_id IN (v_base, v_side);
    RETURN COALESCE(v_min, p_fallback);
END;
$$;

-- Recalcula (e cria, se faltar) as linhas dos combos do turno
CREATE OR REPLACE FUNCTION sync_combo_stock(p_shift_id UUID, p_exclude_id UUID DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_prod RECORD; v_avail INT;
BEGIN
    PERFORM set_config('app.combo_sync', 'on', true);
    FOR v_prod IN SELECT p.id FROM products p
                   WHERE p.active AND p.tracks_stock AND p.name ~* '\s+com acompanhamento\s*$' LOOP
        IF NOT EXISTS (SELECT 1 FROM daily_prep_stock d, combo_stock_parts(v_prod.id) c
                        WHERE d.shift_id = p_shift_id AND d.product_id IN (c.base_id, c.side_id)) THEN
            CONTINUE;
        END IF;
        v_avail := GREATEST(0, combo_available(p_shift_id, v_prod.id, 0));
        IF EXISTS (SELECT 1 FROM daily_prep_stock WHERE shift_id = p_shift_id AND product_id = v_prod.id) THEN
            UPDATE daily_prep_stock
               SET current_quantity = v_avail,
                   is_exhausted = CASE WHEN v_avail <= 0 THEN true
                                       WHEN current_quantity <= 0 THEN false
                                       ELSE is_exhausted END,
                   exhausted_at = CASE WHEN v_avail <= 0 THEN COALESCE(exhausted_at, NOW())
                                       WHEN current_quantity <= 0 THEN NULL
                                       ELSE exhausted_at END
             WHERE shift_id = p_shift_id AND product_id = v_prod.id
               AND id IS DISTINCT FROM p_exclude_id
               AND (current_quantity <> v_avail OR (v_avail <= 0) <> is_exhausted);
        ELSE
            INSERT INTO daily_prep_stock (shift_id, product_id, initial_quantity, current_quantity, is_exhausted)
            VALUES (p_shift_id, v_prod.id, v_avail, v_avail, v_avail <= 0)
            ON CONFLICT (shift_id, product_id) DO NOTHING;
        END IF;
    END LOOP;
    PERFORM set_config('app.combo_sync', 'off', true);
END;
$$;

-- Venda/cancelamento do combo → repassa ao espeto e ao arroz
CREATE OR REPLACE FUNCTION trg_combo_stock_before()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_base UUID; v_side UUID; v_part UUID; v_row daily_prep_stock; v_name TEXT;
    v_d_cur INT; v_d_cons INT; v_d_disc INT;
BEGIN
    IF current_setting('app.combo_sync', true) = 'on' THEN RETURN NEW; END IF;
    SELECT base_id, side_id INTO v_base, v_side FROM combo_stock_parts(NEW.product_id);
    IF v_base IS NULL AND v_side IS NULL THEN RETURN NEW; END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.current_quantity := GREATEST(0, combo_available(NEW.shift_id, NEW.product_id, NEW.current_quantity));
        IF NEW.current_quantity <= 0 THEN NEW.is_exhausted := true; END IF;
        RETURN NEW;
    END IF;

    v_d_cur := NEW.current_quantity - OLD.current_quantity;
    v_d_cons := NEW.consumed_quantity - OLD.consumed_quantity;
    v_d_disc := GREATEST(0, NEW.discarded_quantity - OLD.discarded_quantity);
    IF v_d_cur = 0 AND v_d_cons = 0 AND v_d_disc = 0 THEN RETURN NEW; END IF;

    PERFORM set_config('app.combo_sync', 'on', true);
    FOREACH v_part IN ARRAY ARRAY[v_base, v_side] LOOP
        CONTINUE WHEN v_part IS NULL;
        SELECT * INTO v_row FROM daily_prep_stock
         WHERE shift_id = NEW.shift_id AND product_id = v_part FOR UPDATE;
        CONTINUE WHEN NOT FOUND;
        IF v_row.current_quantity + v_d_cur < 0 THEN
            SELECT name INTO v_name FROM products WHERE id = v_part;
            RAISE EXCEPTION 'Estoque insuficiente de "%" (disponível: %).', v_name, v_row.current_quantity;
        END IF;
        UPDATE daily_prep_stock
           SET current_quantity = current_quantity + v_d_cur,
               consumed_quantity = GREATEST(0, consumed_quantity + v_d_cons),
               discarded_quantity = discarded_quantity + v_d_disc,
               is_exhausted = CASE WHEN current_quantity + v_d_cur <= 0 THEN true
                                   WHEN v_d_cur > 0 THEN false ELSE is_exhausted END,
               exhausted_at = CASE WHEN current_quantity + v_d_cur <= 0 THEN COALESCE(exhausted_at, NOW())
                                   WHEN v_d_cur > 0 THEN NULL ELSE exhausted_at END
         WHERE id = v_row.id;
        IF v_d_cur <> 0 THEN
            UPDATE products SET available = (v_row.current_quantity + v_d_cur > 0) WHERE id = v_part;
        END IF;
    END LOOP;
    PERFORM set_config('app.combo_sync', 'off', true);

    -- Os outros combos que usam o mesmo espeto/arroz (esta linha é recalculada aqui mesmo)
    PERFORM sync_combo_stock(NEW.shift_id, NEW.id);
    NEW.current_quantity := GREATEST(0, combo_available(NEW.shift_id, NEW.product_id, NEW.current_quantity));
    IF NEW.current_quantity <= 0 THEN
        NEW.is_exhausted := true;
        NEW.exhausted_at := COALESCE(NEW.exhausted_at, NOW());
    END IF;
    RETURN NEW;
END;
$$;

-- Espeto ou arroz mudou (venda avulsa, ajuste, abertura do turno) → recalcula os combos
CREATE OR REPLACE FUNCTION trg_combo_stock_after()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_name TEXT;
BEGIN
    IF current_setting('app.combo_sync', true) = 'on' THEN RETURN NULL; END IF;
    IF TG_OP = 'UPDATE' AND NEW.current_quantity = OLD.current_quantity THEN RETURN NULL; END IF;
    SELECT name INTO v_name FROM products WHERE id = NEW.product_id;
    IF v_name IS NULL OR v_name ~* '\s+com acompanhamento\s*$' THEN RETURN NULL; END IF;
    IF lower(trim(v_name)) = 'arroz'
       OR EXISTS (SELECT 1 FROM products WHERE active AND lower(trim(name)) = lower(trim(v_name)) || ' com acompanhamento') THEN
        PERFORM sync_combo_stock(NEW.shift_id, NULL);
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS combo_stock_before ON daily_prep_stock;
CREATE TRIGGER combo_stock_before
    BEFORE INSERT OR UPDATE OF current_quantity, consumed_quantity, discarded_quantity ON daily_prep_stock
    FOR EACH ROW EXECUTE FUNCTION trg_combo_stock_before();

DROP TRIGGER IF EXISTS combo_stock_after ON daily_prep_stock;
CREATE TRIGGER combo_stock_after
    AFTER INSERT OR UPDATE OF current_quantity ON daily_prep_stock
    FOR EACH ROW EXECUTE FUNCTION trg_combo_stock_after();

REVOKE ALL ON FUNCTION sync_combo_stock(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Acerta o turno aberto agora
DO $$
DECLARE v_shift UUID;
BEGIN
    FOR v_shift IN SELECT id FROM shifts WHERE status = 'ABERTO' LOOP
        PERFORM sync_combo_stock(v_shift, NULL);
    END LOOP;
END $$;
