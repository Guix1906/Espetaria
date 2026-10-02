import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { PrintWorker } from './worker.js';

/** Servidor HTTP local só de leitura (status para conferência na loja). */
export function createStatusServer(worker, config) {
  return http.createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/status')) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: true,
        mode: config.mode,
        worker: config.workerName,
        printers: Object.fromEntries(Object.entries(config.printers).map(([k, v]) => [k, v?.label ?? null])),
        stats: worker?.stats ?? null,
      }, null, 2));
      return;
    }
    res.writeHead(404).end();
  });
}

async function main() {
  const config = loadConfig();
  const worker = new PrintWorker(config);
  await worker.start();

  // Status apenas na própria máquina (127.0.0.1)
  createStatusServer(worker, config).listen(config.port, '127.0.0.1', () => {
    console.log(`[bridge] Status em http://127.0.0.1:${config.port}/status`);
  });

  const shutdown = async () => {
    console.log('[bridge] Encerrando...');
    await worker.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error('[bridge] Falha ao iniciar:', err.message);
    process.exit(1);
  });
}
