-- ============================================================================
-- 00038: Via do entregador sai junto com o pedido
--  * O resumo do delivery (DELIVERY_SUMMARY, enfileirado quando o pedido entra)
--    agora é impresso pelo printer-bridge como via do entregador.
--  * "Saiu para entrega" deixa de imprimir (evita via repetida). A função
--    enqueue_driver_print (00037) continua disponível para reimpressão.
-- Idempotente.
-- ============================================================================
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
    RETURN to_jsonb(v_order);
END;
$$;
