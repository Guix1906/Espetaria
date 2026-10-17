-- ============================================================================
-- MIGRATION 00019 (versão corrigida): vínculos do financeiro
--
-- A versão anterior desta migração convertia colunas updated_by de TEXT para
-- UUID, trocava status/forma de pagamento do delivery para ENUM e tirava
-- delivery_orders/whatsapp_outbox do Realtime. Isso QUEBRAVA 12 funções em uso
-- (abrir mesa, lançar pedido, cancelar item, pedir/fechar conta, fechar turno,
-- excluir comanda e todo o delivery), que gravam texto nessas colunas, e
-- deixava o painel sem aviso de pedido de delivery novo. Essas partes foram
-- removidas. Se a versão antiga já foi aplicada, rode a 00023, que desfaz.
--
-- O Realtime do Supabase respeita o RLS: só quem tem permissão de leitura
-- recebe as linhas, então manter as tabelas na publicação não expõe dados.
-- ============================================================================

-- Prevenção de duplicidade em finance_entries
ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS external_reference TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_entries_external_ref
    ON finance_entries (external_reference) WHERE external_reference IS NOT NULL;

-- Vínculo finance_entries ↔ shifts (conciliação por turno)
ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_finance_entries_shift ON finance_entries(shift_id);

select 'MIGRATION_00019_OK' as resultado;
