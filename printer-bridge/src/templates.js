// ============================================================================
// Modelos de impressão configuráveis pelo painel (restaurant_settings.print_templates).
// Mantenha em sincronia com src/lib/printTemplates.ts (preview do painel).
// ============================================================================

// layout: 'ANOTA_PRODUCAO' (sem preços, pedido grande) | 'ANOTA_COMPLETO' (preços, cliente, pagamento) | 'PADRAO'
export const DEFAULT_TEMPLATES = {
  GRILL: {
    layout: 'ANOTA_PRODUCAO',
    title: 'CHURRASQUEIRA',
    show_restaurant_name: true,
    item_size: 3,
    show_doneness: true,
    show_notes: true,
    show_waiter: true,
    show_time: true,
    copies: 1,
    beep: true,
    footer: '',
  },
  KITCHEN: {
    layout: 'ANOTA_PRODUCAO',
    title: 'COZINHA',
    show_restaurant_name: true,
    item_size: 3,
    show_doneness: false,
    show_notes: true,
    show_waiter: true,
    show_time: true,
    copies: 1,
    beep: true,
    footer: '',
  },
  EXPEDICAO: {
    layout: 'ANOTA_COMPLETO',
    show_restaurant_name: true,
    show_time: true,
    show_notes: true,
    show_doneness: true,
    copies: 1,
    footer: '',
  },
  DELIVERY_LABEL: {
    enabled: true,
    show_phone: true,
    show_address: true,
    show_reference: true,
    show_payment: true,
    show_total: true,
    footer: 'Confira o pedido antes de lacrar a embalagem.',
  },
};

/** Mescla o que veio do banco com o padrão (campos ausentes usam o padrão). */
export function resolveTemplates(remote) {
  const r = remote && typeof remote === 'object' ? remote : {};
  return {
    GRILL: { ...DEFAULT_TEMPLATES.GRILL, ...(r.GRILL || {}) },
    KITCHEN: { ...DEFAULT_TEMPLATES.KITCHEN, ...(r.KITCHEN || {}) },
    EXPEDICAO: { ...DEFAULT_TEMPLATES.EXPEDICAO, ...(r.EXPEDICAO || {}) },
    DELIVERY_LABEL: { ...DEFAULT_TEMPLATES.DELIVERY_LABEL, ...(r.DELIVERY_LABEL || {}) },
  };
}
