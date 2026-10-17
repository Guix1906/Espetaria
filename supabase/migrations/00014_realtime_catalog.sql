-- ============================================================================
-- Tempo real do cardápio e das configurações: produto cadastrado/editado/pausado
-- e configurações da loja chegam na hora aos celulares dos garçons e ao caixa.
-- ============================================================================
DO $$
DECLARE
    t TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        FOREACH t IN ARRAY ARRAY['products', 'categories', 'restaurant_settings'] LOOP
            IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
                EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
            END IF;
        END LOOP;
    END IF;
END $$;
