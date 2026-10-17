-- ============================================================================
-- MIGRATION 00011: WHATSAPP AUTOMÁTICO + CONFIRMAÇÃO DE PIX NO DELIVERY
--  * delivery_orders.paid_at: o caixa marca "PIX recebido" após conferir no banco.
--  * whatsapp_outbox: fila de mensagens automáticas ao cliente
--      CONFIRMED         -> pedido recebido (com valor e forma de pagamento)
--      OUT_FOR_DELIVERY  -> saiu para entrega (com nome do entregador)
--      DELIVERED         -> entregue
--      CANCELLED         -> cancelado
--  * A cada evento o banco chama a Edge Function "whatsapp-dispatch" (pg_net),
--    que envia pela API configurada (Z-API, Evolution API ou Meta Cloud API).
--    Se a chamada falhar, a mensagem fica PENDING e sai no próximo disparo.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. Pagamento do delivery ------------------------------------------------------
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION mark_delivery_paid(p_order_id UUID, p_paid BOOLEAN DEFAULT true)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'CAIXA']::app_role[]);
    v_order delivery_orders;
BEGIN
    UPDATE delivery_orders
       SET paid_at = CASE WHEN p_paid THEN NOW() END,
           paid_by = CASE WHEN p_paid THEN v_uid END,
           updated_by = v_uid::TEXT
     WHERE id = p_order_id AND status <> 'CANCELLED'
    RETURNING * INTO v_order;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado ou cancelado.'; END IF;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (v_order.shift_id, v_uid, CASE WHEN p_paid THEN 'DELIVERY_PAGO' ELSE 'DELIVERY_PAGAMENTO_ESTORNADO' END,
            'delivery_orders', p_order_id::TEXT, jsonb_build_object('total', v_order.total, 'method', v_order.payment_method));
    RETURN to_jsonb(v_order);
END;
$$;
REVOKE ALL ON FUNCTION mark_delivery_paid(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mark_delivery_paid(UUID, BOOLEAN) TO authenticated;

-- Acompanhamento do cliente também mostra se o PIX já foi confirmado
CREATE OR REPLACE FUNCTION get_delivery_order_status(p_order_id UUID, p_phone TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object('order_number', order_number, 'status', status, 'total', total,
                              'created_at', created_at, 'dispatched_at', dispatched_at,
                              'delivered_at', delivered_at, 'driver_name', driver_name, 'paid_at', paid_at)
      FROM delivery_orders
     WHERE id = p_order_id AND phone = regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
$$;

-- 2. Configuração do WhatsApp (não sensível: tokens ficam nos secrets da função) --
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS whatsapp_auto_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS whatsapp_dispatch_url TEXT;

-- 3. Fila de mensagens --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_order_id UUID NOT NULL REFERENCES delivery_orders(id) ON DELETE CASCADE,
    event TEXT NOT NULL CHECK (event IN ('CONFIRMED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED')),
    phone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED')),
    attempts INT NOT NULL DEFAULT 0,
    last_error TEXT,
    provider_message_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    UNIQUE (delivery_order_id, event)
);
CREATE INDEX IF NOT EXISTS whatsapp_outbox_pending_idx ON whatsapp_outbox (status, created_at);

ALTER TABLE whatsapp_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read whatsapp outbox" ON whatsapp_outbox;
CREATE POLICY "Staff read whatsapp outbox" ON whatsapp_outbox FOR SELECT TO authenticated
    USING (current_user_role() IS NOT NULL);

-- Chama a Edge Function (assíncrono; nunca bloqueia o pedido)
CREATE OR REPLACE FUNCTION wake_whatsapp_dispatch()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_url TEXT;
    v_enabled BOOLEAN;
BEGIN
    SELECT whatsapp_dispatch_url, whatsapp_auto_enabled INTO v_url, v_enabled FROM restaurant_settings LIMIT 1;
    IF NOT COALESCE(v_enabled, false) OR COALESCE(v_url, '') = '' THEN RETURN; END IF;
    PERFORM net.http_post(url := v_url, body := '{}'::jsonb,
                          headers := '{"Content-Type": "application/json"}'::jsonb);
EXCEPTION WHEN OTHERS THEN
    -- Sem pg_net ou URL inválida: a mensagem fica na fila para o próximo disparo
    NULL;
END;
$$;
REVOKE ALL ON FUNCTION wake_whatsapp_dispatch() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION wake_whatsapp_dispatch() TO authenticated;

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
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED') THEN
        v_event := NEW.status;
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

-- DEFERRED: no INSERT o pedido já tem itens e total calculados ao disparar
DROP TRIGGER IF EXISTS queue_delivery_whatsapp ON delivery_orders;
CREATE CONSTRAINT TRIGGER queue_delivery_whatsapp
    AFTER INSERT OR UPDATE OF status ON delivery_orders
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION trg_queue_delivery_whatsapp();

-- Reenvio manual pela equipe
CREATE OR REPLACE FUNCTION retry_whatsapp_message(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'CAIXA', 'ENTREGADOR']::app_role[]);
BEGIN
    UPDATE whatsapp_outbox SET status = 'PENDING', attempts = 0, last_error = NULL
     WHERE id = p_id AND status IN ('FAILED', 'SKIPPED');
    IF NOT FOUND THEN RAISE EXCEPTION 'Somente mensagens com falha podem ser reenviadas.'; END IF;
    PERFORM wake_whatsapp_dispatch();
END;
$$;
REVOKE ALL ON FUNCTION retry_whatsapp_message(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION retry_whatsapp_message(UUID) TO authenticated;

-- 4. API da Edge Function (somente service_role) -----------------------------------
CREATE OR REPLACE FUNCTION claim_whatsapp_messages(p_limit INT DEFAULT 20)
RETURNS SETOF whatsapp_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    UPDATE whatsapp_outbox w
       SET status = 'SENDING', attempts = w.attempts + 1
     WHERE w.id IN (
        SELECT id FROM whatsapp_outbox
         WHERE status = 'PENDING'
            OR (status = 'SENDING' AND created_at < NOW() - INTERVAL '5 minutes')
         ORDER BY created_at
         LIMIT GREATEST(1, LEAST(p_limit, 50))
         FOR UPDATE SKIP LOCKED
     )
    RETURNING w.*;
END;
$$;
REVOKE ALL ON FUNCTION claim_whatsapp_messages(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_whatsapp_messages(INT) TO service_role;

-- 5. Realtime da fila (equipe vê "enviado"/"falhou" na hora) ------------------------
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_outbox;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

select 'MIGRATION_00011_OK' as resultado;
