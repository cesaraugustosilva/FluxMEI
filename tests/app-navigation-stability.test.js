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

test('navegacao principal aponta para abas reais modernizadas', () => {
  assert.match(appHtml, /data-page="dashboard"/);
  assert.match(appHtml, /data-page="movimentacoes"/);
  assert.match(appHtml, /data-page="metas"/);
  assert.match(appHtml, /data-page="assistente"/);
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
  assert.match(appHtml, /data-sidebar-action="account"/);
  assert.match(appHtml, /data-sidebar-action="referral"/);
  assert.match(appHtml, /data-sidebar-action="export"/);
  assert.match(appJs, /handleSidebarAction\(route\)/);
  assert.match(appJs, /openAccountPanel\(\)/);
  assert.match(appJs, /openAccountSection\(action\)/);
});

test('botoes rapidos preservam destinos e modais principais', () => {
  assert.match(appHtml, /onclick="navigate\('assistente'\)"/);
  assert.match(appHtml, /onclick="navigate\('metas'\); openNovaMeta\(\);"/);
  assert.match(appHtml, /id="modalMovimentacao"/);
  assert.match(appHtml, /id="modalMeta"/);
  assert.match(appJs, /function openModal\(id\)/);
  assert.match(appJs, /if \(!modal\) return/);
});

test('CSS nao exibe FluxIA fora da aba ativa', () => {
  assert.match(appCss, /#page-assistente\s*\{\s*display: none;/);
  assert.match(appCss, /#page-assistente\.active\s*\{\s*display: grid;/);
  assert.match(appCss, /#page-movimentacoes\.active\s*\{\s*display: grid;/);
  assert.match(appCss, /#page-metas\.active\s*\{\s*display: grid;/);
});
