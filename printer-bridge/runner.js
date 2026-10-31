import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkForUpdates } from './updater.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // Checa a cada 30 minutos

const log = (...args) => console.log(new Date().toLocaleTimeString('pt-BR'), '[runner]', ...args);

let currentChild = null;
let shouldRestart = true;

function startWorker() {
  const scriptPath = path.join(__dirname, 'src', 'index.js');
  log('Iniciando printer-bridge...');

  currentChild = spawn(process.execPath, [scriptPath], {
    stdio: 'inherit',
    cwd: __dirname,
  });

  currentChild.on('exit', (code, signal) => {
    log(`Processo finalizado (código: ${code}, sinal: ${signal}).`);
    currentChild = null;
    if (shouldRestart) {
      log('Reiniciando serviço em 5 segundos...');
      setTimeout(startWorker, 5000);
    }
  });

  currentChild.on('error', (err) => {
    log('Erro ao iniciar processo:', err.message);
  });
}

async function main() {
  log('====================================================');
  log('Supervisor do Printer Bridge (com Auto-Update GitHub)');
  log('====================================================');

  // 1. Checagem inicial de atualização antes de subir
  await checkForUpdates().catch((err) => log('Aviso na checagem inicial:', err.message));

  // 2. Inicia o worker
  startWorker();

  // 3. Checagem periódica em segundo plano
  setInterval(async () => {
    try {
      const updated = await checkForUpdates();
      if (updated && currentChild) {
        log('Nova versão aplicada. Reiniciando printer-bridge para carregar alterações...');
        currentChild.kill('SIGTERM');
      }
    } catch (err) {
      log('Falha na checagem periódica:', err.message);
    }
  }, CHECK_INTERVAL_MS);

  // Tratamento de encerramento limpo
  process.on('SIGINT', () => {
    shouldRestart = false;
    if (currentChild) currentChild.kill('SIGINT');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    shouldRestart = false;
    if (currentChild) currentChild.kill('SIGTERM');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[runner] Erro fatal:', err);
  process.exit(1);
});
