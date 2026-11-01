-- ============================================================================
-- Migration 00054: Sincronização Inteligente de Produção (Churrasqueira/Cozinha)
-- Garante que após o encerramento da comanda ou limpeza/liberação de mesas,
-- NENHUM espeto continue "Na brasa", "Em preparo" ou "Aguardando servir".
-- 1. Triggers automáticos no banco em orders e restaurant_tables para cascatear status
-- 2. Atualização das RPCs close_tab_atomic e close_tab_with_payment para baixar order_items
-- 3. Limpeza de resíduos órfãos em order_items
-- ============================================================================

-- 1. Limpeza de quaisquer resíduos existentes
UPDATE order_items
   SET status = 'DELIVERED',
       delivered_at = COALESCE(delivered_at, NOW()),
       updated_at = NOW()
 WHERE order_id IN (SELECT id FROM orders WHERE status = 'CLOSED')
   AND status IN ('RECEIVED', 'IN_PREPARATION', 'READY');

UPDATE order_items
   SET status = 'CANCELLED',
       updated_at = NOW()
 WHERE order_id IN (SELECT id FROM orders WHERE status = 'CANCELLED')
   AND status <> 'CANCELLED';

-- 2. Função de gatilho em orders: ao fechar/cancelar pedido, sincroniza itens de produção
CREATE OR REPLACE FUNCTION trg_fn_cascade_order_status_to_items()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'CLOSED' AND OLD.status <> 'CLOSED' THEN
        UPDATE order_items
           SET status = 'DELIVERED',
               delivered_at = COALESCE(delivered_at, NOW()),
               updated_at = NOW(),
               updated_by = NEW.updated_by
         WHERE order_id = NEW.id
           AND status IN ('RECEIVED', 'IN_PREPARATION', 'READY');
    ELSIF NEW.status = 'CANCELLED' AND OLD.status <> 'CANCELLED' THEN
        UPDATE order_items
           SET status = 'CANCELLED',
               updated_at = NOW(),
               updated_by = NEW.updated_by
         WHERE order_id = NEW.id
           AND status <> 'CANCELLED';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_order_status_to_items ON orders;
CREATE TRIGGER trg_cascade_order_status_to_items
    AFTER UPDATE OF status ON orders
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_cascade_order_status_to_items();

-- 3. Função de gatilho em restaurant_tables: mesa LIVRE encerra pedidos pendentes
CREATE OR REPLACE FUNCTION trg_fn_cascade_table_free_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'LIVRE' AND OLD.status <> 'LIVRE' THEN
        UPDATE orders
           SET status = 'CLOSED',
               updated_at = NOW(),
               updated_by = NEW.updated_by
         WHERE table_id = NEW.id
           AND status NOT IN ('CLOSED', 'CANCELLED');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_table_free_status ON restaurant_tables;
CREATE TRIGGER trg_cascade_table_free_status
    AFTER UPDATE OF status ON restaurant_tables
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_cascade_table_free_status();

-- 4. Atualização de close_tab_atomic
CREATE OR REPLACE FUNCTION close_tab_atomic(p_tab_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'CAIXA']::app_role[]);
    v_tab tabs;
    v_paid NUMERIC(10, 2);
BEGIN
    SELECT * INTO v_tab FROM tabs WHERE id = p_tab_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Comanda não encontrada.';
    END IF;
    IF v_tab.status <> 'OPEN' THEN
        RAISE EXCEPTION 'Esta comanda já foi encerrada anteriormente.';
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM payments WHERE tab_id = p_tab_id AND status = 'PAID';
    IF v_paid < v_tab.total THEN
        RAISE EXCEPTION 'Pagamento insuficiente. Total devido: R$ %, Total pago: R$ %.', v_tab.total, v_paid;
    END IF;

    UPDATE tabs
       SET status = 'CLOSED', closed_by = v_uid, closed_at = NOW(), updated_by = v_uid::TEXT
     WHERE id = p_tab_id
    RETURNING * INTO v_tab;

    -- Baixa pedidos e itens associados
    UPDATE orders SET status = 'CLOSED', updated_by = v_uid::TEXT WHERE tab_id = p_tab_id AND status <> 'CANCELLED';

    UPDATE order_items
       SET status = 'DELIVERED',
           delivered_at = COALESCE(delivered_at, NOW()),
           updated_at = NOW(),
           updated_by = v_uid::TEXT
     WHERE order_id IN (SELECT id FROM orders WHERE tab_id = p_tab_id)
       AND status IN ('RECEIVED', 'IN_PREPARATION', 'READY');

    UPDATE restaurant_tables SET status = 'LIVRE', updated_by = v_uid::TEXT WHERE id = v_tab.table_id;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (v_tab.shift_id, v_uid, 'FECHAR_COMANDA', 'tabs', p_tab_id::TEXT,
            jsonb_build_object('total', v_tab.total, 'paid', v_paid));

    RETURN to_jsonb(v_tab);
END;
$$;

-- 5. Atualização de close_tab_with_payment
CREATE OR REPLACE FUNCTION close_tab_with_payment(
    p_payment_id UUID,
    p_tab_id UUID,
    p_amount NUMERIC(10, 2),
    p_method payment_method,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'CAIXA', 'GARCOM']::app_role[]);
    v_tab tabs;
    v_payment payments;
    v_paid NUMERIC(10, 2);
    v_now TIMESTAMPTZ := now();
BEGIN
    SELECT * INTO v_tab FROM tabs WHERE id = p_tab_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Comanda não encontrada.';
    END IF;
    IF v_tab.status <> 'OPEN' THEN
        RAISE EXCEPTION 'Esta comanda já foi encerrada anteriormente.';
    END IF;

    -- 1. Insere o pagamento se p_amount > 0
    IF p_amount IS NOT NULL AND p_amount > 0 THEN
        INSERT INTO payments (
            id, shift_id, tab_id, amount, method, status, notes, received_by, paid_at
        ) VALUES (
            p_payment_id, v_tab.shift_id, p_tab_id, p_amount, p_method, 'PAID', p_notes, v_uid, v_now
        ) RETURNING * INTO v_payment;
    END IF;

    -- 2. Confere se o total pago cobre o total devido
    SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM payments WHERE tab_id = p_tab_id AND status = 'PAID';
    IF v_paid < v_tab.total THEN
        RAISE EXCEPTION 'Pagamento insuficiente. Total devido: R$ %, Total pago: R$ %.', v_tab.total, v_paid;
    END IF;

    -- 3. Encerra a comanda
    UPDATE tabs
       SET status = 'CLOSED',
           closed_by = v_uid,
           closed_at = v_now,
           updated_at = v_now,
           updated_by = v_uid::text,
           version = COALESCE(version, 0) + 1
     WHERE id = p_tab_id;

    -- 4. Libera a mesa
    UPDATE restaurant_tables
       SET status = 'LIVRE',
           updated_at = v_now,
           version = COALESCE(version, 0) + 1
     WHERE id = v_tab.table_id;

    -- 5. Encerra os pedidos abertos da comanda
    UPDATE orders
       SET status = 'CLOSED',
           updated_at = v_now,
           updated_by = v_uid::text,
           version = COALESCE(version, 0) + 1
     WHERE tab_id = p_tab_id AND status <> 'CANCELLED';

    -- 6. Marca itens como entregues (sai da brasa/cozinha)
    UPDATE order_items
       SET status = 'DELIVERED',
           delivered_at = COALESCE(delivered_at, v_now),
           updated_at = v_now,
           updated_by = v_uid::text,
           version = COALESCE(version, 0) + 1
     WHERE order_id IN (SELECT id FROM orders WHERE tab_id = p_tab_id)
       AND status IN ('RECEIVED', 'IN_PREPARATION', 'READY');

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (v_tab.shift_id, v_uid, 'ENCERRAMENTO_COMANDA', 'tabs', p_tab_id::TEXT,
            jsonb_build_object('total', v_tab.total, 'paid', v_paid, 'method', p_method));

    RETURN jsonb_build_object('success', true, 'tab_id', p_tab_id, 'total', v_tab.total, 'paid', v_paid);
END;
$$;

REVOKE ALL ON FUNCTION close_tab_atomic(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION close_tab_atomic(UUID) TO authenticated;

REVOKE ALL ON FUNCTION close_tab_with_payment(UUID, UUID, NUMERIC, payment_method, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION close_tab_with_payment(UUID, UUID, NUMERIC, payment_method, TEXT) TO authenticated;
