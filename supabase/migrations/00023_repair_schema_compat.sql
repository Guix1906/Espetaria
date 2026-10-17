-- ============================================================================
-- MIGRATION 00023: conserto de compatibilidade (pode rodar sempre, com segurança)
--
-- Desfaz o que a versão ANTIGA da 00019 alterou, caso ela tenha sido aplicada:
--  1. updated_by volta de UUID para TEXT (as funções do sistema gravam texto)
--  2. delivery_orders.status e payment_method voltam de ENUM para TEXT
--  3. delivery_orders e whatsapp_outbox voltam ao Realtime (aviso de pedido novo)
-- Se a 00019 antiga nunca rodou, esta migração não altera nada.
-- ============================================================================

-- 1. updated_by → TEXT
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['tabs', 'orders', 'order_items', 'daily_prep_stock', 'restaurant_tables', 'shifts'] LOOP
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, 'fk_' || t || '_updated_by');
        IF EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = t AND column_name = 'updated_by' AND data_type = 'uuid') THEN
            EXECUTE format('ALTER TABLE public.%I ALTER COLUMN updated_by TYPE TEXT USING updated_by::TEXT', t);
        END IF;
    END LOOP;
END $$;

-- 2. Delivery: status e forma de pagamento → TEXT (mantém as regras de valores válidos)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'delivery_orders' AND column_name = 'status' AND data_type = 'USER-DEFINED') THEN
        ALTER TABLE delivery_orders ALTER COLUMN status DROP DEFAULT;
        ALTER TABLE delivery_orders ALTER COLUMN status TYPE TEXT USING status::TEXT;
        ALTER TABLE delivery_orders ALTER COLUMN status SET DEFAULT 'CONFIRMED';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'delivery_orders' AND column_name = 'payment_method' AND data_type = 'USER-DEFINED') THEN
        ALTER TABLE delivery_orders ALTER COLUMN payment_method TYPE TEXT USING payment_method::TEXT;
    END IF;
END $$;

-- 3. Realtime: aviso de pedido de delivery novo e status do WhatsApp no painel
DO $$
DECLARE
    t TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        FOREACH t IN ARRAY ARRAY['delivery_orders', 'whatsapp_outbox'] LOOP
            IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t)
               AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                                WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
                EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
            END IF;
        END LOOP;
    END IF;
END $$;

select 'MIGRATION_00023_OK' as resultado;
