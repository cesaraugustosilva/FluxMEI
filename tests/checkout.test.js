import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const checkoutHtml = readFileSync(new URL('../frontend/checkout/index.html', import.meta.url), 'utf8');
const checkoutJs = readFileSync(new URL('../frontend/checkout/checkout.js', import.meta.url), 'utf8');

test('checkout principal usa somente Mercado Pago sem provider ou Pix proprio', () => {
  assert.match(checkoutHtml, /Pagamento seguro processado pelo Mercado Pago\./);
  assert.match(checkoutHtml, /Pagamento processado com segurança pelo Mercado Pago\./);
  assert.match(checkoutHtml, /id="paymentBrick_container"/);
  assert.doesNotMatch(checkoutHtml, /data-payment-method=/);
  assert.doesNotMatch(checkoutHtml, /id="generatePixButton"/);
  assert.doesNotMatch(checkoutHtml, /Gerar Pix/);
  assert.doesNotMatch(checkoutHtml, /id="pixPanel"/);
  assert.doesNotMatch(checkoutHtml, /id="pixCode"/);
  assert.doesNotMatch(checkoutHtml, /name="paymentProvider"/);
  assert.doesNotMatch(checkoutHtml, /name="asaasMethod"/);
  assert.doesNotMatch(checkoutHtml, /Gerar pagamento Asaas/);
});

test('checkout principal chama apenas fluxo Mercado Pago Payment Brick', () => {
  assert.match(checkoutJs, /\/pagamentos\/mercado-pago\/public-config/);
  assert.match(checkoutJs, /\/pagamentos\/mercado-pago\/processar-brick/);
  assert.match(checkoutJs, /bankTransfer: 'all'/);
  assert.doesNotMatch(checkoutJs, /\/pagamentos\/mercado-pago\/criar-pix/);
  assert.doesNotMatch(checkoutJs, /\/pagamentos\/asaas/);
  assert.doesNotMatch(checkoutJs, /generatePixPayment/);
  assert.doesNotMatch(checkoutJs, /copyPixButton/);
  assert.doesNotMatch(checkoutJs, /createAsaasCharge/);
});
