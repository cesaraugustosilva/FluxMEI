import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const checkoutHtml = readFileSync(new URL('../frontend/checkout/index.html', import.meta.url), 'utf8');
const checkoutJs = readFileSync(new URL('../frontend/checkout/checkout.js', import.meta.url), 'utf8');

test('checkout principal usa Mercado Pago sem selecao visual de provider', () => {
  assert.match(checkoutHtml, /Pagamento seguro processado pelo Mercado Pago\./);
  assert.match(checkoutHtml, /id="paymentBrick_container"/);
  assert.doesNotMatch(checkoutHtml, /name="paymentProvider"/);
  assert.doesNotMatch(checkoutHtml, /name="asaasMethod"/);
  assert.doesNotMatch(checkoutHtml, /Gerar pagamento Asaas/);
});

test('checkout principal chama apenas endpoints Mercado Pago para pagamento', () => {
  assert.match(checkoutJs, /\/pagamentos\/mercado-pago\/public-config/);
  assert.match(checkoutJs, /\/pagamentos\/mercado-pago\/processar-brick/);
  assert.match(checkoutJs, /\/pagamentos\/mercado-pago\/status\/\$\{encodeURIComponent\(paymentId\)\}/);
  assert.doesNotMatch(checkoutJs, /\/pagamentos\/asaas/);
  assert.doesNotMatch(checkoutJs, /createAsaasCharge/);
});
