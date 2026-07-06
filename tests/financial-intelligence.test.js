import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSupabaseMock } from './helpers/supabaseMock.js';

const aiRoutes = readFileSync(new URL('../backend/src/routes/aiRoutes.js', import.meta.url), 'utf8');
const aiController = readFileSync(new URL('../backend/src/controllers/aiController.js', import.meta.url), 'utf8');
const appHtml = readFileSync(new URL('../frontend/app/index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../frontend/app/app.js', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../frontend/app/style.css', import.meta.url), 'utf8');

const today = new Date('2026-07-10T12:00:00Z');

async function withIntelligenceService(rowsByTable, fn) {
  const [{ supabaseAdmin }, service] = await Promise.all([
    import('../backend/src/config/supabase.js'),
    import(`../backend/src/services/financialIntelligenceService.js?intelligence-${Date.now()}-${Math.random()}`)
  ]);
  const mock = createSupabaseMock({
    rowsByTable: {
      movimentacoes: [],
      metas: [],
      notifications: [],
      ...rowsByTable
    }
  });
  const originalFrom = supabaseAdmin.from;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  supabaseAdmin.from = mock.from;

  try {
    await fn(service, mock);
  } finally {
    supabaseAdmin.from = originalFrom;
    if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiKey;
  }
}

const intelligenceMovements = [
  { id: 'm1', user_id: 'user-1', data: '2026-07-01', tipo: 'entrada', categoria: 'Servico', descricao: 'Cliente A', valor: 1800 },
  { id: 'm2', user_id: 'user-1', data: '2026-07-03', tipo: 'saida', categoria: 'Marketing', descricao: 'Campanha grande', valor: 700 },
  { id: 'm3', user_id: 'user-1', data: '2026-07-05', tipo: 'saida', categoria: 'Software', descricao: 'Google Workspace', valor: 300 },
  { id: 'm4', user_id: 'user-1', data: '2026-06-02', tipo: 'entrada', categoria: 'Servico', descricao: 'Cliente B', valor: 3000 },
  { id: 'm5', user_id: 'user-1', data: '2026-06-03', tipo: 'saida', categoria: 'Marketing', descricao: 'Campanha pequena', valor: 120 },
  { id: 'm6', user_id: 'user-1', data: '2026-06-05', tipo: 'saida', categoria: 'Software', descricao: 'Google Workspace', valor: 280 }
];

test('rota de inteligencia financeira esta registrada', () => {
  assert.match(aiRoutes, /router\.get\('\/intelligence', asyncHandler\(aiIntelligence\)\)/);
  assert.match(aiController, /generateFinancialInsights\(req\.user\.id\)/);
});

test('calcula radar score da inteligencia financeira', async () => {
  await withIntelligenceService({ movimentacoes: intelligenceMovements }, async ({ generateRadarScore }) => {
    const score = await generateRadarScore('user-1', { today });

    assert.equal(typeof score.value, 'number');
    assert.ok(score.value >= 0 && score.value <= 100);
    assert.ok(['Excelente', 'Saudavel', 'Atencao', 'Critico'].includes(score.label));
  });
});

test('detecta aumento de despesas', async () => {
  await withIntelligenceService({ movimentacoes: intelligenceMovements }, async ({ detectExpenseIncrease }) => {
    const result = await detectExpenseIncrease('user-1', { today });

    assert.equal(result.type, 'expense_increase');
    assert.match(result.title, /Despesas aumentaram/);
  });
});

test('detecta queda de receita', async () => {
  await withIntelligenceService({ movimentacoes: intelligenceMovements }, async ({ detectRevenueDrop }) => {
    const result = await detectRevenueDrop('user-1', { today });

    assert.equal(result.type, 'revenue_drop');
    assert.match(result.title, /Receita caiu/);
  });
});

test('detecta gasto incomum por categoria', async () => {
  await withIntelligenceService({ movimentacoes: intelligenceMovements }, async ({ detectUnusualCategorySpending }) => {
    const result = await detectUnusualCategorySpending('user-1', { today });

    assert.ok(result.some((item) => item.category === 'Marketing'));
    assert.equal(result[0].type, 'unusual_category_spending');
  });
});

test('detecta risco de caixa', async () => {
  await withIntelligenceService({
    movimentacoes: [
      { user_id: 'user-1', data: '2026-07-01', tipo: 'entrada', categoria: 'Servico', valor: 200 },
      { user_id: 'user-1', data: '2026-07-02', tipo: 'saida', categoria: 'Fornecedor', valor: 900 },
      { user_id: 'user-1', data: '2026-06-01', tipo: 'entrada', categoria: 'Servico', valor: 1000 }
    ]
  }, async ({ detectCashflowRisk }) => {
    const result = await detectCashflowRisk('user-1', { today });

    assert.equal(result.type, 'cashflow_risk');
    assert.equal(result.severity, 'danger');
  });
});

test('cria notificacao para insight critico', async () => {
  await withIntelligenceService({
    movimentacoes: [
      { user_id: 'user-1', data: '2026-07-01', tipo: 'entrada', categoria: 'Servico', valor: 100 },
      { user_id: 'user-1', data: '2026-07-02', tipo: 'saida', categoria: 'Marketing', valor: 1200 },
      { user_id: 'user-1', data: '2026-06-01', tipo: 'entrada', categoria: 'Servico', valor: 3000 },
      { user_id: 'user-1', data: '2026-06-02', tipo: 'saida', categoria: 'Marketing', valor: 100 }
    ]
  }, async ({ generateFinancialInsights }, mock) => {
    const result = await generateFinancialInsights('user-1', { today });
    const notificationInsert = mock.stats.inserts.find((item) => item.table === 'notifications');

    assert.ok(result.insights.some((item) => item.severity === 'danger'));
    assert.equal(notificationInsert.payload.type, 'ai');
    assert.equal(notificationInsert.payload.severity, 'danger');
  });
});

test('Gemini falhando usa resumo local', async () => {
  await withIntelligenceService({ movimentacoes: intelligenceMovements }, async ({ generateFinancialInsights }) => {
    process.env.GEMINI_API_KEY = 'test-key';
    const result = await generateFinancialInsights('user-1', {
      today,
      model: {
        async generateContent() {
          throw new Error('Gemini fora do ar');
        }
      }
    });

    assert.match(result.summary, /FluxIA encontrou|poucos dados/);
    assert.equal(typeof result.radar_score.value, 'number');
  });
});

test('frontend renderiza radar e insights da inteligencia financeira', () => {
  assert.match(appHtml, /Radar Financeiro/);
  assert.match(appHtml, /id="financialIntelligenceGrid"/);
  assert.match(appHtml, /id="financialIntelligenceList"/);
  assert.match(appHtml, /Ver movimentacoes/);
  assert.match(appJs, /Ver todos os insights/);
  assert.match(appJs, /apiRequest\('\/ai\/intelligence'\)/);
  assert.match(appJs, /renderFinancialIntelligence/);
  assert.match(appCss, /\.financial-intelligence-section/);
});
