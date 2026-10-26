-- ============================================================================
-- MIGRATION 00042: PEDIDO DA MESA NÃO IMPRIME BEBIDA
-- ----------------------------------------------------------------------------
-- No salão só sai cupom de comida. Bebidas (setor BAR ou produto do tipo BEBIDA)
-- continuam no pedido, na conta e no caixa, mas não geram cupom de produção.
-- Delivery e retirada não mudam. Idempotente.
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_enqueue_order_prints()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r RECORD;
    v_table_number INT;
    v_customer TEXT;
    v_waiter TEXT;
BEGIN
    IF NOT auto_print_enabled() THEN
        RETURN NULL;
    END IF;

    SELECT number INTO v_table_number FROM restaurant_tables WHERE id = NEW.table_id;
    SELECT customer_name INTO v_customer FROM tabs WHERE id = NEW.tab_id;
    SELECT name INTO v_waiter FROM profiles WHERE id = NEW.created_by;

    FOR r IN
        SELECT oi.sector,
               jsonb_agg(jsonb_build_object('name', oi.product_name, 'quantity', oi.quantity,
                                            'doneness', oi.doneness, 'notes', oi.notes) ORDER BY oi.created_at, oi.product_name) AS items
          FROM order_items oi
          LEFT JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = NEW.id
           AND oi.sector NOT IN ('NONE', 'BAR')
           AND oi.status <> 'CANCELLED'
           AND p.type IS DISTINCT FROM 'BEBIDA'
         GROUP BY oi.sector
    LOOP
        PERFORM enqueue_print('ORDER', NEW.id, NEW.order_number, r.sector, 'SALAO', v_table_number, v_customer,
                              r.items, jsonb_build_object('waiter', v_waiter, 'order_notes', NEW.notes),
                              'ORD-' || NEW.id || '-' || r.sector);
    END LOOP;
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION trg_enqueue_order_prints() FROM PUBLIC, anon, authenticated;

-- Cancelar bebida da mesa também não imprime aviso (o cupom dela nunca saiu)
CREATE OR REPLACE FUNCTION trg_enqueue_item_cancel_print()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_table_number INT;
    v_reason TEXT;
BEGIN
    IF NEW.status <> 'CANCELLED' OR OLD.status = 'CANCELLED' OR OLD.status = 'DELIVERED'
       OR NEW.sector IN ('NONE', 'BAR')
       OR EXISTS (SELECT 1 FROM products WHERE id = NEW.product_id AND type = 'BEBIDA') THEN
        RETURN NULL;
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = NEW.order_id;
    SELECT number INTO v_table_number FROM restaurant_tables WHERE id = v_order.table_id;
    SELECT notes INTO v_reason FROM order_item_status_history
     WHERE order_item_id = NEW.id AND to_status = 'CANCELLED' ORDER BY created_at DESC LIMIT 1;

    PERFORM enqueue_print('CANCEL', NEW.order_id, v_order.order_number, NEW.sector, 'SALAO', v_table_number, NULL,
                          jsonb_build_array(jsonb_build_object('name', NEW.product_name, 'quantity', NEW.quantity,
                                                               'doneness', NEW.doneness, 'notes', NEW.notes)),
                          jsonb_build_object('reason', v_reason, 'previous_status', OLD.status),
                          'CANCEL-' || NEW.id);
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION trg_enqueue_item_cancel_print() FROM PUBLIC, anon, authenticated;
