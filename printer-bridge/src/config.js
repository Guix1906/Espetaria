import 'dotenv/config';
import os from 'node:os';

/**
 * Converte "192.168.0.50", "192.168.0.50:9100" ou "tcp://192.168.0.50:9100"
 * em { host, port }. Retorna null se vazio.
 */
export function parsePrinterAddress(value) {
  if (!value || !value.trim()) return null;
  const clean = value.trim().replace(/^tcp:\/\//i, '');
  const [host, portText] = clean.split(':');
  const port = portText ? parseInt(portText, 10) : 9100;
  if (!host || Number.isNaN(port)) throw new Error(`Endereço de impressora inválido: "${value}"`);
  return { host, port, label: `${host}:${port}` };
}

export function loadConfig(env = process.env) {
  const mode = (env.PRINT_MODE || 'simulate').toLowerCase();
  if (!['simulate', 'live'].includes(mode)) {
    throw new Error('PRINT_MODE deve ser "simulate" (grava arquivos) ou "live" (imprime de verdade).');
  }

  const printers = {
    GRILL: parsePrinterAddress(env.PRINTER_GRILL),
    KITCHEN: parsePrinterAddress(env.PRINTER_KITCHEN),
    BAR: parsePrinterAddress(env.PRINTER_BAR),
    CASHIER: parsePrinterAddress(env.PRINTER_CASHIER),
  };

  return {
    mode,
    supabaseUrl: env.SUPABASE_URL || '',
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
    // Acesso restrito (recomendado): chave pública + usuário que só mexe na fila de impressão
    anonKey: env.SUPABASE_ANON_KEY || '',
    printerEmail: env.PRINTER_EMAIL || '',
    printerPassword: env.PRINTER_PASSWORD || '',
    workerName: env.WORKER_NAME || `bridge-${os.hostname()}`,
    pollIntervalMs: parseInt(env.POLL_INTERVAL_MS || '4000', 10),
    printTimeoutMs: parseInt(env.PRINT_TIMEOUT_MS || '5000', 10),
    paperColumns: parseInt(env.PAPER_COLUMNS || '48', 10),
    restaurantName: env.RESTAURANT_NAME || 'ESPETARIA SABOR DA CARNE',
    outputDir: env.OUTPUT_DIR || './impressoes-simuladas',
    beepOnOrder: (env.BEEP_ON_ORDER || 'false').toLowerCase() === 'true',
    port: parseInt(env.PORT || '4021', 10),
    printers,
  };
}

/**
 * Qual impressora recebe o cupom de cada setor.
 *  GRILL   -> churrasqueira
 *  KITCHEN -> cozinha (acompanhamentos)
 *  BAR     -> bar; se não houver, churrasqueira (cozinha é só acompanhamentos)
 *  NONE    -> expedição/caixa (cupom de delivery); se não houver, churrasqueira
 */
export function resolvePrinter(config, sector) {
  const p = config.printers;
  const grill = () => (p.GRILL ? { target: 'GRILL', address: p.GRILL } : { target: 'KITCHEN', address: p.KITCHEN });
  switch (sector) {
    case 'GRILL': return { target: 'GRILL', address: p.GRILL };
    case 'KITCHEN': return { target: 'KITCHEN', address: p.KITCHEN };
    case 'BAR': return p.BAR ? { target: 'BAR', address: p.BAR } : grill();
    default: return p.CASHIER ? { target: 'CASHIER', address: p.CASHIER } : grill();
  }
}
