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
