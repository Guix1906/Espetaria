-- ============================================================================
-- Endereço da loja + bairros de Lago da Pedra (MA)  (pedido do dono em 26/10/2026)
-- Bairros: lista da Prefeitura (lagodapedra.ma.gov.br/localidades.php), zona urbana.
-- Os bairros entram DESATIVADOS e com taxa 0: o dono define a taxa de cada um em
-- Configurações → Delivery → Bairros e taxas e ativa. Assim nenhum cliente pede com
-- entrega grátis por engano. Os bairros de exemplo antigos são desativados.
-- Idempotente.
-- ============================================================================
BEGIN;

UPDATE restaurant_settings
   SET address = 'Rua São José, 144 - Vila Santa, Lago da Pedra - MA',
       updated_at = NOW();

-- Bairros de exemplo que vieram com o sistema (não existem em Lago da Pedra)
UPDATE delivery_zones SET active = false
 WHERE name IN ('Jardim das Américas', 'Bairro Alto', 'Vila Nova', 'Morumbi', 'Parque Residencial');

INSERT INTO delivery_zones (name, fee, active, display_order) VALUES
    ('Centro', 0, false, 1),
    ('Vila Santa', 0, false, 2),
    ('Cajueiro', 0, false, 3),
    ('Interlagos', 0, false, 4),
    ('Jaguar', 0, false, 5),
    ('Macaúba', 0, false, 6),
    ('Marajá', 0, false, 7),
    ('Planalto', 0, false, 8),
    ('Rodoviária', 0, false, 9),
    ('Serra Dourada', 0, false, 10),
    ('Vieira Neto', 0, false, 11),
    ('Waldir Filho', 0, false, 12),
    ('Vila da Paz', 0, false, 13),
    ('Vila Mangueira', 0, false, 14),
    ('Vila Rocha', 0, false, 15),
    ('Conjunto Marta Moraes', 0, false, 16),
    ('Conjunto Raimunda Alves de Melo', 0, false, 17)
ON CONFLICT (name) DO UPDATE SET display_order = EXCLUDED.display_order;

COMMIT;

SELECT name AS bairro, fee AS taxa, active AS ativo FROM delivery_zones ORDER BY active DESC, display_order;
