import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const authJs = readFileSync(new URL('../frontend/auth/shared/auth.js', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../frontend/app/app.js', import.meta.url), 'utf8');
const checkoutJs = readFileSync(new URL('../frontend/checkout/checkout.js', import.meta.url), 'utf8');
const landingJs = readFileSync(new URL('../frontend/landing-page/script.js', import.meta.url), 'utf8');

test('login salva token em sessionStorage por padrao e em localStorage com lembrar de mim', () => {
  assert.match(authJs, /function saveSession\(authData, remember = false\)/);
  assert.match(authJs, /const targetStorage = remember \? localStorage : sessionStorage/);
  assert.match(authJs, /saveSession\(data, Boolean\(payload\.remember\)\)/);
});

test('logout e sessao expirada limpam token dos dois storages', () => {
  assert.match(authJs, /localStorage\.removeItem\(TOKEN_KEY\)/);
  assert.match(authJs, /sessionStorage\.removeItem\(TOKEN_KEY\)/);
  assert.match(appJs, /function clearAuthStorage\(\)/);
  assert.match(appJs, /sessionStorage\.removeItem\(TOKEN_KEY\)/);
  assert.match(checkoutJs, /function clearAuthStorage\(\)/);
  assert.match(checkoutJs, /sessionStorage\.removeItem\(TOKEN_KEY\)/);
});

test('logout do app chama backend com token Bearer', () => {
  assert.match(appJs, /function getAuthToken\(\)/);
  assert.match(appJs, /async function notifyBackendLogout\(token\)/);
  assert.match(appJs, /fetch\(`\$\{apiUrl\}\/auth\/logout`, \{/);
  assert.match(appJs, /method: 'POST'/);
  assert.match(appJs, /Authorization: `Bearer \$\{token\}`/);
});

test('logout do app limpa storages mesmo se backend falhar', () => {
  assert.match(appJs, /async function logoutUser\(\)/);
  assert.match(appJs, /await notifyBackendLogout\(token\)/);
  assert.match(appJs, /finally \{\s*clearAuthStorage\(\);\s*redirectToLogin\(\);/);
});

test('logout do app sem token nao chama backend e nao quebra', () => {
  assert.match(appJs, /if \(!token\) return;/);
  assert.match(appJs, /const token = getAuthToken\(\);/);
});

test('painel checkout e landing leem token dos dois storages', () => {
  assert.match(appJs, /return sessionStorage\.getItem\(TOKEN_KEY\) \|\| localStorage\.getItem\(TOKEN_KEY\)/);
  assert.match(checkoutJs, /return sessionStorage\.getItem\(TOKEN_KEY\) \|\| localStorage\.getItem\(TOKEN_KEY\)/);
  assert.match(landingJs, /return sessionStorage\.getItem\(TOKEN_KEY\) \|\| localStorage\.getItem\(TOKEN_KEY\)/);
});

test('intent de assinatura usa timestamp e expira em 15 minutos', () => {
  assert.match(authJs, /const INTENT_CREATED_AT_KEY = 'fluxmei_intent_created_at'/);
  assert.match(authJs, /const SUBSCRIBE_INTENT_TTL_MS = 15 \* 60 \* 1000/);
  assert.match(authJs, /function saveSubscribeIntent\(plan = DEFAULT_SUBSCRIBE_PLAN\)/);
  assert.match(authJs, /localStorage\.setItem\(INTENT_CREATED_AT_KEY, String\(Date\.now\(\)\)\)/);
  assert.match(authJs, /function hasValidSubscribeIntent\(\)/);
  assert.match(authJs, /Date\.now\(\) - intent\.createdAt > SUBSCRIBE_INTENT_TTL_MS/);
});

test('login normal sem intent na URL limpa intent antiga e vai para app', () => {
  assert.match(authJs, /if \(query\.get\('intent'\) !== SUBSCRIBE_INTENT\) \{\s*clearSubscribeIntent\(\);\s*return;\s*\}/);
  assert.match(authJs, /function redirectAfterAuth\(defaultUrl\) \{\s*if \(!hasValidSubscribeIntent\(\)\) \{\s*window\.location\.href = getSafeRedirectUrl\(\) \|\| defaultUrl;/);
  assert.match(authJs, /redirectAfterAuth\('\.\.\/\.\.\/app\/index\.html'\)/);
});

test('login com intent recente vai para checkout e consome intent', () => {
  assert.match(authJs, /function getPaymentIntentUrl\(\)/);
  assert.match(authJs, /url\.searchParams\.set\('intent', SUBSCRIBE_INTENT\)/);
  assert.match(authJs, /const paymentUrl = getPaymentIntentUrl\(\);\s*clearSubscribeIntent\(\);\s*window\.location\.href = paymentUrl;/);
});

test('login respeita redirect interno seguro quando nao ha intent de assinatura', () => {
  assert.match(authJs, /function getSafeRedirectUrl\(\)/);
  assert.match(authJs, /const redirect = query\.get\('redirect'\)/);
  assert.match(authJs, /const cleanRedirect = redirect\.trim\(\)/);
  assert.match(authJs, /!cleanRedirect\.startsWith\('\/'\)/);
  assert.match(authJs, /if \(url\.origin !== window\.location\.origin\) return null/);
  assert.match(authJs, /window\.location\.href = getSafeRedirectUrl\(\) \|\| defaultUrl/);
});

test('login com redirect para admin volta para o painel admin', () => {
  assert.match(authJs, /const url = new URL\(cleanRedirect, window\.location\.origin\)/);
  assert.match(authJs, /return url\.href/);
  assert.match(authJs, /redirectAfterAuth\('\.\.\/\.\.\/app\/index\.html'\)/);
});

test('login rejeita redirect externo ou ambiguo', () => {
  assert.match(authJs, /cleanRedirect\.startsWith\('\/\/'\)/);
  assert.match(authJs, /cleanRedirect\.includes\('\\\\'\)/);
  assert.match(authJs, /if \(url\.origin !== window\.location\.origin\) return null/);
});

test('fluxo de teste gratis remove intent com timestamp', () => {
  assert.match(landingJs, /localStorage\.removeItem\(INTENT_KEY\)/);
  assert.match(landingJs, /localStorage\.removeItem\(PLAN_KEY\)/);
  assert.match(landingJs, /localStorage\.removeItem\(INTENT_CREATED_AT_KEY\)/);
});
