import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBankStatement } from '../backend/src/services/bankImportService.js';
import { detectBank } from '../backend/src/services/importers/bankDetector.js';
import { createSupabaseMock as createSupabaseMockBase } from './helpers/supabaseMock.js';

const detectorMigration = readFileSync(new URL('../backend/database/migrate_bank_detector.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../backend/database/schema.sql', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../frontend/app/app.js', import.meta.url), 'utf8');

function createImportMock(rowsByTable = {}) {
  return createSupabaseMockBase({
    rowsByTable: {
      bank_imports: [],
      movimentacoes: [],
      ...rowsByTable
    }
  });
}

async function withImportService(rowsByTable, fn) {
  const [{ supabaseAdmin }, service] = await Promise.all([
    import('../backend/src/config/supabase.js'),
    import(`../backend/src/services/bankImportService.js?bank-detector-${Date.now()}-${Math.random()}`)
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

test('detecta e parseia Nubank por nome e headers', () => {
  const parsed = parseBankStatement({
    filename: 'nubank-2026.csv',
    file_type: 'csv',
    content: 'date,title,amount\n2026-06-01,Google Workspace,-49.90'
  });

  assert.equal(parsed.bank_name, 'Nubank');
  assert.equal(parsed.parser_used, 'Nubank Importer');
  assert.equal(parsed.optimized_import, true);
  assert.equal(parsed.rows[0].descricao, 'Google Workspace');
});

test('detecta Inter por conteudo e adapta colunas', () => {
  const parsed = parseBankStatement({
    filename: 'extrato.csv',
    file_type: 'csv',
    content: 'Data Lancamento;Historico;Valor Lancamento\n01/06/2026;Banco Inter Pix recebido;250,00'
  });

  assert.equal(parsed.bank_name, 'Banco Inter');
  assert.equal(parsed.parser_used, 'Inter Importer');
  assert.equal(parsed.rows[0].descricao, 'Banco Inter Pix recebido');
});

test('detecta Mercado Pago', () => {
  const detection = detectBank('mercado-pago.csv', ['Data de liberacao', 'Numero de operacao', 'Valor liquido'], '');

  assert.equal(detection.bankName, 'Mercado Pago');
  assert.equal(detection.parserUsed, 'Mercado Pago Importer');
  assert.ok(detection.confidence >= 0.5);
});

test('detecta Itau com acento no conteudo', () => {
  const parsed = parseBankStatement({
    filename: 'extrato.csv',
    file_type: 'csv',
    content: 'Data,Lancamento,Valor\n02/06/2026,Compra debito Itaú,-35.90'
  });

  assert.equal(parsed.bank_name, 'Itau');
  assert.equal(parsed.parser_used, 'Itau Importer');
});

test('CSV desconhecido usa parser generico', () => {
  const parsed = parseBankStatement({
    filename: 'extrato.csv',
    file_type: 'csv',
    content: 'data,descricao,valor\n2026-06-01,Cliente A,100'
  });

  assert.equal(parsed.bank_name, 'Banco nao identificado');
  assert.equal(parsed.parser_used, 'Parser Generico');
  assert.equal(parsed.optimized_import, false);
});

test('OFX detecta banco pelo conteudo sem confiar apenas na extensao', () => {
  const parsed = parseBankStatement({
    filename: 'download.ofx',
    file_type: 'ofx',
    content: '<OFX><FI><ORG>Banco Inter</ORG></FI><BANKTRANLIST><STMTTRN><DTPOSTED>20260601</DTPOSTED><TRNAMT>-45.90</TRNAMT><FITID>ofx-1</FITID><MEMO>Uber</MEMO></STMTTRN></BANKTRANLIST></OFX>'
  });

  assert.equal(parsed.bank_name, 'Banco Inter');
  assert.equal(parsed.rows[0].external_id, 'ofx-1');
});

test('importacao salva banco parser e confianca no historico', async () => {
  await withImportService({}, async ({ importBankStatement, listBankImportHistory }, mock) => {
    const result = await importBankStatement('user-1', {
      filename: 'nubank.csv',
      file_type: 'csv',
      content: 'date,title,amount\n2026-06-01,Canva Pro,-34.90'
    });

    assert.equal(result.bank_name, 'Nubank');
    const importInsert = mock.stats.inserts.find((item) => item.table === 'bank_imports');
    assert.equal(importInsert.payload.bank_name, 'Nubank');
    assert.equal(importInsert.payload.parser_used, 'Nubank Importer');

    const history = await listBankImportHistory('user-1');
    assert.equal(history[0].bank_name, 'Nubank');
  });
});

test('migration schema e frontend exibem metadados do detector', () => {
  assert.match(detectorMigration, /bank_name text/);
  assert.match(detectorMigration, /parser_used text/);
  assert.match(detectorMigration, /confidence numeric\(3,2\)/);
  assert.match(schema, /bank_name text/);
  assert.match(appJs, /Banco identificado/);
  assert.match(appJs, /Importacao otimizada/);
  assert.match(appJs, /Parser Generico/);
});
