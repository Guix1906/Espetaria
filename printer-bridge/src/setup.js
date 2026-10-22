// Assistente de configuração das impressoras (duplo clique em CONFIGURAR-IMPRESSORAS.bat).
// Pergunta os IPs, testa a conexão de cada um (sem imprimir) e grava no arquivo .env,
// mantendo o resto do arquivo (inclusive a chave do Supabase) como estava.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { parsePrinterAddress } from './config.js';
import { probe } from './transport.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, '.env');
const EXAMPLE_FILE = path.join(ROOT, '.env.example');

export const PRINTER_FIELDS = [
  { key: 'PRINTER_GRILL', label: 'Churrasqueira (espetos)', required: true },
  { key: 'PRINTER_KITCHEN', label: 'Cozinha (porções e acompanhamentos)', required: true },
  { key: 'PRINTER_BAR', label: 'Bar (bebidas) — vazio = imprime na cozinha', required: false },
  { key: 'PRINTER_CASHIER', label: 'Caixa / expedição do delivery — vazio = imprime na cozinha', required: false },
];

/** Lê "CHAVE=valor" do texto do .env (ignora comentários). */
export function readEnvValue(text, key) {
  const match = text.replace(/^﻿/, '').match(new RegExp(`^${key}=(.*?)\\r?$`, 'm'));
  return match ? match[1].trim() : undefined;
}

/** Troca o valor das chaves informadas; as que não existem são acrescentadas no fim. */
export function upsertEnv(text, updates) {
  let result = text;
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*?(?=\\r?$)`, 'm');
    result = pattern.test(result) ? result.replace(pattern, line) : `${result.replace(/\s*$/, '')}\n${line}\n`;
  }
  return result;
}

/** Aceita "192.168.0.50" ou "192.168.0.50:9100"; devolve sempre com a porta. */
export function normalizeAddress(input) {
  const parsed = parsePrinterAddress(input);
  if (!parsed) return '';
  const parts = parsed.host.split('.');
  const isIp = parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
  if (!isIp) throw new Error(`"${parsed.host}" não parece um IP (exemplo: 192.168.0.50).`);
  if (parsed.host.endsWith('.0') || parsed.host.endsWith('.255')) throw new Error(`"${parsed.host}" não é um IP de impressora válido.`);
  return parsed.label;
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  // Lê linha a linha (não perde respostas digitadas ou coladas de uma vez)
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (question) => {
    process.stdout.write(question);
    const { value, done } = await lines.next();
    if (done) throw new Error('Configuração interrompida antes do fim. Nada foi salvo.');
    return String(value).trim();
  };

  console.log('\n=== Configuração das impressoras — Ponto / Sabor da Carne ===\n');
  console.log('Dica: para descobrir o IP, desligue a impressora, segure o botão FEED e ligue.');
  console.log('Ela imprime uma folha de configuração com o "IP Address".\n');
  console.log('Em cada pergunta: digite o IP, aperte Enter para manter o atual, ou "-" para deixar vazio.\n');

  // Remove a marca invisível (BOM) que o Bloco de Notas às vezes coloca no início
  let text = (fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : fs.readFileSync(EXAMPLE_FILE, 'utf8')).replace(/^﻿/, '');
  const updates = {};

  if (!readEnvValue(text, 'SUPABASE_SERVICE_ROLE_KEY') && !readEnvValue(text, 'PRINTER_PASSWORD')) {
    console.log('Acesso ao Supabase ainda não cadastrado (usuário restrito da impressora).');
    console.log('Chave pública em: Supabase → Project Settings → API Keys → anon (public).');
    const anon = await ask('Chave anon (ou só Enter para pular): ');
    if (anon) {
      updates.SUPABASE_ANON_KEY = anon;
      updates.PRINTER_EMAIL = await ask('E-mail do usuário da impressora: ');
      updates.PRINTER_PASSWORD = await ask('Senha do usuário da impressora: ');
    }
    console.log('');
  }

  for (const field of PRINTER_FIELDS) {
    let current = readEnvValue(text, field.key) || '';
    if (current.startsWith('192.168.0.0')) current = ''; // valor de exemplo
    for (;;) {
      const answer = await ask(`${field.label}\n  IP atual: ${current || '(vazio)'}\n  Novo IP: `);
      const value = answer === '' ? current : answer === '-' ? '' : answer;
      if (!value) {
        if (field.required) console.log('  Atenção: sem IP, os cupons deste setor não serão impressos.');
        updates[field.key] = '';
        break;
      }
      try {
        const address = normalizeAddress(value);
        const parsed = parsePrinterAddress(address);
        process.stdout.write(`  Testando ${address}... `);
        const result = await probe(parsed);
        console.log(result.ok ? `conectou (${result.ms} ms)` : `NÃO conectou (${result.error})`);
        if (!result.ok) {
          const keep = await ask('  Salvar mesmo assim? (s/N): ');
          if (!/^s/i.test(keep)) continue;
        }
        updates[field.key] = address;
        break;
      } catch (err) {
        console.log(`  ${err.message} Tente de novo.`);
      }
    }
    console.log('');
  }

  const paper = await ask('Largura do papel: 1 = 80mm (padrão), 2 = 58mm: ');
  updates.PAPER_COLUMNS = paper === '2' ? '32' : '48';

  const currentMode = readEnvValue(text, 'PRINT_MODE') || 'simulate';
  console.log(`\nModo atual: ${currentMode === 'live' ? 'IMPRIMIR DE VERDADE' : 'SIMULAÇÃO (grava arquivos, não imprime)'}`);
  const live = await ask('Imprimir de verdade nas impressoras? (s/N): ');
  updates.PRINT_MODE = /^s/i.test(live) ? 'live' : 'simulate';

  text = upsertEnv(text, updates);
  fs.writeFileSync(ENV_FILE, text, 'utf8');
  rl.close();

  console.log('\nConfiguração salva.\n');
  for (const field of PRINTER_FIELDS) console.log(`  ${field.label.split(' —')[0].padEnd(36)} ${readEnvValue(text, field.key) || '(vazio)'}`);
  console.log(`  Modo: ${updates.PRINT_MODE === 'live' ? 'imprimir de verdade' : 'simulação'}\n`);
  console.log('Próximos passos:');
  console.log('  2-IMPRIMIR-TESTE.bat    -> imprime um cupom de teste em cada impressora');
  console.log('  3-INICIAR-IMPRESSAO.bat -> deixa a impressão automática funcionando (não feche a janela)\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error('Erro:', err.message);
    process.exit(1);
  });
}
