import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSupabaseMock as createSupabaseMockBase } from './helpers/supabaseMock.js';

const aiRoutes = readFileSync(new URL('../backend/src/routes/aiRoutes.js', import.meta.url), 'utf8');
const aiController = readFileSync(new URL('../backend/src/controllers/aiController.js', import.meta.url), 'utf8');
const appHtml = readFileSync(new URL('../frontend/app/index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../frontend/app/app.js', import.meta.url), 'utf8');

const today = new Date('2026-07-10T12:00:00Z');

function createForecastMock(rowsByTable = {}) {
  return createSupabaseMockBase({
    rowsByTable: {
      movimentacoes: [],
      metas: [],
      ...rowsByTable
    }
  });
}

async function withForecastService(rowsByTable, fn) {
  const [{ supabaseAdmin }, service] = await Promise.all([
    import('../backend/src/config/supabase.js'),
    import(`../backend/src/services/financialForecastService.js?forecast-${Date.now()}-${Math.random()}`)
  ]);
  const mock = createForecastMock(rowsByTable);
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

const baseMovements = [
  { id: 'm1', user_id: 'user-1', data: '2026-07-01', tipo: 'entrada', categoria: 'Servico', descricao: 'Cliente A', valor: 1000 },
  { id: 'm2', user_id: 'user-1', data: '2026-07-05', tipo: 'saida', categoria: 'Software', descricao: 'Google', valor: 200 },
  { id: 'm3', user_id: 'user-1', data: '2026-07-06', tipo: 'saida', categoria: 'Marketing', descricao: 'Anuncios', valor: 300 },
  { id: 'm4', user_id: 'user-1', data: '2026-06-05', tipo: 'entrada', categoria: 'Servico', descricao: 'Cliente B', valor: 2000 },
  { id: 'm5', user_id: 'user-1', data: '2026-06-06', tipo: 'saida', categoria: 'Software', descricao: 'Google', valor: 100 }
];

test('forecast calcula receita prevista', async () => {
  await withForecastService({ movimentacoes: baseMovements }, async ({ forecastRevenue }) => {
    const forecast = await forecastRevenue('user-1', { today });

    assert.equal(forecast.current, 1000);
    assert.equal(forecast.projected, 3100);
    assert.equal(forecast.previous, 2000);
  });
});

test('forecast calcula despesa prevista', async () => {
  await withForecastService({ movimentacoes: baseMovements }, async ({ forecastExpenses }) => {
    const forecast = await forecastExpenses('user-1', { today });

    assert.equal(forecast.current, 500);
    assert.equal(forecast.projected, 1550);
    assert.equal(forecast.top_categories[0].categoria, 'Marketing');
  });
});

test('forecast calcula lucro e saldo', async () => {
  await withForecastService({ movimentacoes: baseMovements }, async ({ forecastProfit, forecastBalance }) => {
    const profit = await forecastProfit('user-1', { today });
    const balance = await forecastBalance('user-1', { today });

    assert.equal(profit.projected, 1550);
    assert.equal(balance.estimated_end_of_month, 1550);
    assert.equal(balance.status, 'positive');
  });
});

test('score financeiro classifica corretamente', async () => {
  await withForecastService({
    movimentacoes: [
      { user_id: 'user-1', data: '2026-07-01', tipo: 'entrada', categoria: 'Servico', valor: 3000 },
      { user_id: 'user-1', data: '2026-07-02', tipo: 'saida', categoria: 'Software', valor: 200 },
      { user_id: 'user-1', data: '2026-06-02', tipo: 'entrada', categoria: 'Servico', valor: 1000 },
      { user_id: 'user-1', data: '2026-06-03', tipo: 'saida', categoria: 'Software', valor: 300 }
    ],
    metas: [{ user_id: 'user-1', nome: 'Reserva', valor: 1000, valor_atual: 900 }]
  }, async ({ calculateFinancialScore }) => {
    const score = await calculateFinancialScore('user-1', { today });

    assert.ok(score.value >= 80);
    assert.equal(score.label, 'Excelente');
  });
});

test('gasto incomum e detectado', async () => {
  await withForecastService({
    movimentacoes: [
      { user_id: 'user-1', data: '2026-06-01', tipo: 'saida', categoria: 'Marketing', descricao: 'Anuncios', valor: 100 },
      { user_id: 'user-1', data: '2026-06-15', tipo: 'saida', categoria: 'Marketing', descricao: 'Anuncios', valor: 120 },
      { user_id: 'user-1', data: '2026-07-05', tipo: 'saida', categoria: 'Marketing', descricao: 'Campanha grande', valor: 500 }
    ]
  }, async ({ detectUnusualExpenses }) => {
    const unusual = await detectUnusualExpenses('user-1', { today });

    assert.equal(unusual.length, 1);
    assert.equal(unusual[0].descricao, 'Campanha grande');
  });
});

test('Gemini falhando mantem retorno numerico', async () => {
  await withForecastService({ movimentacoes: baseMovements }, async ({ getFinancialForecast }) => {
    process.env.GEMINI_API_KEY = 'test-key';
    const model = {
      async generateContent() {
        throw new Error('Gemini fora do ar');
      }
    };

    const forecast = await getFinancialForecast('user-1', { today, model });

    assert.equal(forecast.revenue_forecast.projected, 3100);
    assert.equal(forecast.expenses_forecast.projected, 1550);
    assert.equal(forecast.recommendation_source, 'local');
    assert.ok(forecast.recommendations.length >= 1);
  });
});

test('rotas de forecast da FluxIA estao registradas', () => {
  assert.match(aiRoutes, /router\.get\('\/forecast', asyncHandler\(aiForecast\)\)/);
  assert.match(aiController, /getFinancialForecast\(req\.user\.id\)/);
});

test('frontend renderiza cards de previsao', () => {
  assert.match(appHtml, /Previsoes da FluxIA/);
  assert.match(appHtml, /id="aiForecastGrid"/);
  assert.match(appHtml, /id="aiForecastAlert"/);
  assert.match(appHtml, /id="aiForecastGoal"/);
  assert.match(appJs, /apiRequest\('\/ai\/forecast'\)/);
  assert.match(appJs, /Faturamento previsto/);
  assert.match(appJs, /Score financeiro/);
});
