import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appHtml = readFileSync(new URL('../frontend/app/index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../frontend/app/app.js', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../frontend/app/style.css', import.meta.url), 'utf8');

test('sidebar antiga renderiza logo FluxMEI e navegacao principal', () => {
  assert.match(appHtml, /<aside class="sidebar" id="sidebar">/);
  assert.match(appHtml, /<span class="brand-name">FluxMEI<\/span>/);
  assert.match(appHtml, /data-page="dashboard"/);
  assert.match(appHtml, /data-page="movimentacoes"/);
  assert.match(appHtml, /data-page="metas"/);
  assert.match(appHtml, /data-page="assistente"/);
  assert.match(appHtml, /data-page="configuracoes"/);
});

test('sidebar preserva item ativo acessivel e conta no rodape', () => {
  assert.match(appHtml, /class="nav-item active" data-page="dashboard"/);
  assert.match(appHtml, /id="accountMenuButton"/);
  assert.match(appHtml, /aria-controls="accountModal"/);
  assert.match(appJs, /document\.querySelectorAll\('\.nav-item, \.bottom-item'\)/);
  assert.match(appJs, /setAttribute\('aria-current', 'page'\)/);
});

test('menu mobile antigo preserva hamburger, overlay e bottom nav', () => {
  assert.match(appHtml, /id="hamburger"/);
  assert.match(appHtml, /id="mobileOverlay"/);
  assert.match(appHtml, /class="bottom-item active" data-page="dashboard"/);
  assert.match(appHtml, /class="bottom-item" data-page="metas"/);
  assert.match(appCss, /\.mobile-overlay\.active/);
  assert.match(appCss, /\.sidebar\.mobile-open/);
});

test('navegacao continua centralizada por navigate e hashes', () => {
  assert.match(appJs, /function navigate\(page, options = \{\}\)/);
  assert.match(appJs, /function normalizeRouteTarget/);
  assert.match(appJs, /fluxia: 'assistente'/);
  assert.match(appJs, /'minha-conta': 'account'/);
  assert.match(appJs, /window\.addEventListener\('hashchange'/);
});
