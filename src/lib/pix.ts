/**
 * Utilitário de Geração de PIX Dinâmico (BR Code / EMV QRCPS-MPM)
 * Padrão Banco Central do Brasil (BACEN)
 * Sem dependências externas - 100% tipado em TypeScript Strict
 */

export interface PixPayloadParams {
  pixKey: string;
  merchantName: string;
  merchantCity: string;
  amount?: number;
  txId?: string;
  description?: string;
}

/**
 * Calcula o checksum CRC16-CCITT (Polinômio 0x1021, valor inicial 0xFFFF)
 * Algoritmo oficial exigido pelo BACEN para validação de BR Code.
 */
export function calculateCRC16(payload: string): string {
  let crc = 0xffff;
  const polynomial = 0x1021;

  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ polynomial) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Formata um campo TLV (Tag-Length-Value) do padrão EMV
 */
export function formatEMV(tag: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${tag}${len}${value}`;
}

/**
 * Normaliza e limpa o nome do comerciante e cidade para os limites do BACEN
 */
function sanitizeString(str: string, maxLen: number): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .toUpperCase()
    .slice(0, maxLen)
    .trim();
}

/**
 * Gera a string Pix Copia e Cola (BR Code) oficial do BACEN
 */
export function generatePixPayload({
  pixKey,
  merchantName,
  merchantCity,
  amount,
  txId,
  description,
}: PixPayloadParams): string {
  // 00: Payload Format Indicator (Fixo '01')
  const pfi = formatEMV('00', '01');

  // 26: Merchant Account Information - GUI br.gov.bcb.pix
  const gui = formatEMV('00', 'br.gov.bcb.pix');
  const key = formatEMV('01', pixKey.trim());
  const desc = description ? formatEMV('02', sanitizeString(description, 40)) : '';
  const merchantAccountInfo = formatEMV('26', `${gui}${key}${desc}`);

  // 52: Merchant Category Code (0000 = Padrão)
  const mcc = formatEMV('52', '0000');

  // 53: Transaction Currency (986 = Real Brasileiro BRL)
  const currency = formatEMV('53', '986');

  // 54: Transaction Amount (opcional, se > 0)
  const amountField = amount && amount > 0 ? formatEMV('54', amount.toFixed(2)) : '';

  // 58: Country Code (BR)
  const countryCode = formatEMV('58', 'BR');

  // 59: Merchant Name (Max 25 caracteres)
  const nameField = formatEMV('59', sanitizeString(merchantName, 25));

  // 60: Merchant City (Max 15 caracteres)
  const cityField = formatEMV('60', sanitizeString(merchantCity, 15));

  // 62: Additional Data Field (TxID / Identificador de Pagamento)
  // Se não informado, usa '***' conforme padrão BACEN
  const safeTxId = (txId || '***').replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || '***';
  const txIdSubField = formatEMV('05', safeTxId);
  const additionalDataField = formatEMV('62', txIdSubField);

  // Monta payload sem o CRC
  const payloadBeforeCRC = `${pfi}${merchantAccountInfo}${mcc}${currency}${amountField}${countryCode}${nameField}${cityField}${additionalDataField}6304`;

  // Calcula e anexa CRC16
  const crc = calculateCRC16(payloadBeforeCRC);
  return `${payloadBeforeCRC}${crc}`;
}

