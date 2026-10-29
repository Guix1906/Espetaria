-- Migração 00045: Ativação de todos os bairros de entrega e telefone oficial da loja
-- Solicitado pelo proprietário em 29/10/2026.

-- 1. Ativação de todos os 23 bairros de entrega em delivery_zones
UPDATE delivery_zones
SET active = true;

-- 2. Atualização do telefone oficial da Espetaria Sabor da Carne
UPDATE restaurant_settings
SET phone = '(99) 98820-2197',
    updated_at = now();
