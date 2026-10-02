-- ============================================================================
-- SEED DATA FOR ESPETARIA SABOR DA CARNE
-- ============================================================================

-- 1. Restaurant Settings
INSERT INTO restaurant_settings (name, phone, service_fee_percent, timezone)
VALUES ('Espetaria Sabor da Carne', '(11) 99999-9999', 10.00, 'America/Sao_Paulo')
ON CONFLICT DO NOTHING;

-- 2. Mock User Profiles for Development
-- (In production, these UUIDs match Supabase auth.users)
INSERT INTO profiles (id, name, email, role) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Carlos Master (Dono)', 'master@espetaria.com.br', 'MASTER')
ON CONFLICT (id) DO NOTHING;

-- 3. Categories
INSERT INTO categories (id, name, display_order) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'Espetos Nobres', 1),
    ('a0000000-0000-0000-0000-000000000002', 'Espetos Tradicionais', 2),
    ('a0000000-0000-0000-0000-000000000003', 'Acompanhamentos & Cubas', 3),
    ('a0000000-0000-0000-0000-000000000004', 'Bebidas & Cervejas', 4),
    ('a0000000-0000-0000-0000-000000000005', 'Sobremesas', 5)
ON CONFLICT (id) DO NOTHING;

-- 4. Products
INSERT INTO products (
    id, category_id, name, description, price, sector, type, 
    tracks_stock, is_cubas, portions_per_cuba, allows_doneness, display_order
) VALUES
    -- Espetos Nobres
    ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Espeto de Picanha Grill', 'Picanha maturada na brasa com sal grosso especial', 24.00, 'GRILL', 'ESPETO', true, false, 1, true, 1),
    ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Espeto de Alcatra Especial', 'Miolo de alcatra macio e suculento', 21.00, 'GRILL', 'ESPETO', true, false, 1, true, 2),
    ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Fraldinha na Mostarda', 'Fraldinha grelhada com toque de mostarda Dijon', 22.00, 'GRILL', 'ESPETO', true, false, 1, true, 3),
    
    -- Espetos Tradicionais
    ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 'Coração de Frango', 'Coraçõezinhos marinados com ervas finas', 16.00, 'GRILL', 'ESPETO', true, false, 1, false, 4),
    ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000002', 'Medalhão de Frango c/ Bacon', 'Peito de frango envolvido em fatias crocantes de bacon', 17.00, 'GRILL', 'ESPETO', true, false, 1, false, 5),
    ('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000002', 'Queijo Coalho c/ Melaço', 'Queijo coalho tostadinho acompanhado de melaço de cana', 16.00, 'GRILL', 'ESPETO', true, false, 1, false, 6),
    ('b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000002', 'Pão de Alho Tradicional', 'Cremoso com queijo e alho assado', 13.00, 'GRILL', 'ESPETO', true, false, 1, false, 7),

    -- Acompanhamentos & Cubas
    ('b0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000003', 'Arroz Branco Soltinho (Porção)', 'Produzido em cubas gastronômicas de alta qualidade', 12.00, 'KITCHEN', 'PORCAO', true, true, 15, false, 8),
    ('b0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000003', 'Feijão Tropeiro da Casa (Porção)', 'Com bacon, ovos, couve e farinha especial de milho', 16.00, 'KITCHEN', 'PORCAO', true, true, 15, false, 9),
    ('b0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000003', 'Mandioca Cozida na Manteiga', 'Mandioca macia desfiando com manteiga de garrafa', 14.00, 'KITCHEN', 'PORCAO', true, true, 12, false, 10),
    ('b0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000003', 'Vinagrete Especial', 'Tomates frescos, cebola roxa, cheiro verde e azeite', 8.00, 'KITCHEN', 'PORCAO', false, false, 1, false, 11),
    ('b0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000003', 'Farofa Crocante de Alho', 'Farinha de mandioca torrada com alho crocante', 7.00, 'KITCHEN', 'PORCAO', false, false, 1, false, 12),

    -- Bebidas
    ('b0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000004', 'Cerveja Original 600ml', 'Garrafa 600ml gelada trincando', 15.00, 'BAR', 'BEBIDA', true, false, 1, false, 13),
    ('b0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000004', 'Cerveja Heineken 600ml', 'Garrafa 600ml premium lager', 18.00, 'BAR', 'BEBIDA', true, false, 1, false, 14),
    ('b0000000-0000-0000-0000-000000000015', 'a0000000-0000-0000-0000-000000000004', 'Coca-Cola Lata 350ml', 'Original ou Zero Açúcar', 7.00, 'BAR', 'BEBIDA', true, false, 1, false, 15),
    ('b0000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000004', 'Água Mineral 500ml', 'Com ou sem gás', 5.00, 'BAR', 'BEBIDA', true, false, 1, false, 16),

    -- Sobremesas
    ('b0000000-0000-0000-0000-000000000017', 'a0000000-0000-0000-0000-000000000005', 'Pudim de Leite Condensado', 'Fatia generosa com calda de caramelo brilhante', 12.00, 'KITCHEN', 'SOBREMESA', true, false, 1, false, 17)
ON CONFLICT (id) DO NOTHING;

-- 5. Mesas (01 a 20)
INSERT INTO restaurant_tables (number, capacity, status)
SELECT 
    i AS number,
    CASE WHEN i % 4 = 0 THEN 6 ELSE 4 END AS capacity,
    'LIVRE'::table_status AS status
FROM generate_series(1, 20) AS i
ON CONFLICT (number) DO NOTHING;
