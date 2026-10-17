-- Cardápio novo (fotos do cardápio físico, 12/10/2026).
-- Rodar no Supabase -> SQL Editor -> colar tudo -> Run. Pode rodar mais de uma vez.
-- Nada é apagado: produtos/categorias antigos ficam INATIVOS (somem do cardápio,
-- mas continuam nas vendas e relatórios antigos).

-- 1) Esconde tudo que existe hoje
UPDATE products   SET active = false, updated_at = NOW();
UPDATE categories SET active = false;

-- 2) Categorias novas (na ordem do cardápio)
INSERT INTO categories (name, display_order, active) VALUES
  ('Espetos sem acompanhamento', 1, true),
  ('Espetos com acompanhamento', 2, true),
  ('Entradas', 3, true),
  ('Porções', 4, true),
  ('Cervejas', 5, true),
  ('Drinks', 6, true),
  ('Gin', 7, true),
  ('Não alcoólico', 8, true),
  ('Refrigerantes e sucos', 9, true),
  ('Águas', 10, true),
  ('Outras bebidas', 11, true)
ON CONFLICT (name) DO UPDATE SET display_order = EXCLUDED.display_order, active = true;

-- 3) Produtos: atualiza se já existir (mesmo nome na mesma categoria), senão cria
WITH p(cat, ord, name, description, price, sector, type, tracks_stock, doneness, active) AS (VALUES
-- Espetos sem acompanhamento
('Espetos sem acompanhamento', 1,'Picanha',NULL,54,'GRILL','ESPETO',true,true,true),
('Espetos sem acompanhamento', 2,'Alcatra',NULL,26,'GRILL','ESPETO',true,true,true),
('Espetos sem acompanhamento', 3,'Alcatra com bacon',NULL,30,'GRILL','ESPETO',true,true,true),
('Espetos sem acompanhamento', 4,'Filé-mignon',NULL,30,'GRILL','ESPETO',true,true,true),
('Espetos sem acompanhamento', 5,'Filé-mignon com bacon',NULL,36,'GRILL','ESPETO',true,true,true),
('Espetos sem acompanhamento', 6,'Frango',NULL,18,'GRILL','ESPETO',true,false,true),
('Espetos sem acompanhamento', 7,'Coração de frango',NULL,24,'GRILL','ESPETO',true,false,true),
('Espetos sem acompanhamento', 8,'Suíno',NULL,18,'GRILL','ESPETO',true,false,true),
('Espetos sem acompanhamento', 9,'Linguiça toscana',NULL,18,'GRILL','ESPETO',true,false,true),
('Espetos sem acompanhamento',10,'Linguiça recheada com queijo',NULL,25,'GRILL','ESPETO',true,false,true),
-- Espetos com acompanhamento
('Espetos com acompanhamento', 1,'Picanha com acompanhamento','Acompanha arroz, vinagrete, farofa e purê.',60,'GRILL','ESPETO',true,true,true),
('Espetos com acompanhamento', 2,'Alcatra com acompanhamento','Acompanha arroz, vinagrete, farofa e purê.',35,'GRILL','ESPETO',true,true,true),
('Espetos com acompanhamento', 3,'Alcatra com bacon com acompanhamento','Acompanha arroz, vinagrete, farofa e purê.',40,'GRILL','ESPETO',true,true,true),
('Espetos com acompanhamento', 4,'Filé-mignon com acompanhamento','Acompanha arroz, vinagrete, farofa e purê.',40,'GRILL','ESPETO',true,true,true),
('Espetos com acompanhamento', 5,'Filé-mignon com bacon com acompanhamento','Acompanha arroz, vinagrete, farofa e purê.',45,'GRILL','ESPETO',true,true,true),
('Espetos com acompanhamento', 6,'Frango com acompanhamento','Acompanha arroz, vinagrete, farofa e purê.',26,'GRILL','ESPETO',true,false,true),
('Espetos com acompanhamento', 7,'Coração de frango com acompanhamento','Acompanha arroz, vinagrete, farofa e purê.',30,'GRILL','ESPETO',true,false,true),
('Espetos com acompanhamento', 8,'Suíno com acompanhamento','Acompanha arroz, vinagrete, farofa e purê.',26,'GRILL','ESPETO',true,false,true),
('Espetos com acompanhamento', 9,'Linguiça toscana com acompanhamento','Acompanha arroz, vinagrete, farofa e purê.',26,'GRILL','ESPETO',true,false,true),
('Espetos com acompanhamento',10,'Linguiça recheada com queijo com acompanhamento','Acompanha arroz, vinagrete, farofa e purê.',32,'GRILL','ESPETO',true,false,true),
-- Entradas
('Entradas',1,'Camarão na taça','Preço a definir',0,'KITCHEN','PORCAO',true,false,false),
('Entradas',2,'Cebola assada',NULL,5,'GRILL','PORCAO',true,false,true),
('Entradas',3,'Espeto de queijo',NULL,20,'GRILL','ESPETO',true,false,true),
('Entradas',4,'Espeto de pão de alho picante com queijo',NULL,10,'GRILL','ESPETO',true,false,true),
('Entradas',5,'Batata frita',NULL,25,'KITCHEN','PORCAO',true,false,true),
('Entradas',6,'Filé com fritas',NULL,50,'KITCHEN','PORCAO',true,false,true),
('Entradas',7,'Pastéis',NULL,25,'KITCHEN','PORCAO',true,false,true),
-- Porções
('Porções',1,'Arroz',NULL,8,'KITCHEN','PORCAO',true,false,true),
('Porções',2,'Vinagrete',NULL,8,'KITCHEN','PORCAO',true,false,true),
('Porções',3,'Farofa',NULL,5,'KITCHEN','PORCAO',true,false,true),
('Porções',4,'Purê',NULL,8,'KITCHEN','PORCAO',true,false,true),
('Porções',5,'Salada',NULL,8,'KITCHEN','PORCAO',true,false,true),
-- Cervejas
('Cervejas',1,'Long neck',NULL,12,'BAR','BEBIDA',false,false,true),
('Cervejas',2,'Heineken 600ml',NULL,16,'BAR','BEBIDA',false,false,true),
('Cervejas',3,'Antarctica Original 600ml',NULL,16,'BAR','BEBIDA',false,false,true),
('Cervejas',4,'Skol 600ml',NULL,13,'BAR','BEBIDA',false,false,true),
-- Drinks
('Drinks',1,'Caipirinha','Cachaça, limão taiti e açúcar.',15,'BAR','BEBIDA',false,false,true),
('Drinks',2,'Caipirosca vodka nacional','Vodka Smirnoff, limão taiti e açúcar.',25,'BAR','BEBIDA',false,false,true),
('Drinks',3,'Caipirosca vodka premium','Vodka, limão taiti e açúcar.',30,'BAR','BEBIDA',false,false,true),
('Drinks',4,'Caipifrutas','Vodka Smirnoff, abacaxi ou maracujá e açúcar.',25,'BAR','BEBIDA',false,false,true),
('Drinks',5,'Lagoa azul','Vodka Smirnoff, curaçau blue, limão taiti e Sprite.',20,'BAR','BEBIDA',false,false,true),
('Drinks',6,'Caipiveja','Cerveja, vodka Smirnoff, limão taiti e borda de sal.',25,'BAR','BEBIDA',false,false,true),
('Drinks',7,'Soda italiana morango',NULL,20,'BAR','BEBIDA',false,false,true),
('Drinks',8,'Soda italiana curaçau blue',NULL,20,'BAR','BEBIDA',false,false,true),
-- Gin
('Gin',1,'Gin tônica','Gin, água tônica ou Sprite, limão siciliano e especiarias.',20,'BAR','BEBIDA',false,false,true),
('Gin',2,'Gin tropical','Gin, Red Bull tropical, maracujá e especiarias.',30,'BAR','BEBIDA',false,false,true),
('Gin',3,'Gin melancia','Gin, Red Bull melancia e especiarias.',30,'BAR','BEBIDA',false,false,true),
('Gin',4,'Gin da casa','Gin, Absolut, Red Bull e gelo.',35,'BAR','BEBIDA',false,false,true),
-- Não alcoólico
('Não alcoólico',1,'Coquetel de morango','Morango em pó, leite condensado, creme de leite e Sprite.',18,'BAR','BEBIDA',false,false,true),
-- Refrigerantes e sucos
('Refrigerantes e sucos',1,'H2O / Aquarius / Schweppes',NULL,10,'BAR','BEBIDA',false,false,true),
('Refrigerantes e sucos',2,'Refrigerante lata',NULL,7,'BAR','BEBIDA',false,false,true),
('Refrigerantes e sucos',3,'Refrigerante 1L retornável',NULL,12,'BAR','BEBIDA',false,false,true),
('Refrigerantes e sucos',4,'Sucos',NULL,8,'BAR','BEBIDA',false,false,true),
('Refrigerantes e sucos',5,'Sucos com leite',NULL,9,'BAR','BEBIDA',false,false,true),
('Refrigerantes e sucos',6,'Suco de maracujá',NULL,10,'BAR','BEBIDA',false,false,true),
('Refrigerantes e sucos',7,'Suco de maracujá com leite',NULL,12,'BAR','BEBIDA',false,false,true),
('Refrigerantes e sucos',8,'Jarra de suco',NULL,45,'BAR','BEBIDA',false,false,true),
-- Águas
('Águas',1,'Água mineral sem gás 500ml',NULL,3,'BAR','BEBIDA',false,false,true),
('Águas',2,'Água mineral com gás 500ml',NULL,5,'BAR','BEBIDA',false,false,true),
-- Outras bebidas
('Outras bebidas',1,'Red Bull',NULL,15,'BAR','BEBIDA',false,false,true),
('Outras bebidas',2,'Whisky Old Parr - dose',NULL,20,'BAR','BEBIDA',false,false,true),
('Outras bebidas',3,'Cachaça mineira - dose',NULL,10,'BAR','BEBIDA',false,false,true),
('Outras bebidas',4,'Vinho - garrafa','Preço a consultar',0,'BAR','BEBIDA',false,false,false),
('Outras bebidas',5,'Red Label - dose',NULL,15,'BAR','BEBIDA',false,false,true)
),
pc AS (
  SELECT c.id AS category_id, p.* FROM p JOIN categories c ON c.name = p.cat
),
upd AS (
  UPDATE products pr SET
    description = pc.description, price = pc.price,
    sector = pc.sector::production_sector, type = pc.type::product_type,
    tracks_stock = pc.tracks_stock, allows_doneness = pc.doneness,
    active = pc.active, available = true, display_order = pc.ord, updated_at = NOW()
  FROM pc
  WHERE pr.category_id = pc.category_id AND lower(pr.name) = lower(pc.name)
  RETURNING pr.id
)
INSERT INTO products (category_id, name, description, price, sector, type,
                      tracks_stock, allows_doneness, active, available, display_order)
SELECT pc.category_id, pc.name, pc.description, pc.price,
       pc.sector::production_sector, pc.type::product_type,
       pc.tracks_stock, pc.doneness, pc.active, true, pc.ord
FROM pc
WHERE NOT EXISTS (
  SELECT 1 FROM products pr WHERE pr.category_id = pc.category_id AND lower(pr.name) = lower(pc.name)
);

-- 4) Limpa sobras de tentativas anteriores
DROP TABLE IF EXISTS _cat;
DROP TABLE IF EXISTS _p;

-- 5) Conferência
SELECT c.display_order, c.name AS categoria, p.name AS produto, p.price
FROM products p JOIN categories c ON c.id = p.category_id
WHERE p.active ORDER BY c.display_order, p.display_order;