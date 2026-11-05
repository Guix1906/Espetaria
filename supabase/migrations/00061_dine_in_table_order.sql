-- 00061 (05/11/2026): "Consumir no local" pelo link do cardápio vira pedido de MESA.
-- O cliente informa o número da mesa; o pedido entra na comanda dessa mesa (abre se estiver
-- livre), vai para a churrasqueira/cozinha/bar como pedido de mesa e é fechado no caixa
-- como qualquer comanda. Reaproveita create_table_qr_order (00055): mesmas travas de
-- estoque, turno aberto, conta já pedida e limite de 5 pedidos em 10 minutos.
-- Se o cliente escolher pagar pelo PIX no cardápio, o pedido avisa o caixa na observação;
-- o caixa confere o comprovante e fecha a mesa no painel.
-- Idempotente.

CREATE OR REPLACE FUNCTION create_dine_in_order(
    p_table_number INT,
    p_items JSONB,
    p_idempotency_key TEXT,
    p_customer_name TEXT DEFAULT NULL,
    p_pay_pix BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_table restaurant_tables;
    v_result JSONB;
    v_order orders;
    v_total NUMERIC(10, 2);
BEGIN
    IF length(TRIM(COALESCE(p_customer_name, ''))) < 2 THEN
        RAISE EXCEPTION 'Informe o seu nome.';
    END IF;

    SELECT * INTO v_table FROM restaurant_tables WHERE number = p_table_number AND active LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Mesa % não encontrada. Confira o número na plaquinha da mesa ou chame o garçom.', p_table_number;
    END IF;
    IF v_table.qr_token IS NULL THEN
        RAISE EXCEPTION 'Esta mesa não aceita pedido pelo celular. Chame o garçom.';
    END IF;

    v_result := create_table_qr_order(v_table.qr_token, p_items, p_idempotency_key, p_customer_name);

    SELECT * INTO v_order FROM orders WHERE idempotency_key = 'qr:' || v_table.id || ':' || p_idempotency_key;
    SELECT COALESCE(SUM(unit_price * quantity), 0) INTO v_total
      FROM order_items WHERE order_id = v_order.id AND status <> 'CANCELLED';

    IF NOT COALESCE((v_result->>'duplicate')::BOOLEAN, FALSE) THEN
        UPDATE orders
           SET notes = 'CARDÁPIO · CONSUMIR NO LOCAL · ' || LEFT(TRIM(p_customer_name), 60)
                       || CASE WHEN p_pay_pix THEN ' · VAI PAGAR POR PIX (' || to_char(v_total, 'FM999990D00') || ') - CONFERIR COMPROVANTE' ELSE '' END
         WHERE id = v_order.id;
    END IF;

    RETURN v_result || jsonb_build_object('table_number', v_table.number, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION create_dine_in_order(INT, JSONB, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_dine_in_order(INT, JSONB, TEXT, TEXT, BOOLEAN) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
