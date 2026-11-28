-- 00074 (28/11/2026): "Consumir no local" do cardápio digital vira comanda de CONSUMO LOCAL.
-- Antes o cliente digitava o número de uma mesa e o pedido caía nela (Mesa 10, 15, 44...),
-- misturado com o salão. Agora cada cliente ganha uma comanda própria numa "mesa" interna
-- a partir do nº 900, que o painel mostra só na aba "Consumo local" (pelo nome do cliente).
-- A comanda funciona como qualquer outra: a equipe acrescenta itens, imprime a conta,
-- cobra no caixa e pode transferir para uma mesa de verdade.
-- O mesmo WhatsApp com comanda aberta no turno pede de novo na MESMA comanda.
-- Idempotente.

CREATE OR REPLACE FUNCTION create_local_order(
    p_items JSONB,
    p_idempotency_key TEXT,
    p_customer_name TEXT,
    p_phone TEXT,
    p_pay_pix BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_name TEXT := LEFT(TRIM(COALESCE(p_customer_name, '')), 60);
    v_phone TEXT := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
    v_shift shifts;
    v_table restaurant_tables;
    v_order orders;
    v_result JSONB;
    v_total NUMERIC(10, 2);
    v_number INT;
BEGIN
    IF length(v_name) < 2 THEN
        RAISE EXCEPTION 'Informe o seu nome.';
    END IF;
    IF length(v_phone) NOT BETWEEN 10 AND 13 THEN
        RAISE EXCEPTION 'Confira o WhatsApp com DDD.';
    END IF;
    IF p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 8 AND 64 THEN
        RAISE EXCEPTION 'Pedido inválido.';
    END IF;

    -- Um pedido de consumo local por vez: dois clientes ao mesmo tempo não pegam a mesma comanda
    PERFORM pg_advisory_xact_lock(hashtext('ponto_create_local_order'));

    -- Reenvio do mesmo pedido (clique duplo / internet caiu): devolve o que já foi criado
    SELECT o.* INTO v_order FROM orders o
      JOIN restaurant_tables rt ON rt.id = o.table_id AND rt.number >= 900
     WHERE o.idempotency_key = 'qr:' || rt.id || ':' || p_idempotency_key
     LIMIT 1;
    IF FOUND THEN
        SELECT COALESCE(SUM(unit_price * quantity), 0) INTO v_total
          FROM order_items WHERE order_id = v_order.id AND status <> 'CANCELLED';
        RETURN jsonb_build_object('order_number', v_order.order_number, 'duplicate', true, 'tab_id', v_order.tab_id, 'total', v_total);
    END IF;

    SELECT * INTO v_shift FROM shifts WHERE status = 'ABERTO' ORDER BY opened_at DESC LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'A loja ainda não abriu.';
    END IF;

    -- Mesmo cliente (WhatsApp) com comanda aberta neste turno: pede de novo nela
    SELECT rt.* INTO v_table
      FROM tabs t JOIN restaurant_tables rt ON rt.id = t.table_id
     WHERE t.status = 'OPEN' AND t.shift_id = v_shift.id AND rt.number >= 900 AND rt.active
       AND rt.status <> 'AGUARDANDO_CONTA'
       AND t.notes LIKE '%WhatsApp ' || v_phone || '%'
     ORDER BY t.opened_at DESC
     LIMIT 1;

    IF v_table.id IS NULL THEN
        -- Primeira "mesa" interna livre (sem comanda aberta); se não houver, cria a próxima
        SELECT rt.* INTO v_table FROM restaurant_tables rt
         WHERE rt.number >= 900 AND rt.active AND rt.status = 'LIVRE'
           AND NOT EXISTS (SELECT 1 FROM tabs t WHERE t.table_id = rt.id AND t.status = 'OPEN')
         ORDER BY rt.number
         LIMIT 1;
        IF v_table.id IS NULL THEN
            SELECT GREATEST(COALESCE(MAX(number), 900), 900) + 1 INTO v_number FROM restaurant_tables WHERE number >= 900;
            INSERT INTO restaurant_tables (number, capacity, status, active, updated_by)
            VALUES (v_number, 1, 'LIVRE', true, 'sistema')
            RETURNING * INTO v_table;
        END IF;
    END IF;

    v_result := create_table_qr_order(v_table.qr_token, p_items, p_idempotency_key, v_name);

    SELECT * INTO v_order FROM orders WHERE idempotency_key = 'qr:' || v_table.id || ':' || p_idempotency_key;
    SELECT COALESCE(SUM(unit_price * quantity), 0) INTO v_total
      FROM order_items WHERE order_id = v_order.id AND status <> 'CANCELLED';

    -- O WhatsApp fica na comanda: a equipe vê quem é e o próximo pedido cai nela
    UPDATE tabs
       SET notes = 'CONSUMO LOCAL · WhatsApp ' || v_phone
     WHERE id = v_order.tab_id AND (notes IS NULL OR notes NOT LIKE '%WhatsApp ' || v_phone || '%');

    UPDATE orders
       SET notes = 'CARDÁPIO · CONSUMO LOCAL · ' || v_name
                   || CASE WHEN p_pay_pix THEN ' · VAI PAGAR POR PIX (' || to_char(v_total, 'FM999990D00') || ') - CONFERIR COMPROVANTE' ELSE '' END
     WHERE id = v_order.id;

    RETURN v_result || jsonb_build_object('tab_id', v_order.tab_id, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION create_local_order(JSONB, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_local_order(JSONB, TEXT, TEXT, TEXT, BOOLEAN) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

select 'MIGRATION_00074_OK' as resultado;
