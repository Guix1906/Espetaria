-- ============================================================================
-- MIGRATION 00005: SEED RESTAURANT TABLES & PUBLIC POLICIES FOR SYNC
-- ============================================================================

-- Permite leitura de mesas para clientes anônimos (ex: cardápio público, prévia de mesas)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'restaurant_tables' AND policyname = 'Public read for tables'
    ) THEN
        CREATE POLICY "Public read for tables"
            ON restaurant_tables FOR SELECT
            TO anon
            USING (true);
    END IF;
END $$;

-- Insere 20 mesas padrão caso ainda não existam
INSERT INTO restaurant_tables (number, capacity, status, active)
VALUES
    (1, 4, 'LIVRE', true),
    (2, 4, 'LIVRE', true),
    (3, 4, 'LIVRE', true),
    (4, 6, 'LIVRE', true),
    (5, 4, 'LIVRE', true),
    (6, 4, 'LIVRE', true),
    (7, 4, 'LIVRE', true),
    (8, 6, 'LIVRE', true),
    (9, 4, 'LIVRE', true),
    (10, 4, 'LIVRE', true),
    (11, 4, 'LIVRE', true),
    (12, 6, 'LIVRE', true),
    (13, 4, 'LIVRE', true),
    (14, 4, 'LIVRE', true),
    (15, 4, 'LIVRE', true),
    (16, 6, 'LIVRE', true),
    (17, 4, 'LIVRE', true),
    (18, 4, 'LIVRE', true),
    (19, 4, 'LIVRE', true),
    (20, 6, 'LIVRE', true)
ON CONFLICT (number) DO UPDATE 
SET active = true;
