-- ============================================================================
-- ZERAR DADOS DE TESTE (pedido do dono em 26/10/2026)
-- Apaga pedidos, delivery, pagamentos, turnos, financeiro, fila de impressão,
-- WhatsApp, estoque diário e auditoria. A numeração dos pedidos volta ao 1.
-- MANTÉM: produtos, categorias, custos, equipe/logins, mesas, bairros e configurações.
--
-- Antes de apagar, copia tudo para o schema "backup_zerar_20261026"
-- (para desfazer, é só pedir: os dados ficam guardados lá).
-- Rodar UMA vez no SQL Editor do Supabase.
-- ============================================================================
BEGIN;

CREATE SCHEMA IF NOT EXISTS backup_zerar_20261026;
REVOKE ALL ON SCHEMA backup_zerar_20261026 FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
    t TEXT;
    v_tables TEXT[] := ARRAY[
        'audit_logs', 'daily_prep_stock', 'delivery_order_items', 'delivery_order_status_history',
        'delivery_orders', 'driver_payouts', 'finance_entries', 'order_item_status_history',
        'order_items', 'orders', 'payments', 'print_queue', 'shifts', 'stock_movements', 'tabs',
        'whatsapp_bot_messages', 'whatsapp_conversations', 'whatsapp_outbox'
    ];
    v_existing TEXT[] := ARRAY[]::TEXT[];
BEGIN
    FOREACH t IN ARRAY v_tables LOOP
        IF to_regclass('public.' || t) IS NOT NULL THEN
            EXECUTE format('DROP TABLE IF EXISTS backup_zerar_20261026.%I', t);
            EXECUTE format('CREATE TABLE backup_zerar_20261026.%I AS TABLE public.%I', t, t);
            v_existing := v_existing || format('public.%I', t);
        END IF;
    END LOOP;

    -- Sem CASCADE: se alguma tabela que deve ficar dependesse destas, o comando falha e nada é apagado
    EXECUTE 'TRUNCATE ' || array_to_string(v_existing, ', ') || ' RESTART IDENTITY';
END $$;

-- Numeração do delivery volta ao 1
DO $$
BEGIN
    IF to_regclass('public.delivery_order_number_seq') IS NOT NULL THEN
        ALTER SEQUENCE public.delivery_order_number_seq RESTART WITH 1;
    END IF;
END $$;

-- Todas as mesas livres
UPDATE restaurant_tables SET status = 'LIVRE', updated_at = NOW() WHERE status <> 'LIVRE';

COMMIT;

-- Conferência: tudo deve mostrar 0
SELECT 'pedidos' AS o_que, COUNT(*) FROM orders
UNION ALL SELECT 'comandas', COUNT(*) FROM tabs
UNION ALL SELECT 'delivery', COUNT(*) FROM delivery_orders
UNION ALL SELECT 'pagamentos', COUNT(*) FROM payments
UNION ALL SELECT 'turnos', COUNT(*) FROM shifts
UNION ALL SELECT 'financeiro', COUNT(*) FROM finance_entries;
