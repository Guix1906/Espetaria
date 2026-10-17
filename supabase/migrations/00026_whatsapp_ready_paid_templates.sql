-- ============================================================================
-- MIGRATION 00026: WHATSAPP — ETAPA "PRONTO", AVISO DE PIX CONFIRMADO E TEXTOS EDITÁVEIS
--  * delivery_orders.status ganha 'READY' (pronto, aguardando o entregador)
--  * whatsapp_outbox.event ganha 'READY' e 'PAID' (PIX conferido pelo caixa)
--  * restaurant_settings.whatsapp_templates: texto e liga/desliga de cada mensagem
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================================

-- 1. Novos valores permitidos ------------------------------------------------------
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT conname FROM pg_constraint
              WHERE conrelid = 'public.delivery_orders'::regclass AND contype = 'c'
                AND pg_get_constraintdef(oid) ILIKE '%OUT_FOR_DELIVERY%' LOOP
        EXECUTE format('ALTER TABLE public.delivery_orders DROP CONSTRAINT %I', r.conname);
    END LOOP;
    FOR r IN SELECT conname FROM pg_constraint
              WHERE conrelid = 'public.whatsapp_outbox'::regclass AND contype = 'c'
                AND pg_get_constraintdef(oid) ILIKE '%OUT_FOR_DELIVERY%' LOOP
        EXECUTE format('ALTER TABLE public.whatsapp_outbox DROP CONSTRAINT %I', r.conname);
    END LOOP;
END $$;

ALTER TABLE delivery_orders ADD CONSTRAINT delivery_orders_status_check
    CHECK (status IN ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'));
ALTER TABLE whatsapp_outbox ADD CONSTRAINT whatsapp_outbox_event_check
    CHECK (event IN ('CONFIRMED', 'PAID', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'));

-- 2. Textos das mensagens (null = textos padrão da função whatsapp-dispatch) ------------
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS whatsapp_templates JSONB;

-- 3. Equipe pode marcar o pedido como pronto ----------------------------------------------
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

-- 4. Fila: pronto e PIX confirmado também geram mensagem -------------------------------
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
        v_event := 'CONFIRMED';
    ELSIF NEW.status IS DISTINCT FROM OLD.status
          AND NEW.status IN ('READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED') THEN
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

    PERFORM wake_whatsapp_dispatch();
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION trg_queue_delivery_whatsapp() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS queue_delivery_whatsapp ON delivery_orders;
CREATE CONSTRAINT TRIGGER queue_delivery_whatsapp
    AFTER INSERT OR UPDATE OF status, paid_at ON delivery_orders
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION trg_queue_delivery_whatsapp();

select 'MIGRATION_00026_OK' as resultado;
