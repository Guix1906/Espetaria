-- ============================================================================
-- MIGRATION 00012: CHAMADA AUTENTICADA DA FUNÇÃO whatsapp-dispatch
-- A função mantém "Verify JWT" ligado; o banco envia a chave pública (anon) do
-- projeto, a mesma que já vai no site. O app preenche a coluna ao ativar o
-- WhatsApp automático em Configurações.
-- ============================================================================
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS whatsapp_dispatch_token TEXT;

CREATE OR REPLACE FUNCTION wake_whatsapp_dispatch()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_url TEXT;
    v_token TEXT;
    v_enabled BOOLEAN;
BEGIN
    SELECT whatsapp_dispatch_url, whatsapp_dispatch_token, whatsapp_auto_enabled
      INTO v_url, v_token, v_enabled
      FROM restaurant_settings LIMIT 1;
    IF NOT COALESCE(v_enabled, false) OR COALESCE(v_url, '') = '' THEN RETURN; END IF;
    PERFORM net.http_post(
        url := v_url,
        body := '{}'::jsonb,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || COALESCE(v_token, ''),
            'apikey', COALESCE(v_token, '')
        )
    );
EXCEPTION WHEN OTHERS THEN
    -- Sem pg_net ou URL inválida: a mensagem fica na fila para o próximo disparo
    NULL;
END;
$$;
REVOKE ALL ON FUNCTION wake_whatsapp_dispatch() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION wake_whatsapp_dispatch() TO authenticated;

select 'MIGRATION_00012_OK' as resultado;
