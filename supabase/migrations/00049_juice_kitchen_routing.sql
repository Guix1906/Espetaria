-- ============================================================================
-- MIGRATION 00049: SUCOS IMPRIMEM NA COZINHA PARA PREPARO
-- ----------------------------------------------------------------------------
-- 1. Produtos do tipo suco/refresco/jarra passam a ter setor 'KITCHEN'.
-- 2. O gatilho de impressão de pedidos do salão (trg_enqueue_order_prints)
--    passa a incluir sucos nos cupons enviados para a COZINHA (com sabor e obs).
-- 3. Cancelamento de suco também gera cupom de cancelamento para a COZINHA.
-- Idempotente.
-- ============================================================================

-- 1. Atualiza produtos de suco existentes para o setor KITCHEN
UPDATE products
   SET sector = 'KITCHEN'
 WHERE (name ~* 'suco|refresco|jarra')
   AND sector <> 'KITCHEN';

-- 2. Atualiza o gatilho de impressão de pedidos do salão
CREATE OR REPLACE FUNCTION trg_enqueue_order_prints()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_table_number INT;
    v_customer TEXT;
    v_tab_notes TEXT;
    v_waiter TEXT;
    v_grill_items JSONB;
    v_kitchen_items JSONB;
    v_combined_notes TEXT;
BEGIN
    IF NOT auto_print_enabled() THEN
        RETURN NULL;
    END IF;

    SELECT number INTO v_table_number FROM restaurant_tables WHERE id = NEW.table_id;
    SELECT customer_name, notes INTO v_customer, v_tab_notes FROM tabs WHERE id = NEW.tab_id;
    SELECT name INTO v_waiter FROM profiles WHERE id = NEW.created_by;

    v_combined_notes := NULLIF(TRIM(COALESCE(NEW.notes, v_tab_notes, '')), '');

    -- 1. Itens da CHURRASQUEIRA (GRILL)
    SELECT jsonb_agg(jsonb_build_object('name', oi.product_name, 'quantity', oi.quantity,
                                        'doneness', oi.doneness, 'notes', oi.notes) ORDER BY oi.created_at, oi.product_name)
      INTO v_grill_items
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = NEW.id
       AND oi.sector = 'GRILL'
       AND oi.status <> 'CANCELLED'
       AND p.type IS DISTINCT FROM 'BEBIDA';

    IF v_grill_items IS NOT NULL AND jsonb_array_length(v_grill_items) > 0 THEN
        PERFORM enqueue_print('ORDER', NEW.id, NEW.order_number, 'GRILL', 'SALAO', v_table_number, v_customer,
                              v_grill_items, jsonb_build_object('waiter', v_waiter, 'order_notes', v_combined_notes),
                              'ORD-' || NEW.id || '-GRILL');
    END IF;

    -- 2. Itens da COZINHA (KITCHEN): produtos da cozinha + espetos com acompanhamento + sucos
    SELECT jsonb_agg(jsonb_build_object('name', oi.product_name, 'quantity', oi.quantity,
                                        'doneness', oi.doneness, 'notes', oi.notes) ORDER BY oi.created_at, oi.product_name)
      INTO v_kitchen_items
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = NEW.id
       AND oi.status <> 'CANCELLED'
       AND (
           -- Sucos saem na cozinha para preparo imediato (mesmo sendo cadastrados como bebida)
           oi.product_name ~* 'suco|refresco|jarra'
           OR p.name ~* 'suco|refresco|jarra'
           OR (
               p.type IS DISTINCT FROM 'BEBIDA'
               AND (
                   oi.sector = 'KITCHEN'
                   OR (oi.sector = 'GRILL' AND (
                       oi.product_name ~* 'acompanhamento'
                       OR oi.notes ~* '(?:arroz|bai[aã]o|pur[eê]|vinagrete|farofa|salada|mandioca|batata|fritas)'
                   ))
               )
           )
       );

    IF v_kitchen_items IS NOT NULL AND jsonb_array_length(v_kitchen_items) > 0 THEN
        PERFORM enqueue_print('ORDER', NEW.id, NEW.order_number, 'KITCHEN', 'SALAO', v_table_number, v_customer,
                              v_kitchen_items, jsonb_build_object('waiter', v_waiter, 'order_notes', v_combined_notes),
                              'ORD-' || NEW.id || '-KITCHEN');
    END IF;

    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION trg_enqueue_order_prints() FROM PUBLIC, anon, authenticated;

-- 3. Cancelamento de itens: se cancelar um suco, avisa a cozinha!
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
    v_is_juice BOOLEAN;
    v_sector production_sector;
BEGIN
    v_is_juice := NEW.product_name ~* 'suco|refresco|jarra';

    IF NEW.status <> 'CANCELLED' OR OLD.status = 'CANCELLED' OR OLD.status = 'DELIVERED' THEN
        RETURN NULL;
    END IF;

    -- Bebidas prontas não imprimem cancelamento (nunca imprimiram pedido)
    IF NOT v_is_juice AND (NEW.sector IN ('NONE', 'BAR') OR EXISTS (SELECT 1 FROM products WHERE id = NEW.product_id AND type = 'BEBIDA')) THEN
        RETURN NULL;
    END IF;

    v_sector := CASE WHEN v_is_juice THEN 'KITCHEN'::production_sector ELSE NEW.sector END;

    SELECT * INTO v_order FROM orders WHERE id = NEW.order_id;
    SELECT number INTO v_table_number FROM restaurant_tables WHERE id = v_order.table_id;
    SELECT notes INTO v_reason FROM order_item_status_history
     WHERE order_item_id = NEW.id AND to_status = 'CANCELLED' ORDER BY created_at DESC LIMIT 1;

    PERFORM enqueue_print('CANCEL', NEW.order_id, v_order.order_number, v_sector, 'SALAO', v_table_number, NULL,
                          jsonb_build_array(jsonb_build_object('name', NEW.product_name, 'quantity', NEW.quantity,
                                                               'doneness', NEW.doneness, 'notes', NEW.notes)),
                          jsonb_build_object('reason', v_reason, 'previous_status', OLD.status),
                          'CANCEL-' || NEW.id);
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION trg_enqueue_item_cancel_print() FROM PUBLIC, anon, authenticated;
