import { describe, it, expect } from 'vitest';
import { 
  calculateCRC16, 
  formatEMV, 
  generatePixPayload, 
  generateQRCodeMatrix 
} from '../../../lib/pix';
import { 
  normalizePhoneNumber, 
  buildWhatsAppLink, 
  buildTableBillWhatsAppMessage, 
  buildDeliveryConfirmedWhatsAppMessage, 
  buildDeliveryDispatchedWhatsAppMessage, 
  buildSkewerExhaustionWhatsAppMessage 
} from '../../../lib/whatsapp';

describe('ETAPA 7: Integração PIX Dinâmico (BR Code / BACEN) & WhatsApp ("API Zap")', () => {
  describe('1. Validação de Regras do PIX Dinâmico (EMV/BACEN)', () => {
    it('deve formatar tags EMV TLV corretamente com tamanho de dois dígitos', () => {
      expect(formatEMV('00', '01')).toBe('000201');
      expect(formatEMV('53', '986')).toBe('5303986');
      expect(formatEMV('58', 'BR')).toBe('5802BR');
    });

    it('deve calcular checksum CRC16-CCITT de 4 caracteres hexadecimais em maiúsculas', () => {
      const testString = '00020126360014br.gov.bcb.pix0114+5511999999995204000053039865802BR5913FULANO DE TAL6008BRASILIA62070503***6304';
      const crc = calculateCRC16(testString);
      expect(crc).toMatch(/^[0-9A-F]{4}$/);
      expect(crc.length).toBe(4);
    });

    it('deve gerar payload BR Code Pix válido e íntegro com valor e TxID', () => {
      const payload = generatePixPayload({
        pixKey: 'contato@espetariasabor.com.br',
        merchantName: 'Espetaria Sabor da Carne',
        merchantCity: 'São Paulo',
        amount: 85.5,
        txId: 'MESA04',
        description: 'Mesa 4',
      });

      // Validações de estrutura EMV
      expect(payload).toContain('000201'); // PFI
      expect(payload).toContain('br.gov.bcb.pix'); // GUI
      expect(payload).toContain('contato@espetariasabor.com.br'); // Chave Pix
      expect(payload).toContain('5303986'); // Moeda BRL
      expect(payload).toContain('540585.50'); // Valor R$ 85.50
      expect(payload).toContain('5802BR'); // País BR
      expect(payload).toContain('5924ESPETARIA SABOR DA CARNE'); // Nome sanitizado sem acento
      expect(payload).toContain('6009SAO PAULO'); // Cidade sanitizada
      expect(payload).toContain('MESA04'); // TxID
      expect(payload).toContain('6304'); // Tag de CRC16

      // Valida integridade do CRC16 gerado no final do payload
      const crcExtracted = payload.slice(-4);
      const payloadBeforeCRC = payload.slice(0, -4);
      const expectedCRC = calculateCRC16(payloadBeforeCRC);
      expect(crcExtracted).toBe(expectedCRC);
    });

    it('deve gerar payload BR Code válido sem valor fixo (para valor aberto)', () => {
      const payload = generatePixPayload({
        pixKey: '11988887777',
        merchantName: 'Espetaria',
        merchantCity: 'Sao Paulo',
      });

      // Não deve conter tag 54 de valor
      expect(payload).not.toContain('540');
      expect(payload).toContain('62070503***'); // TxID padrão ***
      const crcExtracted = payload.slice(-4);
      const payloadBeforeCRC = payload.slice(0, -4);
      expect(crcExtracted).toBe(calculateCRC16(payloadBeforeCRC));
    });

    it('deve gerar matriz determinística de QR Code com Finder Patterns', () => {
      const matrix = generateQRCodeMatrix('00020126...');
      expect(Array.isArray(matrix)).toBe(true);
      expect(matrix.length).toBe(29);
      expect(matrix[0]?.length).toBe(29);

      // Finder top-left deve ser preto nos cantos do retângulo 7x7
      expect(matrix[0]?.[0]).toBe(true);
      expect(matrix[0]?.[6]).toBe(true);
      expect(matrix[6]?.[0]).toBe(true);
      expect(matrix[6]?.[6]).toBe(true);

      // Centro do finder deve ser preto
      expect(matrix[3]?.[3]).toBe(true);
    });
  });

  describe('2. Validação das Mensagens e Links do WhatsApp ("API Zap")', () => {
    it('deve normalizar telefones brasileiros adicionando o DDI 55 e removendo pontuação', () => {
      expect(normalizePhoneNumber('(11) 98765-4321')).toBe('5511987654321');
      expect(normalizePhoneNumber('11987654321')).toBe('5511987654321');
      expect(normalizePhoneNumber('5511987654321')).toBe('5511987654321');
      expect(normalizePhoneNumber('+55 (19) 91234-5678')).toBe('5519912345678');
    });

    it('deve construir link oficial wa.me com URL Encoding adequado', () => {
      const link = buildWhatsAppLink('11999998888', 'Olá! Seu pedido está pronto.');
      expect(link).toBe('https://wa.me/5511999998888?text=Ol%C3%A1!%20Seu%20pedido%20est%C3%A1%20pronto.');
    });

    it('deve gerar mensagem de cobrança de mesa detalhada com Copia e Cola', () => {
      const msg = buildTableBillWhatsAppMessage({
        tableNumber: 5,
        customerName: 'Lucas Lima',
        subtotal: 100.0,
        serviceFee: 10.0,
        total: 110.0,
        pixKey: 'contato@espetariasabor.com.br',
        pixPayload: '00020126...TESTPAYLOAD...6304ABCD',
      });

      expect(msg).toContain('ESPETARIA SABOR DA CARNE');
      expect(msg).toContain('Lucas Lima');
      expect(msg).toContain('Mesa 5');
      expect(msg).toContain('*Consumo:*');
      expect(msg).toContain('100,00');
      expect(msg).toContain('Taxa de Serviço (10%):');
      expect(msg).toContain('10,00');
      expect(msg).toContain('TOTAL A PAGAR:');
      expect(msg).toContain('110,00');
      expect(msg).toContain('contato@espetariasabor.com.br');
      expect(msg).toContain('00020126...TESTPAYLOAD...6304ABCD');
    });

    it('deve gerar mensagem de delivery despachado com motoboy e troco', () => {
      const msg = buildDeliveryDispatchedWhatsAppMessage({
        orderNumber: 1042,
        customerName: 'Beatriz Costa',
        driverName: 'Tiago Moto',
        total: 75.0,
        paymentMethod: 'Dinheiro',
        cashChangeFor: 100.0,
      });

      expect(msg).toContain('Beatriz Costa');
      expect(msg).toContain('#1042');
      expect(msg).toContain('Tiago Moto');
      expect(msg).toContain('75,00');
      expect(msg).toContain('Dinheiro');
      expect(msg).toContain('*Troco preparado para:*');
      expect(msg).toContain('100,00');
    });

    it('deve gerar mensagem de confirmação de pedido delivery com previsão e resumo', () => {
      const msg = buildDeliveryConfirmedWhatsAppMessage({
        orderNumber: 2001,
        customerName: 'Fernanda Rocha',
        address: 'Rua das Acácias, 99 - Centro',
        subtotal: 50.0,
        deliveryFee: 5.0,
        total: 55.0,
        itemsSummary: '• 2x Espeto de Picanha\n• 1x Suco de Laranja',
        estimatedMinutes: 30,
      });

      expect(msg).toContain('Fernanda Rocha');
      expect(msg).toContain('#2001');
      expect(msg).toContain('Rua das Acácias, 99 - Centro');
      expect(msg).toContain('55,00');
      expect(msg).toContain('• 2x Espeto de Picanha');
      expect(msg).toContain('30 a 45 minutos');
    });

    it('deve gerar mensagem amigável de substituição quando um espeto esgotar', () => {
      const msg = buildSkewerExhaustionWhatsAppMessage({
        customerName: 'Rodrigo',
        exhaustedSkewerName: 'Espeto de Cupim',
        suggestedAlternative: 'Espeto de Costela Bovina',
      });

      expect(msg).toContain('Rodrigo');
      expect(msg).toContain('Espeto de Cupim');
      expect(msg).toContain('Espeto de Costela Bovina');
      expect(msg).toContain('acabou de esgotar na nossa grelha');
    });
  });
});
