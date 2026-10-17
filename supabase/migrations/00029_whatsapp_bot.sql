-- ============================================================================
-- MIGRATION 00029: ROBÔ DE ATENDIMENTO NO WHATSAPP (respostas automáticas)
--  * restaurant_settings.whatsapp_bot: liga/desliga, lista de teste e textos
--  * whatsapp_conversations: uma linha por cliente (robô pausado? até quando?)
--  * whatsapp_bot_messages: histórico curto da conversa (contexto do robô)
-- Quem grava é a Edge Function whatsapp-bot (service_role). A equipe só lê.
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================================

ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS whatsapp_bot JSONB;

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
    phone TEXT PRIMARY KEY,                 -- só dígitos, como a Z-API envia (com DDI)
    customer_name TEXT,
    bot_paused_until TIMESTAMPTZ,           -- robô em silêncio até este horário
    pause_reason TEXT,                      -- HANDOFF (pediu atendente), HUMAN (equipe respondeu), LIMIT (mensagens demais)
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_preview TEXT
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_last ON whatsapp_conversations(last_message_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_bot_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('IN', 'BOT', 'HUMAN')),
    body TEXT NOT NULL,
    provider_message_id TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_bot_messages_phone ON whatsapp_bot_messages(phone, created_at DESC);

-- Conversas de clientes: só proprietário e gerente leem
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_bot_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read whatsapp conversations" ON whatsapp_conversations;
CREATE POLICY "Managers read whatsapp conversations" ON whatsapp_conversations FOR SELECT TO authenticated
    USING (current_user_role() IN ('MASTER', 'GERENTE'));

DROP POLICY IF EXISTS "Managers read whatsapp bot messages" ON whatsapp_bot_messages;
CREATE POLICY "Managers read whatsapp bot messages" ON whatsapp_bot_messages FOR SELECT TO authenticated
    USING (current_user_role() IN ('MASTER', 'GERENTE'));

-- Devolver a conversa ao robô (depois que o atendente resolveu)
CREATE OR REPLACE FUNCTION resume_whatsapp_bot(p_phone TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
BEGIN
    UPDATE whatsapp_conversations SET bot_paused_until = NULL, pause_reason = NULL WHERE phone = p_phone;
END;
$$;
REVOKE ALL ON FUNCTION resume_whatsapp_bot(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION resume_whatsapp_bot(TEXT) TO authenticated;

select 'MIGRATION_00029_OK' as resultado;
