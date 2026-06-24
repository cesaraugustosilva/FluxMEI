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

test('rotas Asaas de pagamento estao registradas no app Express', async () => {
  await withTestServer(async (baseUrl) => {
    for (const path of ['/api/pagamentos/asaas/criar-pix', '/api/pagamentos/asaas/criar-boleto', '/api/pagamentos/asaas/criar-cartao']) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plano: 'pro_mensal' })
      });

      assert.equal(response.status, 401);
      const payload = await response.json();
      assert.equal(typeof payload, 'object');
      assert.notEqual(payload, null);
    }
  });
});

test('rota de historico de pagamentos exige autenticacao no Express', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/pagamentos/historico`);

    assert.equal(response.status, 401);
    const payload = await response.json();
    assert.equal(typeof payload, 'object');
    assert.notEqual(payload, null);
  });
});

test('rota de recibo de pagamento exige autenticacao no Express', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/pagamentos/pay-1/recibo`);

    assert.equal(response.status, 401);
    const payload = await response.json();
    assert.equal(typeof payload, 'object');
    assert.notEqual(payload, null);
  });
});

test('rotas de gerenciamento de assinatura exigem autenticacao no Express', async () => {
  await withTestServer(async (baseUrl) => {
    for (const path of ['/api/assinaturas/cancelar', '/api/assinaturas/reativar']) {
      const response = await fetch(`${baseUrl}${path}`, { method: 'POST' });

      assert.equal(response.status, 401);
      const payload = await response.json();
      assert.equal(typeof payload, 'object');
      assert.notEqual(payload, null);
    }
  });
});

test('rotas administrativas exigem autenticacao no Express', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/dashboard`);

    assert.equal(response.status, 401);
    const payload = await response.json();
    assert.equal(typeof payload, 'object');
    assert.notEqual(payload, null);
  });
});
