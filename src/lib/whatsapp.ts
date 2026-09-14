/**
 * Utilitário de Notificações via WhatsApp ("API Zap")
 * Formatação de links profundos wa.me e mensagens operacionais pré-configuradas
 */

import { formatBRL } from './formatters';

export function normalizePhoneNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  // Se tiver 10 ou 11 dígitos (DDD + número no Brasil), prefixa com 55
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

export function buildWhatsAppLink(phone: string, text: string): string {
  const cleanPhone = normalizePhoneNumber(phone);
  const encodedText = encodeURIComponent(text);
  return `https://wa.me/${cleanPhone}?text=${encodedText}`;
}

export interface TableBillWhatsAppParams {
  tableNumber: number;
  customerName?: string | null;
  subtotal: number;
  serviceFee: number;
  discount?: number;
  total: number;
  pixPayload?: string;
  pixKey?: string;
}

export function buildTableBillWhatsAppMessage({
  tableNumber,
  customerName,
  subtotal,
  serviceFee,
  discount = 0,
  total,
  pixPayload,
  pixKey,
}: TableBillWhatsAppParams): string {
  const greeting = customerName ? `Olá, ${customerName}!` : 'Olá!';
  let message = `🥩 *ESPETARIA SABOR DA CARNE* 🥩\n`;
  message += `${greeting} Segue o resumo da sua conta na *Mesa ${tableNumber}*:\n\n`;
  message += `📋 *Consumo:* ${formatBRL(subtotal)}\n`;

  if (serviceFee > 0) {
    message += `🧾 *Taxa de Serviço (10%):* ${formatBRL(serviceFee)}\n`;
  }
  if (discount > 0) {
    message += `🏷️ *Desconto Aplicado:* -${formatBRL(discount)}\n`;
  }

  message += `💰 *TOTAL A PAGAR: ${formatBRL(total)}*\n\n`;

  if (pixKey) {
    message += `🔑 *Chave PIX:* ${pixKey}\n`;
  }

  if (pixPayload) {
    message += `📲 *PIX Copia e Cola:*\n\`\`\`${pixPayload}\`\`\`\n\n`;
  }

  message += `Agradecemos a sua preferência e volte sempre! 🔥✨`;
  return message;
}

export interface DeliveryConfirmedWhatsAppParams {
  orderNumber: number;
  customerName: string;
  address: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  itemsSummary: string;
  estimatedMinutes?: number;
}

export function buildDeliveryConfirmedWhatsAppMessage({
  orderNumber,
  customerName,
  address,
  deliveryFee,
  total,
  itemsSummary,
  estimatedMinutes = 35,
}: DeliveryConfirmedWhatsAppParams): string {
  let message = `🛵 *ESPETARIA SABOR DA CARNE — DELIVERY* 🛵\n\n`;
  message += `Olá, *${customerName}*! Seu pedido *#${orderNumber}* foi confirmado e já está sendo preparado com muito carinho na nossa brasa! 🔥\n\n`;
  message += `📦 *Itens do Pedido:*\n${itemsSummary}\n\n`;
  message += `📍 *Endereço de Entrega:* ${address}\n`;
  message += `🛵 *Taxa de Entrega:* ${formatBRL(deliveryFee)}\n`;
  message += `💰 *Total:* ${formatBRL(total)}\n`;
  message += `⏱️ *Previsão de Entrega:* ${estimatedMinutes} a ${estimatedMinutes + 15} minutos.\n\n`;
  message += `Assim que o entregador sair da espetaria te avisamos por aqui!`;
  return message;
}

export interface DeliveryDispatchedWhatsAppParams {
  orderNumber: number;
  customerName: string;
  driverName?: string | null;
  total: number;
  paymentMethod: string;
  cashChangeFor?: number | null;
}

export function buildDeliveryDispatchedWhatsAppMessage({
  orderNumber,
  customerName,
  driverName,
  total,
  paymentMethod,
  cashChangeFor,
}: DeliveryDispatchedWhatsAppParams): string {
  const driverText = driverName ? `com o motoboy *${driverName}*` : 'com nosso entregador';
  let message = `🛵💨 *SEU PEDIDO SAIU PARA ENTREGA!* 🛵💨\n\n`;
  message += `*${customerName}*, os seus espetos do pedido *#${orderNumber}* acabaram de sair da churrasqueira ${driverText} e estão a caminho do seu endereço! 🍢🔥\n\n`;
  message += `💵 *Valor a pagar:* ${formatBRL(total)}\n`;
  message += `💳 *Forma de pagamento:* ${paymentMethod}\n`;

  if (cashChangeFor && cashChangeFor > 0) {
    message += `🪙 *Troco preparado para:* ${formatBRL(cashChangeFor)}\n`;
  }

  message += `\nFique atento à campainha ou interfone. Bom apetite! 😋`;
  return message;
}

export interface SkewerExhaustionWhatsAppParams {
  customerName: string;
  exhaustedSkewerName: string;
  suggestedAlternative: string;
}

export function buildSkewerExhaustionWhatsAppMessage({
  customerName,
  exhaustedSkewerName,
  suggestedAlternative,
}: SkewerExhaustionWhatsAppParams): string {
  let message = `🍢 *Espetaria Sabor da Carne — Aviso Rápido* 🍢\n\n`;
  message += `Olá, *${customerName}*! Tudo bem?\n`;
  message += `O espeto *${exhaustedSkewerName}* teve uma saída enorme hoje e acabou de esgotar na nossa grelha!\n\n`;
  message += `Podemos substituir para você por um delicioso *${suggestedAlternative}* ou prefere escolher outro item do nosso cardápio?\n\n`;
  message += `Responda esta mensagem que já agilizamos para você!`;
  return message;
}
