// Ferramentas de diagnóstico:
//   npm run check              -> testa conexão TCP com cada impressora (NÃO imprime)
//   npm run preview            -> gera cupons de exemplo em ./impressoes-simuladas
//   npm run test-print -- GRILL -> imprime UM cupom de teste de verdade no setor
//   npm run test-print -- ALL   -> um cupom de teste em cada impressora configurada
import { loadConfig, resolvePrinter } from './config.js';
import { probe } from './transport.js';
import { printJob } from './worker.js';

const config = loadConfig();
const [command = 'check', arg] = process.argv.slice(2);

const sampleJobs = [
  {
    kind: 'ORDER', sector: 'GRILL', origin: 'SALAO', order_number: 42, table_number: 7, customer_name: 'Família Souza',
    created_at: new Date().toISOString(), payload: { waiter: 'Lucas', order_notes: 'Servir tudo junto' },
    items: [
      { name: 'Espeto de Picanha', quantity: 2, doneness: 'AO_PONTO' },
      { name: 'Espeto de Coração', quantity: 3, notes: 'Bem temperado' },
    ],
  },
  {
    kind: 'ORDER', sector: 'KITCHEN', origin: 'DELIVERY', order_number: 1005, customer_name: 'Marina Silva',
    created_at: new Date().toISOString(), payload: { neighborhood: 'Centro' },
    items: [{ name: 'Mandioca Frita', quantity: 1 }, { name: 'Farofa da Casa', quantity: 1, notes: 'Sem bacon' }],
  },
  {
    kind: 'DELIVERY_SUMMARY', sector: 'NONE', origin: 'DELIVERY', order_number: 1005, customer_name: 'Marina Silva',
    created_at: new Date().toISOString(),
    items: [
      { name: 'Espeto de Picanha', quantity: 2, unit_price: 18.9, doneness: 'AO_PONTO' },
      { name: 'Mandioca Frita', quantity: 1, unit_price: 22 },
    ],
    payload: {
      customer_name: 'Marina Silva', phone: '11977776666', address_street: 'Rua das Flores', address_number: '120',
      address_neighborhood: 'Centro', address_complement: 'Apto 32', address_reference: 'Portão azul',
      subtotal: 59.8, delivery_fee: 5, total: 64.8, payment_method: 'DINHEIRO', cash_change_for: 100,
      notes: 'Tocar o interfone', created_at: new Date().toISOString(),
    },
  },
  {
    kind: 'CANCEL', sector: 'GRILL', origin: 'SALAO', order_number: 42, table_number: 7,
    created_at: new Date().toISOString(), payload: { reason: 'Cliente desistiu' },
    items: [{ name: 'Espeto de Coração', quantity: 1 }],
  },
];

async function check() {
  console.log(`Modo atual: ${config.mode.toUpperCase()}\n`);
  for (const [target, address] of Object.entries(config.printers)) {
    if (!address) { console.log(`  ${target.padEnd(8)} (não configurada)`); continue; }
    const result = await probe(address);
    console.log(`  ${target.padEnd(8)} ${address.label.padEnd(22)} ${result.ok ? `OK (${result.ms} ms)` : `FALHOU: ${result.error}`}`);
  }
  console.log('\nRoteamento: GRILL->churrasqueira, KITCHEN->cozinha, BAR->bar (ou cozinha), delivery/expedição->caixa (ou cozinha).');
}

async function preview() {
  const simulated = { ...config, mode: 'simulate' };
  for (const job of sampleJobs) {
    const result = await printJob({ id: 'preview', is_reprint: false, ...job }, simulated);
    console.log(`  ${job.kind} [${job.sector}] -> ${result.detail}`);
  }
}

/** Um cupom de teste em cada impressora configurada (sem repetir o mesmo IP). */
async function testPrintAll() {
  const seen = new Set();
  let failures = 0;
  for (const sector of ['GRILL', 'KITCHEN', 'BAR', 'NONE']) {
    const { target, address } = resolvePrinter(config, sector);
    if (!address || seen.has(address.label)) continue;
    seen.add(address.label);
    try {
      await testPrint(sector);
    } catch (err) {
      failures += 1;
      console.error(`FALHOU ${target} ${address.label}: ${err.message}`);
    }
  }
  if (seen.size === 0) console.log('Nenhuma impressora configurada. Rode 1-CONFIGURAR-IMPRESSORAS.bat primeiro.');
  if (failures) process.exitCode = 1;
}

async function testPrint(sector) {
  const valid = ['GRILL', 'KITCHEN', 'BAR', 'NONE'];
  if (sector === 'ALL') return testPrintAll();
  if (!valid.includes(sector)) {
    console.error(`Informe o setor: ${valid.join(' | ')} | ALL  (NONE = impressora do caixa/expedição)`);
    process.exit(1);
  }
  const { target, address } = resolvePrinter(config, sector);
  console.log(`Enviando cupom de TESTE para ${target} ${address?.label ?? ''} em modo ${config.mode}...`);
  const result = await printJob({
    id: 'manual-test', kind: 'TEST', sector, origin: 'SISTEMA', order_number: 0,
    items: [], payload: { requested_by: 'Diagnóstico local' }, created_at: new Date().toISOString(),
  }, config);
  console.log(`OK -> ${result.detail}`);
}

const commands = { check, preview, 'test-print': () => testPrint((arg || '').toUpperCase()) };
if (!commands[command]) {
  console.error(`Comando desconhecido: ${command}. Use: check | preview | test-print <SETOR>`);
  process.exit(1);
}
commands[command]().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
