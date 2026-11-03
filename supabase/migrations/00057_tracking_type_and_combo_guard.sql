-- 00057: link de acompanhamento mostra o tipo do pedido; banco recusa combo sem saldo do espeto.
-- Idempotente. Roda no SQL Editor do Supabase.

CREATE OR REPLACE FUNCTION public.get_delivery_tracking(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT jsonb_build_object(
        'id', o.id,
        'order_number', o.order_number,
        'order_type', o.order_type,
        'notes', CASE WHEN o.notes ~* '^\s*CONSUMIR NO LOCAL' THEN 'CONSUMIR NO LOCAL' END,
        'status', o.status,
        'customer_name', split_part(trim(o.customer_name), ' ', 1),
        'address_street', o.address_street,
        'address_number', o.address_number,
        'address_neighborhood', o.address_neighborhood,
        'address_complement', o.address_complement,
        'address_reference', o.address_reference,
        'subtotal', o.subtotal,
        'delivery_fee', o.delivery_fee,
        'total', o.total,
        'payment_method', o.payment_method,
        'cash_change_for', o.cash_change_for,
        'paid_at', o.paid_at,
        'driver_name', o.driver_name,
        'cancel_reason', o.cancel_reason,
        'created_at', o.created_at,
        'ready_at', o.ready_at,
        'dispatched_at', o.dispatched_at,
        'delivered_at', o.delivered_at,
        'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'id', i.id, 'product_name', i.product_name, 'quantity', i.quantity,
                       'unit_price', i.unit_price, 'doneness', i.doneness, 'notes', i.notes)
                   ORDER BY i.product_name)
              FROM delivery_order_items i
             WHERE i.delivery_order_id = o.id), '[]'::jsonb)
    )
      FROM delivery_orders o
     WHERE o.id = p_order_id;
$function$;

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
            -- Novidade da 00057: vender combo sem o espeto no turno é recusado
            IF v_part = v_base AND v_d_cur < 0 THEN
                PERFORM set_config('app.combo_sync', 'off', true);
                SELECT name INTO v_name FROM products WHERE id = v_part;
                RAISE EXCEPTION 'Estoque insuficiente de "%" (disponível: 0).', v_name;
            END IF;
            CONTINUE;
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

    -- Os outros combos que usam o mesmo espeto/arroz (esta linha é recalculada aqui mesmo)
    PERFORM sync_combo_stock(NEW.shift_id, NEW.id);
    NEW.current_quantity := GREATEST(0, combo_available(NEW.shift_id, NEW.product_id, NEW.current_quantity));
    IF NEW.current_quantity <= 0 THEN
        NEW.is_exhausted := true;
        NEW.exhausted_at := COALESCE(NEW.exhausted_at, NOW());
    END IF;
    RETURN NEW;
END;
$function$;
