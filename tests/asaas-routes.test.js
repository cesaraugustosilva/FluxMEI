import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

process.env.NODE_ENV = 'production';
process.env.ENABLE_ASAAS = 'false';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

function routeSummary(router) {
  return router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).sort()
    }));
}

test('Asaas desativado nao registra rotas publicas de pagamento', async () => {
  const { default: pagamentoRoutes } = await import('../backend/src/routes/pagamentoRoutes.js?asaas-disabled');
  const routes = routeSummary(pagamentoRoutes);
  const paths = routes.map((route) => route.path);

  assert.ok(paths.includes('/mercado-pago/public-config'));
  assert.ok(paths.includes('/mercado-pago/criar-pix'));
  assert.ok(paths.includes('/mercado-pago/processar-brick'));
  assert.ok(paths.includes('/mercado-pago/status/:paymentId'));
  assert.ok(!paths.includes('/asaas/criar-cobranca'));
  assert.ok(!paths.includes('/asaas/status/:paymentId'));
});

test('webhook Asaas desativado retorna 410 sem afetar Mercado Pago', async () => {
  const { default: webhookRoutes } = await import('../backend/src/routes/webhookRoutes.js?asaas-disabled');
  const routes = routeSummary(webhookRoutes);
  const paths = routes.map((route) => route.path);

  assert.ok(paths.includes('/mercado-pago'));
  assert.ok(paths.includes('/asaas'));

  const app = express();
  app.use(express.json());
  app.use('/api/webhooks', webhookRoutes);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/webhooks/asaas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: 'PAYMENT_RECEIVED' })
    });
    const body = await response.json();

    assert.equal(response.status, 410);
    assert.equal(body.code, 'ASAAS_DISABLED');
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
