-- ============================================================================
-- Modelos de impressão configuráveis (churrasqueira, cozinha e etiqueta de delivery).
-- NULL = o printer-bridge usa o modelo padrão.
-- ============================================================================
ALTER TABLE restaurant_settings
  ADD COLUMN IF NOT EXISTS print_templates JSONB;
