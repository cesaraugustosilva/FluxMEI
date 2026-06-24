import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appHtml = readFileSync(new URL('../frontend/app/index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../frontend/app/app.js', import.meta.url), 'utf8');
const checkoutJs = readFileSync(new URL('../frontend/checkout/checkout.js', import.meta.url), 'utf8');
const assinaturaRules = readFileSync(new URL('../backend/src/services/assinaturaRules.js', import.meta.url), 'utf8');

test('Minha Conta mostra plano atual, valor, vencimento e card de troca', () => {
  assert.match(appHtml, /id="accountCurrentPlan"/);
  assert.match(appHtml, /id="accountCurrentValue"/);
  assert.match(appHtml, /id="accountNextDueDate"/);
  assert.match(appHtml, /id="accountStatusBadge"/);
  assert.match(appHtml, /id="accountSwitchCard"/);
  assert.match(appHtml, /id="accountPlanSwitchAction"/);
});

test('Minha Conta configura troca mensal para anual e anual para mensal', () => {
  assert.match(appJs, /currentPlanId === 'pro_mensal'[\s\S]*return 'pro_anual'/);
  assert.match(appJs, /currentPlanId === 'pro_anual'[\s\S]*return 'pro_mensal'/);
  assert.match(appJs, /Trocar para \$\{getPlanShortLabel\(switchTargetPlan\.id\)\}/);
  assert.match(appJs, /Economize no anual: R\$ 478,80 por ano, equivalente a R\$ 39,90 por mes\./);
  assert.match(appJs, /A troca para mensal sera aplicada no proximo vencimento ou apos um novo pagamento aprovado\./);
});

test('Clique de troca confirma e envia para checkout com plano correto', () => {
  assert.match(appJs, /Voce sera levado ao checkout para pagar o novo plano\. A troca sera confirmada apos o pagamento\./);
  assert.match(appJs, /window\.location\.href = getCheckoutUrlForPlan\(targetPlan\.id\)/);
  assert.match(appJs, /return `\/checkout\/\?plan=\$\{encodeURIComponent\(planId\)\}`/);
  assert.match(appJs, /accountPlanSwitchAction'\)\?\.addEventListener\('click'/);
});

test('Minha Conta mostra aviso de pagamento pendente para troca de plano', () => {
  assert.match(appHtml, /id="accountPendingWarning"/);
  assert.match(appJs, /pending_payment_plan/);
  assert.match(appJs, /Ha um pagamento pendente para/);
  assert.match(assinaturaRules, /pending_payment_plan: pendingPaymentPlan/);
});

test('Checkout respeita parametro plan e permite troca com assinatura ativa', () => {
  assert.match(checkoutJs, /function getSelectedPlanId\(\)/);
  assert.match(checkoutJs, /params\.get\('plan'\)/);
  assert.match(checkoutJs, /function isPlanSwitchCheckout/);
  assert.match(checkoutJs, /subscriptionStatus\?\.estado === 'ativo' && !isPlanSwitchCheckout\(subscriptionStatus, selectedPlan\.id\)/);
});
