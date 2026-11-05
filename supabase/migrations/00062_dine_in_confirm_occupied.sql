-- 00062 (05/11/2026): "Consumir no local" avisa quando a mesa digitada já está aberta.
-- Sem a confirmação do cliente ("Sim, é a minha mesa"), o pedido NÃO entra numa comanda
-- que já existe: evita cair na conta de outra mesa por número digitado errado.
-- O aviso não mostra nome nem pedidos de quem está na mesa.
-- Substitui a função da 00061 (mesmos parâmetros + p_confirm_occupied, com padrão FALSE,
-- então o site antigo continua funcionando). Idempotente.

DROP FUNCTION IF EXISTS create_dine_in_order(INT, JSONB, TEXT, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION create_dine_in_order(
    p_table_number INT,
    p_items JSONB,
    p_idempotency_key TEXT,
    p_customer_name TEXT DEFAULT NULL,
    p_pay_pix BOOLEAN DEFAULT FALSE,
    p_confirm_occupied BOOLEAN DEFAULT FALSE
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

    -- Reenvio do mesmo pedido (clique duplo) não pergunta de novo
    IF NOT EXISTS (SELECT 1 FROM orders WHERE idempotency_key = 'qr:' || v_table.id || ':' || p_idempotency_key) THEN
        IF v_table.status = 'AGUARDANDO_CONTA' THEN
            RAISE EXCEPTION 'A conta da Mesa % já foi pedida. Chame o garçom para pedir mais.', p_table_number;
        END IF;
        IF NOT p_confirm_occupied AND EXISTS (SELECT 1 FROM tabs WHERE table_id = v_table.id AND status = 'OPEN') THEN
            RAISE EXCEPTION 'MESA_OCUPADA: A Mesa % já está aberta. Você está sentado nela?', p_table_number;
        END IF;
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

REVOKE ALL ON FUNCTION create_dine_in_order(INT, JSONB, TEXT, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_dine_in_order(INT, JSONB, TEXT, TEXT, BOOLEAN, BOOLEAN) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
