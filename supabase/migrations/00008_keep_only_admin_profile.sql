-- ============================================================================
-- MIGRATION 00008: REMOVE PERFIS DE EXEMPLO, MANTÉM APENAS O ADMIN (MASTER)
-- Os demais usuários serão cadastrados pelo próprio sistema.
-- ============================================================================

DELETE FROM profiles p
 WHERE p.email IN (
        'gerente@espetaria.com.br',
        'garcom1@espetaria.com.br',
        'churrasqueira@espetaria.com.br',
        'cozinha@espetaria.com.br',
        'caixa@espetaria.com.br'
       )
   -- Segurança: não apaga perfil que já tenha histórico operacional
   AND NOT EXISTS (SELECT 1 FROM shifts s WHERE p.id IN (s.opened_by, s.closed_by))
   AND NOT EXISTS (SELECT 1 FROM tabs t WHERE p.id IN (t.opened_by, t.closed_by))
   AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.created_by = p.id)
   AND NOT EXISTS (SELECT 1 FROM payments pm WHERE pm.received_by = p.id)
   AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.user_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM order_item_status_history h WHERE h.changed_by = p.id);

-- Perfis passam a ser alterados só pela Edge Function "manage-staff"
-- (impede, por exemplo, um gerente de se promover a MASTER via API REST).
DROP POLICY IF EXISTS "Master and Gerente can manage profiles" ON profiles;

-- Garante que o admin exista e esteja ativo
UPDATE profiles SET is_active = true, role = 'MASTER'
 WHERE email = 'master@espetaria.com.br';
