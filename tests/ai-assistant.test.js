import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../backend/database/migrate_ai_assistant.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../backend/database/schema.sql', import.meta.url), 'utf8');
const aiRoutes = readFileSync(new URL('../backend/src/routes/aiRoutes.js', import.meta.url), 'utf8');
const aiController = readFileSync(new URL('../backend/src/controllers/aiController.js', import.meta.url), 'utf8');
const geminiService = readFileSync(new URL('../backend/src/services/geminiService.js', import.meta.url), 'utf8');
const adminController = readFileSync(new URL('../backend/src/controllers/adminController.js', import.meta.url), 'utf8');
const adminHtml = readFileSync(new URL('../frontend/admin/index.html', import.meta.url), 'utf8');
const adminJs = readFileSync(new URL('../frontend/admin/admin.js', import.meta.url), 'utf8');
const appHtml = readFileSync(new URL('../frontend/app/index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../frontend/app/app.js', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../frontend/app/style.css', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../backend/src/server.js', import.meta.url), 'utf8');

function createContextMockFrom(rowsByTable) {
  return (table) => {
    const rows = rowsByTable[table] || [];
    return {
      select() { return this; },
      eq() { return this; },
      order() { return this; },
      limit() { return Promise.resolve({ data: rows, error: null }); }
    };
  };
}

test('migration e schema criam historico seguro do assistente financeiro', () => {
  for (const source of [migration, schema]) {
    assert.match(source, /create table if not exists public\.ai_conversations/);
    assert.match(source, /create table if not exists public\.ai_messages/);
    assert.match(source, /alter table public\.ai_conversations enable row level security/);
    assert.match(source, /ai_messages_no_client_access/);
  }
});

test('rotas do assistente exigem autenticacao e assinatura ativa', () => {
  assert.match(aiRoutes, /router\.use\(authMiddleware\)/);
  assert.match(aiRoutes, /router\.use\(checkSubscriptionAccess\)/);
  assert.match(aiRoutes, /router\.get\('\/insights', asyncHandler\(aiInsights\)\)/);
  assert.match(aiRoutes, /router\.post\('\/chat', asyncHandler\(aiChat\)\)/);
  assert.match(aiRoutes, /router\.get\('\/conversations', asyncHandler\(listAiConversations\)\)/);
  assert.match(aiRoutes, /router\.patch\('\/conversations\/:id', asyncHandler\(renameAiConversation\)\)/);
  assert.match(aiRoutes, /router\.delete\('\/conversations\/:id', asyncHandler\(deleteAiConversation\)\)/);
  assert.match(serverSource, /apiRouter\.use\('\/ai', aiRoutes\)/);
});

test('contexto financeiro da IA usa apenas dados permitidos e remove sensiveis', async () => {
  const [{ supabaseAdmin }, { buildFinancialAiContext }] = await Promise.all([
    import('../backend/src/config/supabase.js'),
    import('../backend/src/services/geminiService.js?ai-context-tests')
  ]);
  const originalFrom = supabaseAdmin.from;
  supabaseAdmin.from = createContextMockFrom({
    movimentacoes: [{
      data: '2026-06-10',
      tipo: 'saida',
      categoria: 'Combustivel',
      descricao: 'Posto',
      valor: 120,
      forma_pagamento: 'cartao',
      observacao: 'ok',
      provider_raw: { secret: true },
      cpfCnpj: '12345678901',
      card: { number: '4111111111111111', cvv: '123' }
    }],
    das: [{ mes_referencia: '2026-06', vencimento: '2026-06-20', valor: 72.6, status: 'pendente', cpf: '12345678901' }],
    metas: [{ id: 'meta-1', nome: 'Reserva', valor: 1000 }]
  });

  try {
    const context = await buildFinancialAiContext('user-1');
    const serialized = JSON.stringify(context);
    assert.equal(context.movimentacoes.length, 1);
    assert.equal(context.resumo.total_despesas, 120);
    assert.equal(context.categorias[0].categoria, 'Combustivel');
    assert.doesNotMatch(serialized, /provider_raw|cpfCnpj|4111111111111111|cvv|12345678901/);
  } finally {
    supabaseAdmin.from = originalFrom;
  }
});

test('insights automaticos usam dados financeiros reais', async () => {
  const { geminiAssistantTestUtils } = await import('../backend/src/services/geminiService.js?ai-insights-tests');
  const currentMonth = new Date().toISOString().slice(0, 7);
  const context = {
    resumo: {
      saldo: 430,
      receitas_por_mes: { [currentMonth]: 1500 },
      despesas_por_mes: { [currentMonth]: 900 },
      categorias_despesas: [{ categoria: 'Alimentacao', valor: 350 }]
    },
    movimentacoes: [{ data: `${currentMonth}-10` }],
    das: [{ vencimento: `${currentMonth}-20`, valor: 72.6, status: 'pendente' }],
    metas: [{ id: 'meta-1' }]
  };

  const insights = geminiAssistantTestUtils.generateAutomaticInsights(context);
  assert.ok(insights.length >= 4);
  assert.ok(insights.some((item) => item.title.includes('Alimentacao')));
  assert.ok(insights.some((item) => item.title.includes('DAS')));
});

test('controller registra auditoria de chat e analise', () => {
  assert.match(aiController, /action: 'ai\.chat'/);
  assert.match(aiController, /action: 'ai\.analysis'/);
  assert.match(aiController, /responderAssistenteFinanceiro/);
  assert.match(geminiService, /Nunca solicite nem mencione senha, token, CPF\/CNPJ, dados de cartao, CVV, provider_raw ou secrets/);
});

test('frontend possui tela de assistente, chat, sugestoes e historico', () => {
  assert.match(appHtml, /data-page="assistente"/);
  assert.match(appHtml, /id="page-assistente"/);
  assert.match(appHtml, /id="aiInsightsGrid"/);
  assert.match(appHtml, /id="aiChatForm"/);
  assert.match(appHtml, /data-ai-prompt="Analisar meu mês"/);
  assert.match(appHtml, /id="aiHistoryList"/);
  assert.match(appJs, /apiRequest\('\/ai\/insights'\)/);
  assert.match(appJs, /apiRequest\('\/ai\/chat'/);
  assert.match(appJs, /apiRequest\(`\/ai\/conversations\/\$\{encodeURIComponent\(id\)\}`\)/);
  assert.match(appCss, /\.ai-shell/);
  assert.match(appCss, /\.ai-message\.typing/);
});

test('admin expõe metricas de uso da IA', () => {
  assert.match(adminController, /total_consultas_ia/);
  assert.match(adminController, /usuarios_ia/);
  assert.match(adminController, /perguntas_frequentes_ia/);
  assert.match(adminHtml, /metricAiConsultations/);
  assert.match(adminHtml, /metricAiUsers/);
  assert.match(adminJs, /metrics\.perguntas_frequentes_ia/);
});
