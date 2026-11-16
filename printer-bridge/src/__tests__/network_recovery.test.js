import { describe, it, expect } from 'vitest';
import { fetchWithTimeout, retryRpc } from '../worker.js';

describe('queda de internet', () => {
  it('consulta pendurada desiste no tempo limite', async () => {
    const hanging = (_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
    await expect(fetchWithTimeout(50, hanging)('x')).rejects.toThrow(/Sem resposta/);
  });

  it('insiste até o banco voltar', async () => {
    let calls = 0;
    const ok = await retryRpc(async () => {
      calls++;
      if (calls < 3) throw new Error('fetch failed');
      return { error: null };
    }, { sleep: async () => {} });
    expect(ok).toBe(true);
    expect(calls).toBe(3);
  });

  it('desiste depois do limite de tentativas', async () => {
    const ok = await retryRpc(async () => ({ error: { message: 'offline' } }), { tries: 3, sleep: async () => {} });
    expect(ok).toBe(false);
  });
});
