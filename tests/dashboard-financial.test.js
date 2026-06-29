import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appHtml = readFileSync(new URL('../frontend/app/index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../frontend/app/app.js', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../frontend/app/style.css', import.meta.url), 'utf8');
const movimentacaoRoutes = readFileSync(new URL('../backend/src/routes/movimentacaoRoutes.js', import.meta.url), 'utf8');

test('dashboard voltou ao visual antigo sem carregar design system no app', () => {
  assert.doesNotMatch(appHtml, /\/styles\/design-system\.css/);
  assert.match(appHtml, /id="page-dashboard"/);
  assert.match(appHtml, /id="dashboardMes"/);
  assert.match(appHtml, /id="dashboardPeriodo"/);
  assert.match(appHtml, /id="dashboardSmartAlerts"/);
});

test('dashboard preserva cards financeiros e calculos principais', () => {
  assert.match(appHtml, /id="kpiSaldo"/);
  assert.match(appHtml, /id="kpiEntradas"/);
  assert.match(appHtml, /id="kpiSaidas"/);
  assert.match(appHtml, /id="kpiLucro"/);
  assert.match(appJs, /function calcTotals\(movs = \[\]\)/);
  assert.match(appJs, /function calcPercentChange\(current, previous\)/);
  assert.match(appJs, /lucroChange/);
});

test('dashboard possui filtros de periodo e salva selecao', () => {
  assert.match(appHtml, /id="dashboardPeriodo"/);
  assert.match(appHtml, /value="3m"/);
  assert.match(appHtml, /value="6m"/);
  assert.match(appHtml, /value="year"/);
  assert.match(appJs, /const DASHBOARD_PERIOD_KEY = 'fluxmei_dashboard_periodo'/);
  assert.match(appJs, /function getDashboardPeriodMonths/);
  assert.match(appJs, /localStorage\.setItem\(DASHBOARD_PERIOD_KEY, dashboardPeriodo\)/);
});

test('dashboard renderiza estado vazio antigo e CTA de movimentacao', () => {
  assert.match(appHtml, /id="dashboardEmptyState"/);
  assert.match(appHtml, /Comece cadastrando sua primeira receita ou despesa\./);
  assert.match(appHtml, /data-open-movimentacao/);
  assert.match(appJs, /document\.getElementById\('dashboardEmptyState'\)\.hidden = state\.movimentacoes\.length > 0/);
});

test('dashboard renderiza graficos e ultimas movimentacoes', () => {
  assert.match(appHtml, /id="revenueExpenseChart"/);
  assert.match(appHtml, /id="balanceEvolutionChart"/);
  assert.match(appHtml, /id="expenseCategoryChart"/);
  assert.match(appHtml, /id="topExpensesList"/);
  assert.match(appHtml, /id="dashMovList"/);
  assert.match(appJs, /function renderRevenueExpenseChart/);
  assert.match(appJs, /function renderBalanceEvolutionChart/);
  assert.match(appJs, /<svg class="line-chart"/);
  assert.match(appCss, /\.bar-chart/);
  assert.match(appCss, /\.line-chart/);
});

test('dashboard mantem insights automaticos e acesso a FluxIA pela navegacao', () => {
  assert.match(appHtml, /id="dashboardInsights"/);
  assert.match(appHtml, /data-page="assistente"/);
  assert.match(appJs, /Suas despesas aumentaram/);
  assert.match(appJs, /Sua maior categoria de gasto foi/);
  assert.match(appJs, /teve lucro de/);
});

test('dados financeiros continuam restritos ao usuario autenticado', () => {
  assert.match(appJs, /apiRequest\('\/movimentacoes'\)/);
  assert.match(movimentacaoRoutes, /router\.use\(authMiddleware\)/);
});
