-- ============================================================================
-- MIGRATION 00048: CÓPIA DE ESPETOS COM ACOMPANHAMENTO NA COZINHA E OBS DO PEDIDO
-- ----------------------------------------------------------------------------
-- 1. Espetos "com acompanhamento" (ou com observação de arroz/baião/purê):
--    geram cupom para a CHURRASQUEIRA (assar a carne) e cópia para a COZINHA
--    (montar os acompanhamentos: arroz, purê, vinagrete, farofa).
-- 2. Observações da comanda/pedido agora são incluídas no cupom de produção.
-- Idempotente.
-- ============================================================================

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

    -- 2. Itens da COZINHA (KITCHEN): produtos da cozinha + espetos com acompanhamento
    SELECT jsonb_agg(jsonb_build_object('name', oi.product_name, 'quantity', oi.quantity,
                                        'doneness', oi.doneness, 'notes', oi.notes) ORDER BY oi.created_at, oi.product_name)
      INTO v_kitchen_items
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = NEW.id
       AND oi.status <> 'CANCELLED'
       AND p.type IS DISTINCT FROM 'BEBIDA'
       AND (
           oi.sector = 'KITCHEN'
           OR (oi.sector = 'GRILL' AND (
               oi.product_name ~* 'acompanhamento'
               OR oi.notes ~* '(?:arroz|bai[aã]o|pur[eê]|vinagrete|farofa|salada|mandioca|batata|fritas)'
           ))
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
