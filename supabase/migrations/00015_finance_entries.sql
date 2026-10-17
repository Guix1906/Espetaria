-- ============================================================================
-- Financeiro: contas a pagar e a receber (lançamentos manuais da gerência).
-- As vendas (salão e delivery) NÃO entram aqui: o financeiro lê direto de
-- payments e delivery_orders, então nada precisa ser digitado duas vezes.
-- ============================================================================
CREATE TABLE IF NOT EXISTS finance_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL CHECK (kind IN ('PAGAR', 'RECEBER')),
    description TEXT NOT NULL CHECK (length(trim(description)) > 0),
    category TEXT NOT NULL DEFAULT 'Outros',
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    due_date DATE NOT NULL,
    paid_at TIMESTAMPTZ,                -- NULL = em aberto
    payment_method TEXT,
    supplier TEXT,                      -- fornecedor / cliente
    notes TEXT,
    created_by UUID DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_entries_due ON finance_entries(due_date);
CREATE INDEX IF NOT EXISTS idx_finance_entries_kind ON finance_entries(kind);

ALTER TABLE finance_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Master e Gerente gerenciam o financeiro" ON finance_entries;
CREATE POLICY "Master e Gerente gerenciam o financeiro"
    ON finance_entries FOR ALL
    TO authenticated
    USING (current_user_role() IN ('MASTER', 'GERENTE'))
    WITH CHECK (current_user_role() IN ('MASTER', 'GERENTE'));

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'finance_entries') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.finance_entries;
    END IF;
END $$;
