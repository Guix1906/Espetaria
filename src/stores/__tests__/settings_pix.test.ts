import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '../useSettingsStore';
import { generatePixPayload } from '../../lib/pix';
import { appStorage } from '../../lib/storage';

describe('Configurações do Sistema e Chave PIX Dinâmica', () => {
  beforeEach(() => {
    appStorage.clear();
    useSettingsStore.getState().resetToDefaults();
  });

  it('1. Deve inicializar com valores padrão da espetaria', () => {
    const { settings } = useSettingsStore.getState();
    expect(settings.name).toBe('Espetaria Sabor da Carne');
    expect(settings.pix_key).toBe('contato@espetariasabor.com.br');
    expect(settings.pix_key_type).toBe('EMAIL');
    expect(settings.auto_print_orders).toBe(true);
  });

  it('2. Deve atualizar chave PIX e refletir no payload EMV BACEN', () => {
    const store = useSettingsStore.getState();

    store.updatePixConfig({
      pix_key: '11999998888',
      pix_key_type: 'TELEFONE',
      pix_merchant_name: 'ESPETARIA SABOR DA CARNE',
      pix_merchant_city: 'SAO PAULO',
    });

    const updated = useSettingsStore.getState().settings;
    expect(updated.pix_key).toBe('11999998888');
    expect(updated.pix_key_type).toBe('TELEFONE');

    // Gera payload oficial usando a configuração atualizada
    const payload = generatePixPayload({
      pixKey: updated.pix_key,
      merchantName: updated.pix_merchant_name,
      merchantCity: updated.pix_merchant_city,
      amount: 78.50,
      txId: 'ESP12345',
      description: 'Mesa 4',
    });

    expect(payload).toContain('11999998888');
    expect(payload).toContain('ESPETARIA SABOR DA CARNE');
    expect(payload).toContain('78.50');
  });

  it('3. Deve atualizar parâmetros de impressão e persistir no store', () => {
    const store = useSettingsStore.getState();

    store.updatePrinterConfig({
      print_paper_width: '58mm',
      auto_print_orders: false,
      printer_grill_enabled: true,
      printer_kitchen_enabled: true,
    });

    const updated = useSettingsStore.getState().settings;
    expect(updated.print_paper_width).toBe('58mm');
    expect(updated.auto_print_orders).toBe(false);
  });
});
