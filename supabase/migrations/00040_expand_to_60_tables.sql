-- ============================================================================
-- 00040: Expande a quantidade de mesas do restaurante para 60 mesas
-- Idempotente.
-- ============================================================================
INSERT INTO restaurant_tables (number, capacity, status, active)
SELECT i, 4, 'LIVRE', true
FROM generate_series(21, 60) i
WHERE NOT EXISTS (SELECT 1 FROM restaurant_tables WHERE number = i);
