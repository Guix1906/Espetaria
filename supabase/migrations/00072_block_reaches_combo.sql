-- 00072 (22/11/2026): bloquear um espeto (ou o arroz) bloqueia também o "X com acompanhamento".
-- Antes: o bloqueio marcava só a linha do espeto; o combo tem linha própria no estoque do turno,
-- continuava com saldo e o banco aceitava o pedido. E qualquer venda recalculava o combo pelo saldo
-- (sync_combo_stock), ignorando o bloqueio. Idempotente.

-- 1. Saldo do combo = 0 quando o espeto ou o arroz está bloqueado/esgotado
CREATE OR REPLACE FUNCTION public.combo_available(p_shift_id uuid, p_product_id uuid, p_fallback integer)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
    v_base UUID; v_side UUID; v_min INT; v_count INT; v_blocked BOOLEAN;
BEGIN
    SELECT base_id, side_id INTO v_base, v_side FROM combo_stock_parts(p_product_id);
    IF v_base IS NULL OR v_side IS NULL THEN
        RETURN 0;
    END IF;

    SELECT COUNT(*), MIN(current_quantity), BOOL_OR(is_exhausted) INTO v_count, v_min, v_blocked
      FROM daily_prep_stock
     WHERE shift_id = p_shift_id AND product_id IN (v_base, v_side);

    -- Peça fora do turno ou bloqueada: combo não pode ser vendido
    IF v_count < 2 OR v_blocked THEN
        RETURN 0;
    END IF;

    RETURN COALESCE(v_min, 0);
END;
$function$;

-- 2. Bloquear/liberar repassa na hora para os combos. Bloquear o combo = bloquear o espeto dele
--    (os dois usam o mesmo estoque; bloquear só o combo seria desfeito na próxima venda).
CREATE OR REPLACE FUNCTION public.toggle_product_exhaustion(p_shift_id uuid, p_product_id uuid, p_is_exhausted boolean, p_user_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_prod_name TEXT;
    v_target UUID := p_product_id;
    v_base UUID;
BEGIN
    SELECT name INTO v_prod_name FROM products WHERE id = p_product_id;

    IF v_prod_name ~* '\s+com acompanhamento\s*$' THEN
        SELECT base_id INTO v_base FROM combo_stock_parts(p_product_id);
        IF v_base IS NOT NULL THEN
            v_target := v_base;
        END IF;
    END IF;

    UPDATE daily_prep_stock
    SET is_exhausted = p_is_exhausted,
        exhausted_at = CASE WHEN p_is_exhausted THEN NOW() ELSE NULL END,
        exhausted_by = CASE WHEN p_is_exhausted THEN p_user_id ELSE NULL END,
        exhaust_reason = p_reason,
        updated_at = NOW()
    WHERE shift_id = p_shift_id AND product_id IN (p_product_id, v_target);

    UPDATE products
    SET available = NOT p_is_exhausted,
        updated_at = NOW()
    WHERE id IN (p_product_id, v_target);

    -- Combos que usam este espeto/arroz: saldo 0 (bloqueado) ou volta ao saldo real (liberado)
    PERFORM sync_combo_stock(p_shift_id, NULL);
    UPDATE products p
       SET available = NOT d.is_exhausted AND d.current_quantity > 0,
           updated_at = NOW()
      FROM daily_prep_stock d
     WHERE d.shift_id = p_shift_id AND d.product_id = p.id
       AND p.name ~* '\s+com acompanhamento\s*$'
       AND p.available IS DISTINCT FROM (NOT d.is_exhausted AND d.current_quantity > 0);

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (
        p_shift_id,
        p_user_id,
        CASE WHEN p_is_exhausted THEN 'ESGOTAR_PRODUTO' ELSE 'REATIVAR_PRODUTO' END,
        'daily_prep_stock',
        p_product_id::TEXT,
        jsonb_build_object('product_name', v_prod_name, 'reason', p_reason)
    );
END;
$function$;

-- 3. Trava final: vender combo com o espeto/arroz bloqueado é recusado (vale para mesa, QR e delivery)
CREATE OR REPLACE FUNCTION public.trg_combo_stock_before()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        IF NOT FOUND THEN
            IF v_part = v_base AND v_d_cur < 0 THEN
                PERFORM set_config('app.combo_sync', 'off', true);
                SELECT name INTO v_name FROM products WHERE id = v_part;
                RAISE EXCEPTION 'Estoque insuficiente de "%" (disponível: 0).', v_name;
            END IF;
            CONTINUE;
        END IF;
        -- Novidade da 00072: peça bloqueada pela gerência/churrasqueira não sai em combo
        IF v_d_cur < 0 AND v_row.is_exhausted THEN
            PERFORM set_config('app.combo_sync', 'off', true);
            SELECT name INTO v_name FROM products WHERE id = v_part;
            RAISE EXCEPTION 'Produto "%" está marcado como ESGOTADO.', v_name;
        END IF;
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

    PERFORM sync_combo_stock(NEW.shift_id, NEW.id);
    NEW.current_quantity := GREATEST(0, combo_available(NEW.shift_id, NEW.product_id, NEW.current_quantity));
    IF NEW.current_quantity <= 0 THEN
        NEW.is_exhausted := true;
        NEW.exhausted_at := COALESCE(NEW.exhausted_at, NOW());
    END IF;
    RETURN NEW;
END;
$function$;
