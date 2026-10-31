-- Migração 00051: Sabores do dia (Arroz e Sucos)
-- Permite ao proprietário cadastrar os sabores disponíveis para o turno,
-- sincronizando automaticamente com os celulares dos garçons.

ALTER TABLE restaurant_settings
  ADD COLUMN IF NOT EXISTS daily_rice_flavors TEXT[] DEFAULT ARRAY['Arroz Branco', 'Arroz Carreteiro', 'Arroz com Brócolis', 'Baião de Dois'],
  ADD COLUMN IF NOT EXISTS daily_juice_flavors TEXT[] DEFAULT ARRAY['Laranja', 'Maracujá', 'Limão', 'Abacaxi com Hortelã', 'Acerola'];

UPDATE restaurant_settings
   SET daily_rice_flavors = COALESCE(daily_rice_flavors, ARRAY['Arroz Branco', 'Arroz Carreteiro', 'Arroz com Brócolis', 'Baião de Dois']),
       daily_juice_flavors = COALESCE(daily_juice_flavors, ARRAY['Laranja', 'Maracujá', 'Limão', 'Abacaxi com Hortelã', 'Acerola']);

-- Atualiza a view pública para expor os sabores do dia ao cardápio digital e garçons
CREATE OR REPLACE VIEW restaurant_settings_public AS
SELECT
  id,
  name,
  address,
  phone,
  cnpj,
  service_fee_percent,
  allow_custom_service_fee,
  timezone,
  pix_key,
  pix_key_type,
  pix_merchant_name,
  pix_merchant_city,
  auto_print_orders,
  print_paper_width,
  whatsapp_auto_enabled,
  whatsapp_dispatch_url,
  print_templates,
  delivery_cutoff_time,
  created_at,
  updated_at,
  delivery_eta,
  pickup_eta,
  daily_rice_flavors,
  daily_juice_flavors
FROM restaurant_settings;

GRANT SELECT ON restaurant_settings_public TO anon, authenticated;
