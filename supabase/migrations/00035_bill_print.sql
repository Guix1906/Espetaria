-- ============================================================================
-- 00035: Conta da mesa impressa (conferência para o cliente)
--  * print_queue.kind ganha 'BILL'
--  * enqueue_bill_print(mesa): monta a conta da comanda aberta e manda para a
--    impressora da CHURRASQUEIRA (setor GRILL). Não é documento fiscal.
--  * request_bill ("Pediu a conta") imprime sozinho quando a impressão
--    automática está ligada; se a impressão falhar, o pedido de conta segue.
-- Idempotente.
-- ============================================================================
ALTER TABLE print_queue DROP CONSTRAINT IF EXISTS print_queue_kind_check;
ALTER TABLE print_queue ADD CONSTRAINT print_queue_kind_check
    CHECK (kind IN ('ORDER', 'CANCEL', 'DELIVERY_SUMMARY', 'TEST', 'BILL'));

CREATE OR REPLACE FUNCTION enqueue_bill_print(p_table_id UUID, p_reprint BOOLEAN DEFAULT false)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'GARCOM', 'CAIXA']::app_role[]);
    v_tab tabs%ROWTYPE;
    v_table_number INT;
    v_items JSONB;
    v_paid NUMERIC := 0;
    v_settings restaurant_settings%ROWTYPE;
BEGIN
    SELECT * INTO v_tab FROM tabs WHERE table_id = p_table_id AND status = 'OPEN'
     ORDER BY opened_at DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mesa sem comanda aberta.'; END IF;

    SELECT number INTO v_table_number FROM restaurant_tables WHERE id = p_table_id;
    SELECT * INTO v_settings FROM restaurant_settings LIMIT 1;

    -- Itens agrupados por produto e preço (cancelados ficam de fora)
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name', product_name, 'quantity', qty, 'unit_price', unit_price)
                              ORDER BY first_at), '[]'::jsonb)
      INTO v_items
      FROM (SELECT oi.product_name, oi.unit_price, SUM(oi.quantity) AS qty, MIN(oi.created_at) AS first_at
              FROM order_items oi JOIN orders o ON o.id = oi.order_id
             WHERE o.tab_id = v_tab.id AND oi.status <> 'CANCELLED'
             GROUP BY oi.product_name, oi.unit_price) s;

    SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM payments WHERE tab_id = v_tab.id AND status = 'PAID';

    RETURN enqueue_print(
        'BILL', v_tab.id, COALESCE(v_table_number, 0), 'GRILL', 'SALAO', v_table_number, v_tab.customer_name,
        v_items,
        jsonb_build_object(
            'subtotal', v_tab.subtotal,
            'service_fee', v_tab.service_fee,
            'discount', v_tab.discount,
            'total', v_tab.total,
            'paid', v_paid,
            'people_count', v_tab.people_count,
            'opened_at', v_tab.opened_at,
            'waiter', (SELECT name FROM profiles WHERE id = v_tab.opened_by),
            'requested_by', (SELECT name FROM profiles WHERE id = v_uid),
            'pix_key', v_settings.pix_key,
            'restaurant_phone', v_settings.phone
        ),
        'BILL-' || v_tab.id || '-' || gen_random_uuid(),
        p_reprint,
        CASE WHEN p_reprint THEN 'Conta reimpressa' END
    );
END;
$$;
REVOKE ALL ON FUNCTION enqueue_bill_print(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION enqueue_bill_print(UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION request_bill(p_table_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'GARCOM', 'CAIXA']::app_role[]);
BEGIN
    UPDATE restaurant_tables
       SET status = 'AGUARDANDO_CONTA', updated_by = v_uid::TEXT
     WHERE id = p_table_id
       AND EXISTS (SELECT 1 FROM tabs WHERE table_id = p_table_id AND status = 'OPEN');
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Mesa sem comanda aberta.';
    END IF;

    -- Conta impressa na churrasqueira; falha na impressão não impede o pedido de conta
    IF auto_print_enabled() THEN
        BEGIN
            PERFORM enqueue_bill_print(p_table_id, false);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Conta da mesa não foi para a impressão: %', SQLERRM;
        END;
    END IF;
END;
$$;
