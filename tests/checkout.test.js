import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const checkoutHtml = readFileSync(new URL('../frontend/checkout/index.html', import.meta.url), 'utf8');
const checkoutJs = readFileSync(new URL('../frontend/checkout/checkout.js', import.meta.url), 'utf8');

test('checkout principal usa Pix proprio e Mercado Pago para cartao/boleto', () => {
  assert.match(checkoutHtml, /Pagamento seguro processado pelo Mercado Pago\./);
  assert.match(checkoutHtml, /data-payment-method="pix"/);
  assert.match(checkoutHtml, /id="generatePixButton"/);
  assert.match(checkoutHtml, /Gerar Pix/);
  assert.match(checkoutHtml, /id="paymentBrick_container"/);
  assert.doesNotMatch(checkoutHtml, /name="paymentProvider"/);
  assert.doesNotMatch(checkoutHtml, /name="asaasMethod"/);
  assert.doesNotMatch(checkoutHtml, /Gerar pagamento Asaas/);
});

test('checkout principal chama endpoints Mercado Pago para Pix proprio e Brick', () => {
  assert.match(checkoutJs, /\/pagamentos\/mercado-pago\/public-config/);
  assert.match(checkoutJs, /\/pagamentos\/mercado-pago\/criar-pix/);
  assert.match(checkoutJs, /\/pagamentos\/mercado-pago\/processar-brick/);
  assert.match(checkoutJs, /\/pagamentos\/mercado-pago\/status\/\$\{encodeURIComponent\(paymentId\)\}/);
  assert.match(checkoutJs, /bankTransfer: 'none'/);
  assert.doesNotMatch(checkoutJs, /\/pagamentos\/asaas/);
  assert.doesNotMatch(checkoutJs, /createAsaasCharge/);
});
