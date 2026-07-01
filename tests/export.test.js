import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSupabaseMock as createSupabaseMockBase } from './helpers/supabaseMock.js';

const exportRoutes = readFileSync(new URL('../backend/src/routes/exportRoutes.js', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../backend/src/server.js', import.meta.url), 'utf8');
const exportController = readFileSync(new URL('../backend/src/controllers/exportController.js', import.meta.url), 'utf8');
const appHtml = readFileSync(new URL('../frontend/app/index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../frontend/app/app.js', import.meta.url), 'utf8');

const rows = [
  {
    id: 'm1',
    user_id: 'user-1',
    data: '2026-06-01',
    tipo: 'entrada',
    categoria: 'Servico',
    descricao: 'Projeto site',
    valor: 1000,
    forma_pagamento: 'pix',
    observacao: 'cliente bom',
    provider_raw: { secret: true }
  },
  {
    id: 'm2',
    user_id: 'user-1',
    data: '2026-06-03',
    tipo: 'saida',
    categoria: 'Internet',
    descricao: 'Plano fibra',
    valor: 100,
    forma_pagamento: 'cartao',
    observacao: 'mensal'
  },
  {
    id: 'm3',
    user_id: 'user-2',
    data: '2026-06-04',
    tipo: 'saida',
    categoria: 'Outro usuario',
    descricao: 'Nao exportar',
    valor: 999,
    forma_pagamento: 'pix',
    observacao: 'privado'
  }
];

function createRes() {
  return {
    headers: {},
    body: null,
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    send(body) {
      this.body = body;
      return this;
    }
  };
}

function createSupabaseMock() {
  const sideEffects = createSupabaseMockBase({ rowsByTable: { audit_logs: [] } });
  const stats = { userId: null, selected: null, sideEffects: sideEffects.stats };
  return {
    stats,
    from(table) {
      if (table === 'audit_logs') return sideEffects.from(table);
      assert.equal(table, 'movimentacoes');
      return {
        select(fields) {
          stats.selected = fields;
          return this;
        },
        eq(column, value) {
          assert.equal(column, 'user_id');
          stats.userId = value;
          return this;
        },
        order() {
          return Promise.resolve({ data: rows.filter((row) => row.user_id === stats.userId), error: null });
        }
      };
    }
  };
}

async function withExportController(fn) {
  const [{ supabaseAdmin }, controller] = await Promise.all([
    import('../backend/src/config/supabase.js'),
    import(`../backend/src/controllers/exportController.js?export-${Date.now()}-${Math.random()}`)
  ]);
  const mock = createSupabaseMock();
  const originalFrom = supabaseAdmin.from;
  supabaseAdmin.from = mock.from;
  try {
    await fn(controller, mock.stats);
  } finally {
    supabaseAdmin.from = originalFrom;
  }
}

test('rotas de exportacao estao registradas e exigem autenticacao', () => {
  assert.match(serverSource, /apiRouter\.use\('\/export', exportRoutes\)/);
  assert.match(exportRoutes, /router\.use\(authMiddleware\)/);
  assert.match(exportRoutes, /router\.get\('\/movimentacoes\.csv', asyncHandler\(exportMovimentacoesCsv\)\)/);
  assert.match(exportRoutes, /router\.get\('\/movimentacoes\.json', asyncHandler\(exportMovimentacoesJson\)\)/);
  assert.match(exportRoutes, /router\.get\('\/resumo\.json', asyncHandler\(exportResumoJson\)\)/);
});

test('CSV contem apenas dados do usuario e campos seguros', async () => {
  await withExportController(async ({ exportMovimentacoesCsv }, stats) => {
    const res = createRes();
    await exportMovimentacoesCsv({ user: { id: 'user-1' }, headers: {}, ip: '127.0.0.1' }, res);

    assert.equal(stats.userId, 'user-1');
    assert.match(stats.selected, /data,tipo,categoria,descricao,valor,forma_pagamento,observacao/);
    assert.match(res.headers['content-type'], /text\/csv/);
    assert.match(res.body, /Projeto site/);
    assert.match(res.body, /Plano fibra/);
    assert.doesNotMatch(res.body, /Nao exportar|provider_raw|secret|user-2/);
    assert.equal(stats.sideEffects.inserts[0].table, 'audit_logs');
    assert.equal(stats.sideEffects.inserts[0].payload.action, 'export.movimentacoes_csv');
  });
});

test('JSON contem apenas dados do usuario e nao expõe sensiveis', async () => {
  await withExportController(async ({ exportMovimentacoesJson }) => {
    const res = createRes();
    await exportMovimentacoesJson({ user: { id: 'user-1' }, headers: {}, ip: '127.0.0.1' }, res);
    const payload = JSON.parse(res.body);

    assert.equal(payload.success, true);
    assert.equal(payload.movimentacoes.length, 2);
    assert.equal(payload.movimentacoes[0].descricao, 'Projeto site');
    assert.equal(Object.hasOwn(payload.movimentacoes[0], 'provider_raw'), false);
    assert.equal(Object.hasOwn(payload.movimentacoes[0], 'user_id'), false);
  });
});

test('resumo calcula corretamente totais e periodo', async () => {
  await withExportController(async ({ exportResumoJson }) => {
    const res = createRes();
    await exportResumoJson({ user: { id: 'user-1' }, headers: {}, ip: '127.0.0.1' }, res);
    const payload = JSON.parse(res.body);

    assert.equal(payload.resumo.total_receitas, 1000);
    assert.equal(payload.resumo.total_despesas, 100);
    assert.equal(payload.resumo.saldo, 900);
    assert.equal(payload.resumo.quantidade_movimentacoes, 2);
    assert.deepEqual(payload.resumo.metas, []);
    assert.deepEqual(payload.resumo.periodo, { inicio: '2026-06-01', fim: '2026-06-03' });
  });
});

test('controller registra auditoria de exportacao', async () => {
  assert.match(exportController, /export\.movimentacoes_csv/);
  assert.match(exportController, /export\.movimentacoes_json/);
  assert.match(exportController, /export\.resumo_json/);
  await withExportController(async ({ exportResumoJson }, stats) => {
    const res = createRes();
    await exportResumoJson({ user: { id: 'user-1' }, headers: {}, ip: '127.0.0.1' }, res);
    assert.equal(stats.sideEffects.inserts[0].payload.action, 'export.resumo_json');
    assert.equal(stats.sideEffects.inserts[0].payload.entity_type, 'export');
  });
});

test('frontend renderiza botoes de exportacao e nomes de arquivo', () => {
  assert.match(appHtml, /Exportar meus dados/);
  assert.match(appHtml, /id="exportCsvAction"/);
  assert.match(appHtml, /id="exportJsonAction"/);
  assert.match(appHtml, /id="exportSummaryAction"/);
  assert.match(appJs, /fluxmei-movimentacoes-\$\{date\}\.csv/);
  assert.match(appJs, /fluxmei-movimentacoes-\$\{date\}\.json/);
  assert.match(appJs, /fluxmei-resumo-\$\{date\}\.json/);
  assert.match(appJs, /fetchExportBlob/);
});
