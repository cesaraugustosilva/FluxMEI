import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appHtml = readFileSync(new URL('../frontend/app/index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../frontend/app/app.js', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../frontend/app/style.css', import.meta.url), 'utf8');
const movimentacaoRoutes = readFileSync(new URL('../backend/src/routes/movimentacaoRoutes.js', import.meta.url), 'utf8');

test('dashboard possui cards financeiros avancados e variacao mensal', () => {
  assert.match(appHtml, /id="kpiSaldo"/);
  assert.match(appHtml, /id="kpiEntradas"/);
  assert.match(appHtml, /id="kpiSaidas"/);
  assert.match(appHtml, /id="kpiLucro"/);
  assert.match(appHtml, /id="kpiVariacao"/);
  assert.match(appHtml, /id="kpiVariacaoTrend"/);
  assert.match(appJs, /function calcTotals\(movs = \[\]\)/);
  assert.match(appJs, /function calcPercentChange\(current, previous\)/);
  assert.match(appJs, /Lucro vs mês anterior/);
});

test('dashboard carrega design system e novo hero premium', () => {
  assert.match(appHtml, /\/styles\/design-system\.css/);
  assert.match(appHtml, /id="dashboardGreeting"/);
  assert.match(appHtml, /Aqui está o resumo financeiro do seu MEI\./);
  assert.match(appHtml, /id="dashboardPlanBadge"/);
  assert.match(appHtml, /id="dashboardSubscriptionStatus"/);
  assert.match(appHtml, /Abrir FluxIA/);
  assert.match(appJs, /function renderDashboardHero/);
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

test('dashboard renderiza estado vazio amigavel', () => {
  assert.match(appHtml, /id="dashboardEmptyState"/);
  assert.match(appHtml, /Comece cadastrando sua primeira receita ou despesa\./);
  assert.match(appHtml, /Adicionar primeira movimentação/);
  assert.match(appJs, /document\.getElementById\('dashboardEmptyState'\)\.hidden = state\.movimentacoes\.length > 0/);
});

test('dashboard possui card FluxIA e acoes rapidas', () => {
  assert.match(appHtml, /id="dashboardFluxiaCard"/);
  assert.match(appHtml, /id="dashboardFluxiaInsight"/);
  assert.match(appHtml, /Análise da FluxIA/);
  assert.match(appHtml, /Ações rápidas/);
  assert.match(appHtml, /Adicionar receita/);
  assert.match(appHtml, /Adicionar despesa/);
  assert.match(appHtml, /Criar meta/);
  assert.match(appHtml, /data-dashboard-export="resumo"/);
  assert.match(appJs, /function renderDashboardFluxia/);
  assert.match(appJs, /querySelectorAll\('\[data-dashboard-export\]'\)/);
});

test('dashboard renderiza graficos sem depender de nova biblioteca', () => {
  assert.match(appHtml, /id="revenueExpenseChart"/);
  assert.match(appHtml, /id="balanceEvolutionChart"/);
  assert.match(appHtml, /id="expenseCategoryChart"/);
  assert.match(appHtml, /id="topExpensesList"/);
  assert.match(appJs, /function renderRevenueExpenseChart/);
  assert.match(appJs, /function renderBalanceEvolutionChart/);
  assert.match(appJs, /<svg class="line-chart"/);
  assert.match(appCss, /\.bar-chart/);
  assert.match(appCss, /\.line-chart/);
});

test('dashboard mostra insights automaticos', () => {
  assert.match(appHtml, /id="dashboardInsights"/);
  assert.match(appJs, /Suas despesas aumentaram/);
  assert.match(appJs, /Sua maior categoria de gasto foi/);
  assert.match(appJs, /Você teve lucro de/);
  assert.match(appJs, /meta financeira/);
});

test('dados financeiros continuam restritos ao usuario autenticado', () => {
  assert.match(appJs, /apiRequest\('\/movimentacoes'\)/);
  assert.match(movimentacaoRoutes, /router\.use\(authMiddleware\)/);
});
