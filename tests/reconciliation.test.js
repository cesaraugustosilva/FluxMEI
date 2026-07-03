import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSupabaseMock as createSupabaseMockBase } from './helpers/supabaseMock.js';
import {
  calculateConfidence,
  suggestCategory
} from '../backend/src/services/reconciliationService.js';

const importRoutes = readFileSync(new URL('../backend/src/routes/importRoutes.js', import.meta.url), 'utf8');
const reconciliationMigration = readFileSync(new URL('../backend/database/migrate_bank_reconciliation.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../backend/database/schema.sql', import.meta.url), 'utf8');
const appHtml = readFileSync(new URL('../frontend/app/index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../frontend/app/app.js', import.meta.url), 'utf8');

function createReconciliationMock(rowsByTable = {}) {
  return createSupabaseMockBase({
    rowsByTable: {
      bank_imports: [],
      movimentacoes: [],
      ...rowsByTable
    }
  });
}

async function withReconciliationService(rowsByTable, fn) {
  const [{ supabaseAdmin }, service] = await Promise.all([
    import('../backend/src/config/supabase.js'),
    import(`../backend/src/services/reconciliationService.js?reconciliation-${Date.now()}-${Math.random()}`)
  ]);
  const mock = createReconciliationMock(rowsByTable);
  const originalFrom = supabaseAdmin.from;
  const originalKey = process.env.GEMINI_API_KEY;
  supabaseAdmin.from = mock.from;
  try {
    await fn(service, mock);
  } finally {
    supabaseAdmin.from = originalFrom;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  }
}

test('detecta duplicata provavel por data valor descricao e tipo', async () => {
  await withReconciliationService({
    movimentacoes: [{
      id: 'mov-1',
      user_id: 'user-1',
      data: '2026-06-10',
      descricao: 'Mercado Central',
      valor: 120.5,
      tipo: 'saida',
      categoria: 'Alimentacao'
    }]
  }, async ({ findPossibleDuplicates }) => {
    const duplicates = await findPossibleDuplicates('user-1', {
      id: 'mov-2',
      data: '2026-06-11',
      descricao: 'Mercado Central Loja',
      valor: 120.5,
      tipo: 'saida'
    });

    assert.equal(duplicates.length, 1);
    assert.equal(duplicates[0].id, 'mov-1');
    assert.ok(duplicates[0].score >= 0.6);
  });
});

test('sugere categoria com palavras-chave melhoradas', () => {
  assert.equal(suggestCategory({ descricao: 'GitHub Copilot mensal' }), 'Software');
  assert.equal(suggestCategory({ descricao: 'Tarifa manutencao conta PJ' }), 'Bancos/Taxas');
  assert.equal(suggestCategory({ descricao: 'Posto Petrobras gasolina' }), 'Combustivel');
});

test('calcula confianca entre 0 e 1', () => {
  const high = calculateConfidence({ descricao: 'Google Workspace Microsoft' });
  const fallback = calculateConfidence({ descricao: 'Lancamento sem pista' });

  assert.ok(high > fallback);
  assert.ok(high <= 1);
  assert.ok(fallback >= 0);
});

test('usuario so revisa import proprio', async () => {
  await withReconciliationService({
    bank_imports: [
      { id: 'imp-1', user_id: 'user-2', filename: 'outro.csv' }
    ],
    movimentacoes: [
      { id: 'mov-1', user_id: 'user-2', import_id: 'imp-1', descricao: 'Uber', valor: 10, tipo: 'saida', data: '2026-06-01' }
    ]
  }, async ({ getImportReview }, mock) => {
    await assert.rejects(() => getImportReview('user-1', 'imp-1'), /Importacao nao encontrada/);
    assert.ok(mock.stats.filters.some((filter) => filter.table === 'bank_imports' && filter.column === 'user_id' && filter.value === 'user-1'));
  });
});

test('aceitar categoria altera categoria para sugestao', async () => {
  await withReconciliationService({
    movimentacoes: [{
      id: 'mov-1',
      user_id: 'user-1',
      descricao: 'Vercel Pro',
      valor: 100,
      tipo: 'saida',
      data: '2026-06-01',
      categoria: 'Outros',
      ai_category_suggestion: 'Software',
      category_confidence: 0.85
    }]
  }, async ({ acceptCategorySuggestion }, mock) => {
    await acceptCategorySuggestion('mov-1', 'user-1');

    const update = mock.stats.updates.find((item) => item.table === 'movimentacoes');
    assert.equal(update.payload.categoria, 'Software');
    assert.equal(update.payload.reconciliation_status, 'reviewed');
  });
});

test('ignorar altera status para ignored', async () => {
  await withReconciliationService({}, async ({ markAsIgnored }, mock) => {
    await markAsIgnored('mov-1', 'user-1');

    const update = mock.stats.updates.find((item) => item.table === 'movimentacoes');
    assert.equal(update.payload.reconciliation_status, 'ignored');
    assert.ok(update.filters.some((filter) => filter[1] === 'user_id' && filter[2] === 'user-1'));
  });
});

test('marcar revisada altera status para reviewed', async () => {
  await withReconciliationService({}, async ({ markAsReviewed }, mock) => {
    await markAsReviewed('mov-1', 'user-1');

    const update = mock.stats.updates.find((item) => item.table === 'movimentacoes');
    assert.equal(update.payload.reconciliation_status, 'reviewed');
  });
});

test('IA review retorna analise segura sem enviar identificadores sensiveis', async () => {
  await withReconciliationService({
    bank_imports: [{ id: 'imp-1', user_id: 'user-1', filename: 'extrato.csv' }],
    movimentacoes: [{
      id: 'mov-1',
      user_id: 'user-1',
      import_id: 'imp-1',
      external_id: 'bank-secret-1',
      descricao: 'Google Workspace',
      valor: 99,
      tipo: 'saida',
      categoria: 'Outros',
      data: '2026-06-01'
    }]
  }, async ({ analyzeImportWithAi }) => {
    process.env.GEMINI_API_KEY = 'test-key';
    let sentPayload = '';
    const model = {
      async generateContent(parts) {
        sentPayload = parts.join('\n');
        return { response: { text: () => 'Resumo seguro da FluxIA.' } };
      }
    };

    const result = await analyzeImportWithAi('user-1', 'imp-1', model);

    assert.equal(result.provider, 'gemini');
    assert.equal(result.analysis, 'Resumo seguro da FluxIA.');
    assert.doesNotMatch(sentPayload, /bank-secret-1/);
    assert.match(sentPayload, /Google Workspace/);
  });
});

test('rotas e migration de conciliacao estao registradas', () => {
  assert.match(importRoutes, /router\.get\('\/:importId\/review', asyncHandler\(importReview\)\)/);
  assert.match(importRoutes, /router\.post\('\/movimentacoes\/:id\/accept-category', asyncHandler\(acceptImportCategory\)\)/);
  assert.match(importRoutes, /router\.post\('\/movimentacoes\/:id\/ignore', asyncHandler\(ignoreImportedMovement\)\)/);
  assert.match(importRoutes, /router\.post\('\/movimentacoes\/:id\/reviewed', asyncHandler\(reviewImportedMovement\)\)/);
  assert.match(importRoutes, /router\.post\('\/:importId\/ai-review', asyncHandler\(importAiReview\)\)/);
  assert.match(reconciliationMigration, /reconciliation_status text/);
  assert.match(reconciliationMigration, /category_confidence numeric\(3,2\)/);
  assert.match(schema, /ai_category_suggestion text/);
  assert.match(schema, /duplicate_of uuid/);
});

test('frontend mostra botao revisar importacao e categoria sugerida', () => {
  assert.match(appHtml, /Revisao inteligente/);
  assert.match(appHtml, /Analisar importacao com IA/);
  assert.match(appJs, /openImportReview/);
  assert.match(appJs, /Revisar importacao/);
  assert.match(appJs, /Categoria sugerida/);
  assert.match(appJs, /acceptImportCategory/);
});
