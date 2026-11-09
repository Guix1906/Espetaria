-- Migração 00068: Catálogo persistente de sabores de arroz
-- Mantém a lista completa de arrozes já cadastrados pelo usuário para que fiquem
-- sempre disponíveis em 1 clique na tela de abertura de turno/caixa.

ALTER TABLE restaurant_settings
  ADD COLUMN IF NOT EXISTS saved_rice_flavors TEXT[] DEFAULT ARRAY['Arroz Branco', 'Baião de Dois', 'Arroz Carreteiro', 'Arroz de Alho', 'Arroz com Brócolis', 'Arroz à Grega', 'cuxa'];

UPDATE restaurant_settings
  SET saved_rice_flavors = COALESCE(saved_rice_flavors, ARRAY['Arroz Branco', 'Baião de Dois', 'Arroz Carreteiro', 'Arroz de Alho', 'Arroz com Brócolis', 'Arroz à Grega', 'cuxa']);

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
  daily_juice_flavors,
  delivery_open_override_date,
  saved_rice_flavors
FROM restaurant_settings;

GRANT SELECT ON restaurant_settings_public TO anon, authenticated;
