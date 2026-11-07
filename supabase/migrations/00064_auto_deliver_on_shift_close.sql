-- ============================================================================
-- Migration: 00064_auto_deliver_on_shift_close.sql
-- Finaliza automaticamente pedidos de delivery pendentes (Em entrega, Pronto, etc.)
-- ao fechar o turno de um dia para o outro, evitando que fiquem como "atrasados"
-- nas abas de delivery no dia seguinte.
-- ============================================================================

-- 1. Limpa pedidos órfãos de turnos que já foram encerrados anteriormente
UPDATE delivery_orders d
   SET status = 'DELIVERED',
       delivered_at = COALESCE(d.delivered_at, s.closed_at, NOW()),
       updated_at = NOW()
  FROM shifts s
 WHERE d.shift_id = s.id
   AND s.status = 'FECHADO'
   AND d.status IN ('OUT_FOR_DELIVERY', 'READY', 'PREPARING', 'CONFIRMED');

-- 2. Atualiza close_shift para sempre finalizar os pedidos de delivery do turno
CREATE OR REPLACE FUNCTION close_shift(
    p_shift_id UUID,
    p_closing_notes TEXT,
    p_cash_end NUMERIC(10, 2)
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
BEGIN
    IF EXISTS (SELECT 1 FROM tabs WHERE shift_id = p_shift_id AND status = 'OPEN') THEN
        RAISE EXCEPTION 'Existem comandas abertas neste turno. Encerre-as antes de fechar o turno.';
    END IF;

    -- Finaliza automaticamente pedidos de delivery que ficaram pendentes no turno encerrado
    UPDATE delivery_orders
       SET status = 'DELIVERED',
           delivered_at = COALESCE(delivered_at, NOW()),
           updated_at = NOW()
     WHERE shift_id = p_shift_id
       AND status IN ('OUT_FOR_DELIVERY', 'READY', 'PREPARING', 'CONFIRMED');

    UPDATE shifts
       SET status = 'FECHADO',
           closed_by = v_uid,
           closed_at = NOW(),
           closing_notes = p_closing_notes,
           cash_drawer_end = p_cash_end,
           updated_at = NOW(),
           updated_by = v_uid::TEXT,
           version = version + 1
     WHERE id = p_shift_id AND status = 'ABERTO';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Turno não encontrado ou já encerrado.';
    END IF;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (p_shift_id, v_uid, 'FECHAMENTO_TURNO', 'shifts', p_shift_id::TEXT,
            jsonb_build_object('cash_drawer_end', p_cash_end, 'notes', p_closing_notes));
END;
$$;
