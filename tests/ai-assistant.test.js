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

async function withMockedAiContext(rowsByTable, fn, options = {}) {
  const [{ supabaseAdmin }, service] = await Promise.all([
    import('../backend/src/config/supabase.js'),
    import('../backend/src/services/geminiService.js?ai-chat-tests')
  ]);
  const originalFrom = supabaseAdmin.from;
  const originalGeminiApiKey = process.env.GEMINI_API_KEY;
  supabaseAdmin.from = createContextMockFrom(rowsByTable);
  if (options.geminiApiKey === null) {
    delete process.env.GEMINI_API_KEY;
  } else {
    process.env.GEMINI_API_KEY = options.geminiApiKey || originalGeminiApiKey || 'test-gemini-key';
  }

  try {
    await fn(service);
  } finally {
    supabaseAdmin.from = originalFrom;
    if (originalGeminiApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiApiKey;
  }
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
  assert.match(aiRoutes, /router\.get\('\/forecast', asyncHandler\(aiForecast\)\)/);
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

test('chat retorna resposta do Gemini usando contexto financeiro sanitizado', async () => {
  await withMockedAiContext({
    movimentacoes: [{
      data: '2026-06-10',
      tipo: 'entrada',
      categoria: 'Servico',
      descricao: 'Cliente recorrente cartao 4111111111111111',
      valor: 1200,
      forma_pagamento: 'pix',
      observacao: 'token=abc123'
    }, {
      data: '2026-06-12',
      tipo: 'saida',
      categoria: 'Marketing',
      descricao: 'Anuncios',
      valor: 200
    }],
    das: [],
    metas: [{ id: 'meta-1', nome: 'Reserva', valor: 1000, provider_raw: { secret: true } }]
  }, async ({ responderAssistenteFinanceiro }) => {
    let sentPrompt = '';
    let sentPayload = '';
    const fakeModel = {
      async generateContent(parts) {
        sentPrompt = JSON.stringify(parts);
        sentPayload = parts[1];
        return { response: { text: () => 'Voce esta lucrando e pode reforcar a reserva.' } };
      }
    };

    const result = await responderAssistenteFinanceiro({
      userId: 'user-1',
      message: 'Estou lucrando?',
      model: fakeModel
    });

    assert.equal(result.answer, 'Voce esta lucrando e pode reforcar a reserva.');
    assert.equal(result.context.resumo.saldo, 1000);
    assert.match(sentPrompt, /Assistente Financeiro do FluxMEI/);
    assert.doesNotMatch(sentPayload, /4111111111111111|token=abc123|provider_raw|secret/);
  });
});

test('chat sem dados suficientes responde claramente sem chamar Gemini', async () => {
  await withMockedAiContext({
    movimentacoes: [],
    das: [],
    metas: []
  }, async ({ responderAssistenteFinanceiro, INSUFFICIENT_FINANCIAL_DATA_MESSAGE }) => {
    const fakeModel = {
      async generateContent() {
        throw new Error('Gemini nao deveria ser chamado sem dados');
      }
    };

    const result = await responderAssistenteFinanceiro({
      userId: 'user-1',
      message: 'Analisar meu mes',
      model: fakeModel
    });

    assert.equal(result.answer, INSUFFICIENT_FINANCIAL_DATA_MESSAGE);
  });
});

test('falha do Gemini retorna erro amigavel sem detalhes do prompt', async () => {
  await withMockedAiContext({
    movimentacoes: [{
      data: '2026-06-10',
      tipo: 'entrada',
      categoria: 'Servico',
      descricao: 'Venda',
      valor: 500
    }],
    das: [],
    metas: []
  }, async ({ responderAssistenteFinanceiro }) => {
    const fakeModel = {
      async generateContent() {
        throw new Error('upstream prompt with sensitive payload');
      }
    };

    await assert.rejects(
      () => responderAssistenteFinanceiro({
        userId: 'user-1',
        message: 'Analisar meu mes',
        model: fakeModel
      }),
      (error) => {
        assert.equal(error.statusCode, 503);
        assert.equal(error.expose, true);
        assert.equal(error.message, 'Nao foi possivel gerar resposta agora. Tente novamente em instantes.');
        assert.equal(error.details, null);
        return true;
      }
    );
  });
});

test('chat retorna erro especifico quando chave Gemini nao esta configurada', async () => {
  await withMockedAiContext({
    movimentacoes: [{
      data: '2026-06-10',
      tipo: 'entrada',
      categoria: 'Servico',
      descricao: 'Venda',
      valor: 500
    }],
    das: [],
    metas: []
  }, async ({ responderAssistenteFinanceiro, GEMINI_MISSING_KEY_MESSAGE }) => {
    await assert.rejects(
      () => responderAssistenteFinanceiro({
        userId: 'user-1',
        message: 'Analisar meu mes',
        model: { async generateContent() {} }
      }),
      (error) => {
        assert.equal(error.statusCode, 503);
        assert.equal(error.message, GEMINI_MISSING_KEY_MESSAGE);
        assert.equal(error.expose, true);
        return true;
      }
    );
  }, { geminiApiKey: null });
});

test('chat retorna erro especifico quando modelo Gemini esta invalido', async () => {
  await withMockedAiContext({
    movimentacoes: [{
      data: '2026-06-10',
      tipo: 'entrada',
      categoria: 'Servico',
      descricao: 'Venda',
      valor: 500
    }],
    das: [],
    metas: []
  }, async ({ responderAssistenteFinanceiro, GEMINI_INVALID_MODEL_MESSAGE }) => {
    await assert.rejects(
      () => responderAssistenteFinanceiro({
        userId: 'user-1',
        message: 'Analisar meu mes',
        model: { model: 'gemini-invalido' }
      }),
      (error) => {
        assert.equal(error.statusCode, 503);
        assert.equal(error.message, GEMINI_INVALID_MODEL_MESSAGE);
        assert.equal(error.expose, true);
        return true;
      }
    );
  });
});

test('chat classifica quota ou rate limit do Gemini com mensagem especifica', async () => {
  await withMockedAiContext({
    movimentacoes: [{
      data: '2026-06-10',
      tipo: 'entrada',
      categoria: 'Servico',
      descricao: 'Venda',
      valor: 500
    }],
    das: [],
    metas: []
  }, async ({ responderAssistenteFinanceiro, GEMINI_RATE_LIMIT_MESSAGE }) => {
    const originalError = console.error;
    console.error = () => {};
    const fakeModel = {
      model: 'gemini-2.5-flash',
      async generateContent() {
        const error = new Error('RESOURCE_EXHAUSTED: quota exceeded');
        error.status = 429;
        throw error;
      }
    };

    try {
      await assert.rejects(
        () => responderAssistenteFinanceiro({
          userId: 'user-1',
          message: 'Analisar meu mes',
          model: fakeModel
        }),
        (error) => {
          assert.equal(error.statusCode, 503);
          assert.equal(error.message, GEMINI_RATE_LIMIT_MESSAGE);
          assert.equal(error.expose, true);
          return true;
        }
      );
    } finally {
      console.error = originalError;
    }
  });
});

test('falha do Gemini registra log seguro sem prompt contexto ou chave', async () => {
  await withMockedAiContext({
    movimentacoes: [{
      data: '2026-06-10',
      tipo: 'entrada',
      categoria: 'Servico',
      descricao: 'Venda secreta 4111111111111111',
      valor: 500
    }],
    das: [],
    metas: []
  }, async ({ responderAssistenteFinanceiro }) => {
    const logs = [];
    const originalError = console.error;
    console.error = (...args) => logs.push(args);
    const fakeModel = {
      model: 'gemini-2.5-flash',
      async generateContent() {
        const error = new Error('Gemini upstream failed token=abc123 12345678901 test-gemini-key');
        error.name = 'GoogleGenerativeAIError';
        error.status = 500;
        error.response = {
          statusCode: 500,
          data: {
            error: {
              message: 'body has card 4111111111111111 and token=abc123 and cpf 12345678901'
            }
          }
        };
        throw error;
      }
    };

    try {
      await assert.rejects(() => responderAssistenteFinanceiro({
        userId: 'user-1',
        message: 'Analisar meu mes',
        model: fakeModel
      }));
    } finally {
      console.error = originalError;
    }

    assert.equal(logs.length, 1);
    assert.equal(logs[0][0], '[gemini:error]');
    const payload = logs[0][1];
    assert.equal(payload.provider, 'gemini');
    assert.equal(payload.operation, 'responderAssistenteFinanceiro');
    assert.equal(payload.status, 500);
    assert.equal(payload.statusCode, 500);
    assert.equal(payload.name, 'GoogleGenerativeAIError');
    assert.equal(payload.has_gemini_api_key, true);
    assert.equal(payload.model, 'gemini-2.5-flash');
    const serialized = JSON.stringify(payload);
    assert.doesNotMatch(serialized, /test-gemini-key|4111111111111111|12345678901|token=abc123|Venda secreta|contexto_financeiro|pergunta/);
  }, { geminiApiKey: 'test-gemini-key' });
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
  assert.match(geminiService, /Assistente Financeiro do FluxMEI/);
  assert.match(geminiService, /Ainda não há dados financeiros suficientes para uma análise completa/);
});

test('frontend possui tela de assistente, chat, sugestoes e historico', () => {
  assert.match(appHtml, /data-page="assistente"/);
  assert.match(appHtml, /id="page-assistente"/);
  assert.match(appHtml, /class="ai-hero[^"]*"/);
  assert.match(appHtml, /FluxIA/);
  assert.match(appHtml, /Assistente Financeiro/);
  assert.match(appHtml, /Especialista em MEIs brasileiros/);
  assert.match(appHtml, /id="aiInsightsGrid"/);
  assert.match(appHtml, /id="aiPrivacyCard"/);
  assert.match(appHtml, /Nunca enviamos CPF\/CNPJ, cartão, tokens ou dados sensíveis para a IA/);
  assert.match(appHtml, /id="aiChatForm"/);
  assert.match(appHtml, /id="aiChatInput"/);
  assert.match(appHtml, /id="aiChatSubmit"/);
  assert.match(appHtml, /data-ai-prompt="Analisar meu mês"/);
  assert.match(appHtml, /data-ai-prompt="Como posso economizar\?"/);
  assert.match(appHtml, /data-ai-prompt="Qual minha maior despesa\?"/);
  assert.match(appHtml, /data-ai-prompt="Estou lucrando\?"/);
  assert.match(appHtml, /data-ai-prompt="Como bater minha meta\?"/);
  assert.match(appHtml, /data-ai-prompt="Prever próximo mês"/);
  assert.match(appHtml, /id="aiHistoryList"/);
  assert.match(appHtml, /id="aiNewConversation"/);
  assert.match(appJs, /apiRequest\('\/ai\/insights'\)/);
  assert.match(appJs, /apiRequest\('\/ai\/chat'/);
  assert.match(appJs, /apiRequest\(`\/ai\/conversations\/\$\{encodeURIComponent\(id\)\}`\)/);
  assert.match(appJs, /data-ai-rename/);
  assert.match(appJs, /data-ai-delete/);
  assert.match(appJs, /analisando suas financas/);
  assert.match(appJs, /function renderAiInsights/);
  assert.match(appJs, /function submitAiMessage/);
  assert.match(appCss, /\.ai-hero/);
  assert.match(appCss, /\.ai-shell/);
  assert.match(appCss, /\.ai-privacy-card/);
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
