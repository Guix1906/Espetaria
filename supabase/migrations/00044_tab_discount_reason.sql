-- ============================================================================
-- MIGRATION 00044: MOTIVO DO DESCONTO NA COMANDA
-- ----------------------------------------------------------------------------
-- O caixa informa o motivo ao dar desconto no fechamento da conta. O motivo
-- é acrescentado às observações da comanda e fica na auditoria.
-- Idempotente.
-- ============================================================================

CREATE OR REPLACE FUNCTION set_tab_discount_reason(p_tab_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := require_role(ARRAY['MASTER', 'GERENTE', 'CAIXA']::app_role[]);
    v_tab tabs;
    v_line TEXT;
BEGIN
    IF COALESCE(trim(p_reason), '') = '' THEN RETURN; END IF;
    SELECT * INTO v_tab FROM tabs WHERE id = p_tab_id AND status = 'OPEN' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Comanda não encontrada ou já encerrada.'; END IF;

    v_line := 'Desconto de R$ ' || to_char(v_tab.discount, 'FM999990D00') || ': ' || left(trim(p_reason), 200);
    UPDATE tabs
       SET notes = CASE WHEN COALESCE(notes, '') = '' THEN v_line ELSE notes || E'\n' || v_line END
     WHERE id = p_tab_id;

    INSERT INTO audit_logs (shift_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (v_tab.shift_id, v_uid, 'MOTIVO_DESCONTO', 'tabs', p_tab_id::TEXT,
            jsonb_build_object('discount', v_tab.discount, 'reason', left(trim(p_reason), 200)));
END;
$$;

REVOKE ALL ON FUNCTION set_tab_discount_reason(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_tab_discount_reason(UUID, TEXT) TO authenticated;
