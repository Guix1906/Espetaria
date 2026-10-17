-- 00025: reforço de segurança — fixa search_path nas funções SECURITY DEFINER que ainda não tinham.
-- Idempotente: só altera a função se ela existir com essa assinatura.
DO $$
DECLARE
    v_sig TEXT;
BEGIN
    FOREACH v_sig IN ARRAY ARRAY[
        'public.open_shift_with_stock(TEXT, UUID, TEXT, NUMERIC, JSONB)',
        'public.toggle_product_exhaustion(UUID, UUID, BOOLEAN, UUID, TEXT)',
        'public.adjust_stock_physical_count(UUID, UUID, INT, TEXT, UUID)'
    ] LOOP
        IF to_regprocedure(v_sig) IS NOT NULL THEN
            EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', v_sig);
        END IF;
    END LOOP;
END $$;
