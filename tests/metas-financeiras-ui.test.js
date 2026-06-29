import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appHtml = readFileSync(new URL('../frontend/app/index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../frontend/app/app.js', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../frontend/app/style.css', import.meta.url), 'utf8');

test('Metas usa a tela antiga restaurada sem painel premium novo', () => {
  assert.match(appHtml, /id="page-metas"/);
  assert.match(appHtml, /<h1 class="page-title">Metas<\/h1>/);
  assert.match(appHtml, /id="relatorioPeriodo"/);
  assert.match(appHtml, /id="relatorioAno"/);
  assert.match(appHtml, /id="relSummaryGrid"/);
  assert.match(appHtml, /id="relChart"/);
  assert.doesNotMatch(appHtml, /id="goalsGrid"/);
  assert.doesNotMatch(appHtml, /id="modalMeta"/);
});

test('Metas reaproveita renderizacao antiga de relatorios', () => {
  assert.match(appJs, /case 'metas':\s+renderRelatorios\(\); break;/);
  assert.match(appJs, /function renderRelatorios\(\)/);
  assert.match(appJs, /document\.getElementById\('relatorioPeriodo'\)\.addEventListener\('change', renderRelatorios\)/);
  assert.match(appJs, /document\.getElementById\('relatorioAno'\)\.addEventListener\('change', renderRelatorios\)/);
});

test('Metas nao inclui CSS novo de goals nem chamadas novas ao backend', () => {
  assert.doesNotMatch(appCss, /\.goals-grid/);
  assert.doesNotMatch(appCss, /\.goal-progress-track/);
  assert.doesNotMatch(appJs, /FINANCIAL_GOALS_KEY/);
  assert.doesNotMatch(appJs, /apiRequest\('\/metas/);
  assert.doesNotMatch(appJs, /apiRequest\(`\/metas/);
});
