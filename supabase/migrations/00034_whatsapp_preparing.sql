-- ============================================================================
-- 00034: WhatsApp "Pedido em preparo" (Evolution API)
--  * whatsapp_outbox.event ganha 'PREPARING'
--  * gatilho manda o aviso quando o pedido sai de PENDING/CONFIRMED para PREPARING
--    (pedido do cardápio já nasce PREPARING e recebe só "recebido"; PIX liberado
--    continua recebendo "PIX confirmado").
-- Idempotente.
-- ============================================================================
ALTER TABLE whatsapp_outbox DROP CONSTRAINT IF EXISTS whatsapp_outbox_event_check;
ALTER TABLE whatsapp_outbox ADD CONSTRAINT whatsapp_outbox_event_check
    CHECK (event IN ('CONFIRMED', 'PAID', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'));

CREATE OR REPLACE FUNCTION trg_queue_delivery_whatsapp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'AWAITING_PAYMENT' THEN RETURN NULL; END IF;
        v_event := 'CONFIRMED';
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'CANCELLED' THEN
        v_event := 'CANCELLED';
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'PREPARING'
          AND OLD.status IN ('PENDING', 'CONFIRMED') THEN
        v_event := 'PREPARING';
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.order_type = 'PICKUP' AND NEW.status = 'READY' THEN
        v_event := 'READY';
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.order_type = 'DELIVERY'
          AND NEW.status IN ('OUT_FOR_DELIVERY', 'DELIVERED') THEN
        v_event := NEW.status;
    ELSIF OLD.paid_at IS NULL AND NEW.paid_at IS NOT NULL
          AND NEW.payment_method = 'PIX' AND NEW.status <> 'CANCELLED' THEN
        v_event := 'PAID';
    ELSE
        RETURN NULL;
    END IF;

    INSERT INTO whatsapp_outbox (delivery_order_id, event, phone)
    VALUES (NEW.id, v_event, NEW.phone)
    ON CONFLICT (delivery_order_id, event) DO NOTHING;

    -- Se acordar o envio falhar, o pedido segue normalmente (a fila tenta depois).
    BEGIN
        PERFORM wake_whatsapp_dispatch();
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'wake_whatsapp_dispatch falhou: %', SQLERRM;
    END;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION trg_queue_delivery_whatsapp() FROM PUBLIC, anon, authenticated;
