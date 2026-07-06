import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { createSupabaseMock as createSupabaseMockBase } from './helpers/supabaseMock.js';
import { parseBankStatement } from '../backend/src/services/bankImportService.js';

const importRoutes = readFileSync(new URL('../backend/src/routes/importRoutes.js', import.meta.url), 'utf8');
const importMigration = readFileSync(new URL('../backend/database/migrate_bank_imports.sql', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../backend/src/server.js', import.meta.url), 'utf8');
const appHtml = readFileSync(new URL('../frontend/app/index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../frontend/app/app.js', import.meta.url), 'utf8');

function makeXlsxBase64(rows) {
  const headers = Object.keys(rows[0] || {});
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const xmlCell = (rowIndex, colIndex, value) => (
    `<c r="${letters[colIndex]}${rowIndex}" t="inlineStr"><is><t>${String(value)}</t></is></c>`
  );
  const xmlRows = [
    `<row r="1">${headers.map((header, index) => xmlCell(1, index, header)).join('')}</row>`,
    ...rows.map((row, rowIndex) => (
      `<row r="${rowIndex + 2}">${headers.map((header, colIndex) => xmlCell(rowIndex + 2, colIndex, row[header] ?? '')).join('')}</row>`
    ))
  ].join('');
  const files = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Extrato" sheetId="1" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xmlRows}</sheetData></worksheet>`)
  };

  return Buffer.from(zipSync(files)).toString('base64');
}

function createImportMock(rowsByTable = {}) {
  const mock = createSupabaseMockBase({
    rowsByTable: {
      bank_imports: [],
      movimentacoes: [],
      ...rowsByTable
    }
  });
  return mock;
}

async function withImportService(rowsByTable, fn) {
  const [{ supabaseAdmin }, service] = await Promise.all([
    import('../backend/src/config/supabase.js'),
    import(`../backend/src/services/bankImportService.js?bank-import-${Date.now()}-${Math.random()}`)
  ]);
  const mock = createImportMock(rowsByTable);
  const originalFrom = supabaseAdmin.from;
  supabaseAdmin.from = mock.from;
  try {
    await fn(service, mock);
  } finally {
    supabaseAdmin.from = originalFrom;
  }
}

test('CSV com virgula importa colunas comuns', () => {
  const parsed = parseBankStatement({
    filename: 'extrato.csv',
    file_type: 'csv',
    content: 'data,descricao,valor\n2026-06-01,Projeto site,1234.56'
  });

  assert.equal(parsed.rows[0].data, '2026-06-01');
  assert.equal(parsed.rows[0].descricao, 'Projeto site');
  assert.equal(parsed.rows[0].valor, 1234.56);
  assert.equal(parsed.rows[0].tipo, 'entrada');
});

test('CSV com ponto e virgula aceita valor brasileiro', () => {
  const parsed = parseBankStatement({
    filename: 'extrato.csv',
    file_type: 'csv',
    content: 'data;descricao;valor\n01/06/2026;Mercado Central;R$ 1.234,56'
  });

  assert.equal(parsed.rows[0].valor, 1234.56);
  assert.equal(parsed.rows[0].categoria, 'Alimentacao');
});

test('valor negativo vira despesa', () => {
  const parsed = parseBankStatement({
    filename: 'extrato.csv',
    file_type: 'csv',
    content: 'date,description,amount\n2026-06-02,Uber viagem,-45.90'
  });

  assert.equal(parsed.rows[0].tipo, 'saida');
  assert.equal(parsed.rows[0].valor, 45.9);
  assert.equal(parsed.rows[0].categoria, 'Transporte');
});

test('OFX com FITID evita duplicata', async () => {
  const ofx = '<OFX><BANKTRANLIST><STMTTRN><DTPOSTED>20260601</DTPOSTED><TRNAMT>-45.90</TRNAMT><FITID>abc-1</FITID><MEMO>Posto Shell</MEMO></STMTTRN></BANKTRANLIST></OFX>';

  await withImportService({
    movimentacoes: [{
      user_id: 'user-1',
      data: '2026-06-01',
      valor: 45.9,
      descricao: 'Posto Shell',
      external_id: 'abc-1'
    }]
  }, async ({ importBankStatement }, mock) => {
    const result = await importBankStatement('user-1', {
      filename: 'extrato.ofx',
      file_type: 'ofx',
      content: ofx
    });

    assert.equal(result.imported_count, 0);
    assert.equal(result.skipped_count, 1);
    assert.equal(mock.stats.inserts.filter((item) => item.table === 'movimentacoes').length, 0);
  });
});

test('XLSX basico extrai primeira planilha', () => {
  const parsed = parseBankStatement({
    filename: 'extrato.xlsx',
    file_type: 'xlsx',
    content: makeXlsxBase64([{ data: '2026-06-03', descricao: 'Google Workspace', valor: '-100.50' }])
  });

  assert.equal(parsed.rows[0].data, '2026-06-03');
  assert.equal(parsed.rows[0].tipo, 'saida');
  assert.equal(parsed.rows[0].categoria, 'Software');
});

test('arquivo invalido e rejeitado', () => {
  assert.throws(() => parseBankStatement({
    filename: 'extrato.txt',
    file_type: 'txt',
    content: 'abc'
  }), /Formato de arquivo nao suportado/);
});

test('duplicatas por combinacao sao ignoradas', async () => {
  await withImportService({
    movimentacoes: [{
      user_id: 'user-1',
      data: '2026-06-04',
      valor: 200,
      descricao: 'Cliente A',
      external_id: null
    }]
  }, async ({ importBankStatement }, mock) => {
    const result = await importBankStatement('user-1', {
      filename: 'extrato.csv',
      file_type: 'csv',
      content: 'data,descricao,valor\n2026-06-04,Cliente A,200\n2026-06-05,Cliente B,300'
    });

    assert.equal(result.imported_count, 1);
    assert.equal(result.skipped_count, 1);
    const movementInsert = mock.stats.inserts.find((item) => item.table === 'movimentacoes');
    assert.equal(movementInsert.payload.length, 1);
    assert.equal(movementInsert.payload[0].source, 'bank_import');
  });
});

test('historico so consulta imports do usuario', async () => {
  await withImportService({
    bank_imports: [
      { id: 'i1', user_id: 'user-1', filename: 'a.csv' },
      { id: 'i2', user_id: 'user-2', filename: 'b.csv' }
    ]
  }, async ({ listBankImportHistory }, mock) => {
    const history = await listBankImportHistory('user-1');

    assert.equal(history.length, 1);
    assert.equal(history[0].filename, 'a.csv');
    assert.ok(mock.stats.filters.some((filter) => filter.table === 'bank_imports' && filter.column === 'user_id' && filter.value === 'user-1'));
  });
});

test('dashboard de importacoes retorna apenas dados do usuario', async () => {
  await withImportService({
    bank_imports: [
      { id: 'i1', user_id: 'user-1', filename: 'nubank.csv', file_type: 'csv', imported_count: 2, skipped_count: 1, bank_name: 'Nubank', parser_used: 'Nubank Importer', confidence: 0.9, created_at: '2026-06-02T10:00:00Z' },
      { id: 'i2', user_id: 'user-2', filename: 'inter.csv', file_type: 'csv', imported_count: 8, skipped_count: 0, bank_name: 'Banco Inter', parser_used: 'Inter Importer', confidence: 0.95, created_at: '2026-06-03T10:00:00Z' }
    ],
    movimentacoes: [
      { id: 'm1', user_id: 'user-1', source: 'bank_import', import_id: 'i1', reconciliation_status: 'imported', category_confidence: 0.8 },
      { id: 'm2', user_id: 'user-1', source: 'bank_import', import_id: 'i1', reconciliation_status: 'reviewed', category_confidence: 0.6 },
      { id: 'm3', user_id: 'user-2', source: 'bank_import', import_id: 'i2', reconciliation_status: 'imported', category_confidence: 0.2 }
    ]
  }, async ({ getImportDashboard }, mock) => {
    const dashboard = await getImportDashboard('user-1');

    assert.equal(dashboard.total_imports, 1);
    assert.equal(dashboard.total_imported_movements, 2);
    assert.equal(dashboard.identified_banks[0].bank_name, 'Nubank');
    assert.ok(mock.stats.filters.some((filter) => filter.table === 'bank_imports' && filter.column === 'user_id' && filter.value === 'user-1'));
    assert.ok(mock.stats.filters.some((filter) => filter.table === 'movimentacoes' && filter.column === 'user_id' && filter.value === 'user-1'));
  });
});

test('dashboard de importacoes calcula metricas corretamente', async () => {
  await withImportService({
    bank_imports: [
      { id: 'i1', user_id: 'user-1', filename: 'nubank.csv', file_type: 'csv', imported_count: 3, skipped_count: 2, bank_name: 'Nubank', parser_used: 'Nubank Importer', confidence: 0.8, created_at: '2026-06-03T10:00:00Z' },
      { id: 'i2', user_id: 'user-1', filename: 'inter.csv', file_type: 'csv', imported_count: 1, skipped_count: 0, bank_name: 'Banco Inter', parser_used: 'Inter Importer', confidence: 0.6, created_at: '2026-06-01T10:00:00Z' },
      { id: 'i3', user_id: 'user-1', filename: 'nubank-2.csv', file_type: 'csv', imported_count: 1, skipped_count: 1, bank_name: 'Nubank', parser_used: 'Nubank Importer', confidence: 1, created_at: '2026-06-02T10:00:00Z' }
    ],
    movimentacoes: [
      { id: 'm1', user_id: 'user-1', source: 'bank_import', reconciliation_status: 'imported', category_confidence: 0.5 },
      { id: 'm2', user_id: 'user-1', source: 'bank_import', reconciliation_status: 'reviewed', category_confidence: 0.7 },
      { id: 'm3', user_id: 'user-1', source: 'bank_import', reconciliation_status: 'reconciled', category_confidence: 0.9 },
      { id: 'm4', user_id: 'user-1', source: 'bank_import', reconciliation_status: 'duplicated', category_confidence: 0.3 },
      { id: 'm5', user_id: 'user-1', source: 'bank_import', reconciliation_status: 'ignored', category_confidence: 0.6, duplicate_of: 'm1' }
    ]
  }, async ({ getImportDashboard }) => {
    const dashboard = await getImportDashboard('user-1');

    assert.equal(dashboard.total_imports, 3);
    assert.equal(dashboard.total_imported_movements, 5);
    assert.equal(dashboard.total_skipped, 3);
    assert.equal(dashboard.pending_review, 1);
    assert.equal(dashboard.reviewed, 2);
    assert.equal(dashboard.probable_duplicates, 2);
    assert.equal(dashboard.identified_banks[0].bank_name, 'Nubank');
    assert.equal(dashboard.identified_banks[0].count, 2);
    assert.equal(dashboard.parser_confidence_avg, 0.8);
    assert.equal(dashboard.category_confidence_avg, 0.6);
    assert.equal(dashboard.recent_imports.length, 3);
  });
});

test('rotas e migration de importacao estao registradas', () => {
  assert.match(serverSource, /apiRouter\.use\('\/import', importRoutes\)/);
  assert.match(importRoutes, /router\.use\(authMiddleware\)/);
  assert.match(importRoutes, /router\.use\(checkSubscriptionAccess\)/);
  assert.match(importRoutes, /router\.post\('\/bank-statement', asyncHandler\(importBankStatementController\)\)/);
  assert.match(importRoutes, /router\.get\('\/history', asyncHandler\(importHistory\)\)/);
  assert.match(importRoutes, /router\.get\('\/dashboard', asyncHandler\(importDashboard\)\)/);
  assert.match(importMigration, /create table if not exists public\.bank_imports/);
  assert.match(importMigration, /external_id text/);
  assert.match(importMigration, /source text/);
});

test('frontend preserva codigo de importacao sem expor UI publica', () => {
  assert.doesNotMatch(appHtml, /Importar extrato/);
  assert.doesNotMatch(appHtml, /id="modalImportacao"/);
  assert.doesNotMatch(appHtml, /id="bankImportFile"/);
  assert.doesNotMatch(appHtml, /id="importHistoryList"/);
  assert.match(appJs, /apiRequest\('\/import\/bank-statement'/);
  assert.match(appJs, /Recurso de importacao bancaria preservado para fase futura/);
  assert.doesNotMatch(appJs, /apiRequest\('\/import\/history'\)/);
});

test('frontend nao renderiza dashboard de importacoes automaticamente', () => {
  assert.doesNotMatch(appHtml, /Dashboard de Importa(?:c|ç)(?:o|õ)es/);
  assert.doesNotMatch(appHtml, /id="importDashboardCompact"/);
  assert.doesNotMatch(appHtml, /id="importDashboardCards"/);
  assert.doesNotMatch(appHtml, /id="importDashboardRecent"/);
  assert.doesNotMatch(appHtml, /id="importDashboardBanks"/);
  assert.doesNotMatch(appJs, /apiRequest\('\/import\/dashboard'\)/);
  assert.match(appJs, /Importacoes realizadas/);
});

test('frontend preserva acao futura de revisar importacao com importId correto', () => {
  assert.match(appJs, /onclick="openImportReview\('\$\{item\.id\}'\)">Revisar importacao<\/button>/);
});
