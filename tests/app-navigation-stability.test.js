import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appHtml = readFileSync(new URL('../frontend/app/index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../frontend/app/app.js', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../frontend/app/style.css', import.meta.url), 'utf8');

const pageIds = [...appHtml.matchAll(/id="page-([^"]+)"/g)].map((match) => match[1]);
const dataPages = [...appHtml.matchAll(/data-page="([^"]+)"/g)].map((match) => match[1]);

test('todos os itens data-page possuem uma tela correspondente', () => {
  const missing = [...new Set(dataPages.filter((page) => !pageIds.includes(page)))];
  assert.deepEqual(missing, []);
});

test('navegacao principal aponta para abas reais restauradas', () => {
  assert.match(appHtml, /data-page="dashboard"/);
  assert.match(appHtml, /data-page="movimentacoes"/);
  assert.match(appHtml, /data-page="metas"/);
  assert.match(appHtml, /data-page="assistente"/);
  assert.match(appHtml, /id="page-metas"/);
  assert.match(appHtml, /class="nav-item" data-page="metas"[\s\S]*?<span class="nav-label">Metas<\/span>/);
});

test('navigate normaliza hashes e aliases internos', () => {
  assert.match(appJs, /function normalizeRouteTarget/);
  assert.match(appJs, /fluxia: 'assistente'/);
  assert.match(appJs, /'minha-conta': 'account'/);
  assert.match(appJs, /'exportar-dados': 'export'/);
  assert.match(appJs, /function getInitialRoute/);
  assert.match(appJs, /window\.addEventListener\('hashchange'/);
  assert.match(appJs, /navigate\(getInitialRoute\(\), \{ replaceHash: true \}\)/);
});

test('apenas uma page fica ativa e sidebar acompanha a pagina', () => {
  assert.match(appJs, /document\.querySelectorAll\('\.page'\)\.forEach\(p => p\.classList\.remove\('active'\)\)/);
  assert.match(appJs, /function setActiveNavigation/);
  assert.match(appJs, /setAttribute\('aria-current', 'page'\)/);
  assert.match(appJs, /APP_PAGES\.has\(route\) \? route : 'dashboard'/);
});

test('rotas de conta exportacao e indicacao abrem handlers existentes', () => {
  assert.match(appJs, /handleRouteAction\(route\)/);
  assert.match(appJs, /function handleRouteAction\(action\)/);
  assert.match(appJs, /openAccountPanel\(\)/);
  assert.match(appJs, /#accountReferralCard/);
  assert.match(appJs, /\.account-export-card/);
  assert.match(appHtml, /id="accountReferralCard"/);
  assert.match(appHtml, /class="account-export-card"/);
});

test('botoes e modais principais permanecem disponiveis', () => {
  assert.match(appHtml, /onclick="navigate\('movimentacoes'\)"/);
  assert.match(appHtml, /id="modalMovimentacao"/);
  assert.doesNotMatch(appHtml, /id="modalMeta"/);
  assert.match(appJs, /function openModal\(id\)/);
  assert.match(appJs, /if \(!modal\) return/);
});

test('CSS usa regra antiga de paginas e nao força FluxIA fora da aba ativa', () => {
  assert.match(appCss, /\.page \{ display: none;/);
  assert.match(appCss, /\.page\.active \{ display: block;/);
  assert.doesNotMatch(appCss, /#page-assistente\s*\{\s*display:\s*grid/);
});
