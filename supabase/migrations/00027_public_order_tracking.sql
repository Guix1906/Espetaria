-- ============================================================================
-- MIGRATION 00027: PÁGINA PÚBLICA DE ACOMPANHAMENTO DO PEDIDO (#/pedido/<id>)
-- O link vai na mensagem de WhatsApp do cliente. O id do pedido é um UUID
-- aleatório (impossível de adivinhar), então funciona como chave de acesso.
-- Não devolve telefone nem dados internos.
-- ============================================================================
CREATE OR REPLACE FUNCTION get_delivery_tracking(p_order_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'id', o.id,
        'order_number', o.order_number,
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
$$;
REVOKE ALL ON FUNCTION get_delivery_tracking(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_delivery_tracking(UUID) TO anon, authenticated;

select 'MIGRATION_00027_OK' as resultado;
