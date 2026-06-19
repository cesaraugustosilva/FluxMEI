import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';

const checkoutHtml = readFileSync(new URL('../frontend/checkout/index.html', import.meta.url), 'utf8');
const checkoutJs = readFileSync(new URL('../frontend/checkout/checkout.js', import.meta.url), 'utf8');
const pagamentoRoutesSource = readFileSync(new URL('../backend/src/routes/pagamentoRoutes.js', import.meta.url), 'utf8');

test('checkout principal usa Pix proprio e Mercado Pago para cartao/boleto', () => {
  assert.match(checkoutHtml, /Pagamento seguro processado pelo Mercado Pago\./);
  assert.match(checkoutHtml, /Pix gerado pelo FluxMEI com Mercado Pago/);
  assert.match(checkoutHtml, /data-payment-method="pix"/);
  assert.match(checkoutHtml, /id="generatePixButton"/);
  assert.match(checkoutHtml, /Gerar Pix/);
  assert.match(checkoutHtml, /id="pixPanel"/);
  assert.match(checkoutHtml, /id="pixCode"/);
  assert.match(checkoutHtml, /id="paymentBrick_container"/);
  assert.doesNotMatch(checkoutHtml, /name="paymentProvider"/);
  assert.doesNotMatch(checkoutHtml, /name="asaasMethod"/);
  assert.doesNotMatch(checkoutHtml, /Gerar pagamento Asaas/);
});

test('checkout principal chama Pix dedicado e Brick sem Asaas', () => {
  assert.match(checkoutJs, /\/pagamentos\/mercado-pago\/public-config/);
  assert.match(checkoutJs, /\/pagamentos\/mercado-pago\/criar-pix/);
  assert.match(checkoutJs, /\/pagamentos\/mercado-pago\/processar-brick/);
  assert.match(checkoutJs, /\/pagamentos\/mercado-pago\/status\/\$\{encodeURIComponent\(paymentId\)\}/);
  assert.match(checkoutJs, /bankTransfer: 'none'/);
  assert.match(checkoutJs, /generatePixPayment/);
  assert.match(checkoutJs, /copyPixButton/);
  assert.doesNotMatch(checkoutJs, /\/pagamentos\/mercado-pago\/criar-checkout/);
  assert.doesNotMatch(checkoutJs, /\/pagamentos\/asaas/);
  assert.doesNotMatch(checkoutJs, /createAsaasCharge/);
});

test('checkout nao rearma intent antiga sem query de assinatura', () => {
  assert.match(checkoutJs, /const INTENT_CREATED_AT_KEY = 'fluxmei_intent_created_at'/);
  assert.match(checkoutJs, /function isSubscribeIntentUrl\(\)/);
  assert.match(checkoutJs, /return params\.get\('intent'\) === SUBSCRIBE_INTENT/);
  assert.match(checkoutJs, /if \(isSubscribeIntentUrl\(\)\) saveSubscribeIntent\(planId\)/);
});

test('checkout com assinatura ativa limpa intent de assinatura', () => {
  assert.match(checkoutJs, /if \(subscriptionStatus\?\.estado === 'ativo'\) \{\s*clearSubscribeIntent\(\);/);
  assert.match(checkoutJs, /showStatus\('active', 'Sua assinatura ja esta ativa\. Voce pode voltar ao app\.'\)/);
});

test('Checkout Pro legado retorna 410 e nao passa por criacao de pagamento', async () => {
  process.env.NODE_ENV = 'production';
  process.env.ENABLE_ASAAS = 'false';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

  assert.match(
    pagamentoRoutesSource,
    /router\.post\('\/mercado-pago\/criar-checkout', asyncHandler\(checkoutMercadoPagoLegadoDesativado\)\)/
  );
  assert.doesNotMatch(
    pagamentoRoutesSource,
    /router\.post\('\/mercado-pago\/criar-checkout', paymentRateLimiter, authMiddleware/
  );

  const { default: pagamentoRoutes } = await import('../backend/src/routes/pagamentoRoutes.js?checkout-pro-disabled');
  const app = express();
  app.use(express.json());
  app.use('/api/pagamentos', pagamentoRoutes);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/pagamentos/mercado-pago/criar-checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plano: 'pro_mensal' })
    });
    const body = await response.json();

    assert.equal(response.status, 410);
    assert.deepEqual(body, {
      success: false,
      message: 'Fluxo legado desativado. Utilize o checkout atual.'
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
