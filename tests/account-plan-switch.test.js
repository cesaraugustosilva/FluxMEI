import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appHtml = readFileSync(new URL('../frontend/app/index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../frontend/app/app.js', import.meta.url), 'utf8');
const checkoutJs = readFileSync(new URL('../frontend/checkout/checkout.js', import.meta.url), 'utf8');
const assinaturaRules = readFileSync(new URL('../backend/src/services/assinaturaRules.js', import.meta.url), 'utf8');

test('Minha Conta antiga mostra plano atual, valor, vencimento e troca de plano', () => {
  assert.match(appHtml, /id="accountModal"/);
  assert.match(appHtml, /id="accountCurrentPlan"/);
  assert.match(appHtml, /id="accountCurrentPlanLegacy"/);
  assert.match(appHtml, /id="accountCurrentValue"/);
  assert.match(appHtml, /id="accountNextDueDate"/);
  assert.match(appHtml, /id="accountStatusBadge"/);
  assert.match(appHtml, /id="accountSwitchCard"/);
  assert.match(appHtml, /id="accountPlanSwitchAction"/);
});

test('Minha Conta preserva resumo de assinatura e acoes principais', () => {
  assert.match(appHtml, /Minha assinatura/);
  assert.match(appHtml, /id="accountDaysRemaining"/);
  assert.match(appHtml, /id="accountLastPaymentMethod"/);
  assert.match(appHtml, /id="accountLastPaymentDate"/);
  assert.match(appHtml, /id="accountQuickHistory"/);
  assert.match(appHtml, /id="accountCancelAction"/);
  assert.match(appHtml, /id="accountReactivateAction"/);
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

test('Minha Conta renderiza historico de pagamentos', () => {
  assert.match(appHtml, /id="accountPaymentHistorySection"/);
  assert.match(appHtml, /id="accountPaymentHistory"/);
  assert.match(appJs, /apiRequest\('\/pagamentos\/historico'\)/);
  assert.match(appJs, /function renderPaymentHistory\(\)/);
  assert.match(appJs, /Nenhum pagamento encontrado ainda\./);
  assert.match(appJs, /Nao foi possivel carregar o historico de pagamentos agora\./);
  assert.match(appJs, /data-receipt-id/);
  assert.match(appJs, /Ver recibo/);
});

test('Minha Conta preserva exportacao e programa de indicacao', () => {
  assert.match(appHtml, /account-export-card/);
  assert.match(appHtml, /id="exportCsvAction"/);
  assert.match(appHtml, /id="exportJsonAction"/);
  assert.match(appHtml, /id="exportSummaryAction"/);
  assert.match(appHtml, /id="accountReferralCard"/);
  assert.match(appHtml, /id="accountReferralCode"/);
  assert.match(appHtml, /id="accountReferralLink"/);
  assert.match(appHtml, /id="accountReferralCopy"/);
});

test('Historico continua visivel apos cancelamento agendado', () => {
  assert.match(appHtml, /id="accountPaymentHistorySection"/);
  assert.match(appJs, /renderPaymentHistory\(\)/);
  assert.match(appJs, /cancel_at_period_end/);
  assert.doesNotMatch(appJs, /state\.paymentHistory\s*=\s*\[\][\s\S]{0,120}cancelSubscription/);
});

test('Historico de pagamentos nao renderiza provider_raw ou documentos sensiveis', () => {
  const historyRenderer = appJs.match(/function renderPaymentHistory\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(historyRenderer, /provider_raw/);
  assert.doesNotMatch(historyRenderer, /cpfCnpj|cpf_cnpj|documento|cpf|cnpj/i);
});

test('Checkout respeita parametro plan e permite troca com assinatura ativa', () => {
  assert.match(checkoutJs, /function getSelectedPlanId\(\)/);
  assert.match(checkoutJs, /params\.get\('plan'\)/);
  assert.match(checkoutJs, /function isPlanSwitchCheckout/);
  assert.match(checkoutJs, /subscriptionStatus\?\.estado === 'ativo' && !isPlanSwitchCheckout\(subscriptionStatus, selectedPlan\.id\)/);
});
