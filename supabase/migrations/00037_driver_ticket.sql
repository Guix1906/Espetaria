-- ============================================================================
-- 00037: Via do entregador
--  * print_queue.kind ganha 'DRIVER'
--  * enqueue_driver_print(pedido): cupom no CAIXA (setor NONE) com o nome do
--    motoboy e todos os dados do pedido (cliente, endereço, itens, pagamento,
--    troco, assinatura).
--  * update_delivery_status imprime sozinho ao "Saiu para entrega" quando a
--    impressão automática está ligada; se a impressão falhar, a saída segue.
-- Idempotente.
-- ============================================================================
ALTER TABLE print_queue DROP CONSTRAINT IF EXISTS print_queue_kind_check;
ALTER TABLE print_queue ADD CONSTRAINT print_queue_kind_check
    CHECK (kind IN ('ORDER', 'CANCEL', 'DELIVERY_SUMMARY', 'TEST', 'BILL', 'DRIVER'));

CREATE OR REPLACE FUNCTION enqueue_driver_print(p_order_id UUID, p_reprint BOOLEAN DEFAULT false)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'CAIXA', 'ENTREGADOR']::app_role[]);
    v_order delivery_orders%ROWTYPE;
BEGIN
    SELECT * INTO v_order FROM delivery_orders WHERE id = p_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
    IF v_order.order_type = 'PICKUP' THEN RAISE EXCEPTION 'Pedido de retirada não tem entregador.'; END IF;

    RETURN enqueue_print(
        'DRIVER', v_order.id, v_order.order_number, 'NONE', 'DELIVERY', NULL, v_order.customer_name,
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', product_name, 'quantity', quantity,
                                                      'doneness', doneness, 'notes', notes,
                                                      'unit_price', unit_price) ORDER BY product_name), '[]'::jsonb)
           FROM delivery_order_items WHERE delivery_order_id = v_order.id),
        (to_jsonb(v_order) - 'shift_id' - 'version' - 'idempotency_key' - 'pix_qr_code')
            || jsonb_build_object('requested_by', (SELECT name FROM profiles WHERE id = v_uid)),
        -- Uma via por motoboy; trocar o motoboy imprime outra
        'DRV-' || v_order.id || '-' || COALESCE(v_order.driver_name, '')
            || CASE WHEN p_reprint THEN '-' || gen_random_uuid() ELSE '' END,
        p_reprint,
        CASE WHEN p_reprint THEN 'Via do entregador reimpressa' END
    );
END;
$$;
REVOKE ALL ON FUNCTION enqueue_driver_print(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION enqueue_driver_print(UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION update_delivery_status(p_order_id UUID, p_status TEXT, p_driver_name TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'CAIXA', 'ENTREGADOR', 'COZINHA', 'CHURRASQUEIRA']::app_role[]);
    v_order delivery_orders;
BEGIN
    IF p_status NOT IN ('CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED') THEN
        RAISE EXCEPTION 'Status inválido. Para cancelar use cancel_delivery_order.';
    END IF;

    IF EXISTS (SELECT 1 FROM delivery_orders WHERE id = p_order_id AND status = 'AWAITING_PAYMENT') THEN
        RAISE EXCEPTION 'Pedido aguardando o PIX. Use "PIX recebido" depois de conferir o pagamento.';
    END IF;

    IF p_status = 'OUT_FOR_DELIVERY'
       AND EXISTS (SELECT 1 FROM delivery_orders WHERE id = p_order_id AND order_type = 'PICKUP') THEN
        RAISE EXCEPTION 'Pedido de retirada não sai para entrega.';
    END IF;

    UPDATE delivery_orders
       SET status = p_status,
           driver_name = COALESCE(NULLIF(p_driver_name, ''), driver_name),
           dispatched_at = CASE WHEN p_status = 'OUT_FOR_DELIVERY' THEN NOW() ELSE dispatched_at END,
           delivered_at = CASE WHEN p_status = 'DELIVERED' THEN NOW() ELSE delivered_at END,
           updated_by = v_uid::TEXT
     WHERE id = p_order_id AND status NOT IN ('CANCELLED', 'DELIVERED')
    RETURNING * INTO v_order;

    IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado ou já finalizado.'; END IF;

    -- Via do entregador; falha na impressão não impede a saída
    IF p_status = 'OUT_FOR_DELIVERY' AND auto_print_enabled() THEN
        BEGIN
            PERFORM enqueue_driver_print(p_order_id, false);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Via do entregador não foi para a impressão: %', SQLERRM;
        END;
    END IF;

    RETURN to_jsonb(v_order);
END;
$$;
