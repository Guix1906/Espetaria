import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';

// Uma fila por impressora: nunca abrimos duas conexões simultâneas para o mesmo IP.
const printerLocks = new Map();

function withLock(key, task) {
  const previous = printerLocks.get(key) || Promise.resolve();
  const run = previous.catch(() => {}).then(task);
  printerLocks.set(key, run.catch(() => {}));
  return run;
}

/**
 * Envia bytes RAW (ESC/POS) para a impressora na porta 9100.
 * A conexão é aberta, os dados enviados e o socket FECHADO imediatamente —
 * assim a impressora fica livre para o outro sistema da loja em milissegundos.
 */
export function sendRaw({ host, port }, buffer, timeoutMs = 5000) {
  return withLock(`${host}:${port}`, () => new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };

    socket.setTimeout(timeoutMs);
    socket.once('timeout', () => finish(new Error(`Tempo esgotado ao falar com ${host}:${port} (impressora ocupada ou desligada).`)));
    socket.once('error', (err) => {
      const hint = err.code === 'ECONNREFUSED' ? ' (porta recusada — impressora ocupada por outro sistema ou porta errada)'
        : err.code === 'EHOSTUNREACH' || err.code === 'ENETUNREACH' ? ' (IP inalcançável — verifique a rede)'
        : '';
      finish(new Error(`${err.code || 'ERRO'} em ${host}:${port}${hint}`));
    });
    socket.connect(port, host, () => {
      socket.end(buffer, () => finish());
    });
  }));
}

/** Apenas testa se a porta da impressora aceita conexão. NÃO imprime nada. */
export function probe({ host, port }, timeoutMs = 3000) {
  return withLock(`${host}:${port}`, () => new Promise((resolve) => {
    const started = Date.now();
    const socket = net.connect({ host, port });
    const done = (ok, error) => { socket.destroy(); resolve({ ok, ms: Date.now() - started, error }); };
    socket.setTimeout(timeoutMs, () => done(false, 'timeout'));
    socket.once('connect', () => done(true));
    socket.once('error', (err) => done(false, err.code || err.message));
  }));
}

/** Modo simulação: grava o cupom em arquivo .txt (e o .bin ESC/POS) em vez de imprimir. */
export async function writeSimulated(outputDir, target, job, receipt) {
  await fs.mkdir(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.join(outputDir, `${stamp}_${target}_${job.kind}_${job.order_number}`);
  await fs.writeFile(`${base}.txt`, receipt.toText(), 'utf8');
  await fs.writeFile(`${base}.bin`, receipt.toBuffer());
  return `${base}.txt`;
}
