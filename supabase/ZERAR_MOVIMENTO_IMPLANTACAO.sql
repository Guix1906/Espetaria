-- ============================================================================
-- ZERAR MOVIMENTO PARA A IMPLANTAÇÃO (22/10/2026)
-- Apaga: turnos, comandas, pedidos, pagamentos, delivery, estoque do dia,
--        movimentos de estoque, contas a pagar/receber, auditoria, fila de
--        impressão, mensagens de WhatsApp e pagamentos de entregadores.
-- Mantém: produtos, preços, custos, categorias reais, equipe, mesas, bairros
--         e todas as configurações (PIX, WhatsApp, impressão, dados da loja).
-- Remove também os produtos/categorias de DEMONSTRAÇÃO (ids a0000000-…, pausados).
-- Tudo numa transação: se algo falhar, nada é apagado.
-- ============================================================================
BEGIN;

TRUNCATE TABLE
    order_item_status_history,
    order_items,
    orders,
    payments,
    tabs,
    delivery_order_status_history,
    delivery_order_items,
    delivery_orders,
    driver_payouts,
    stock_movements,
    daily_prep_stock,
    print_queue,
    whatsapp_outbox,
    whatsapp_bot_messages,
    whatsapp_conversations,
    finance_entries,
    audit_logs,
    shifts;

-- Mesas livres e numeração do delivery recomeçando em #1001
UPDATE restaurant_tables SET status = 'LIVRE';
ALTER SEQUENCE delivery_order_number_seq RESTART WITH 1001;

-- Produtos e categorias de demonstração
DELETE FROM products
 WHERE active = false
   AND category_id::TEXT LIKE 'a0000000-%';
DELETE FROM categories c
 WHERE c.id::TEXT LIKE 'a0000000-%'
   AND NOT EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id);

COMMIT;

SELECT
    (SELECT COUNT(*) FROM shifts)          AS turnos,
    (SELECT COUNT(*) FROM tabs)            AS comandas,
    (SELECT COUNT(*) FROM delivery_orders) AS deliverys,
    (SELECT COUNT(*) FROM products)        AS produtos_mantidos,
    (SELECT COUNT(*) FROM categories)      AS categorias_mantidas,
    (SELECT COUNT(*) FROM profiles)        AS equipe_mantida,
    'ZERADO_OK' AS resultado;
