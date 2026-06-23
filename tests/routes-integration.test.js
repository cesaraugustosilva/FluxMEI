import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../backend/src/server.js';

async function withTestServer(fn) {
  const server = app.listen(0, '127.0.0.1');

  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    const { port } = server.address();
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

test('POST /api/pagamentos/asaas/criar-pix esta registrado no app Express', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/pagamentos/asaas/criar-pix`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plano: 'pro_mensal' })
    });

    assert.equal(response.status, 401);
    const payload = await response.json();
    assert.equal(typeof payload, 'object');
    assert.notEqual(payload, null);
  });
});
