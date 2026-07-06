import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appHtml = readFileSync(new URL('../frontend/app/index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../frontend/app/app.js', import.meta.url), 'utf8');
const movimentacaoRoutes = readFileSync(new URL('../backend/src/routes/movimentacaoRoutes.js', import.meta.url), 'utf8');

test('area de movimentacoes voltou ao visual antigo e renderiza a tela', () => {
  assert.match(appHtml, /id="page-movimentacoes"/);
  assert.match(appHtml, /<h1 class="page-title">Movimenta/);
  assert.match(appHtml, /Controle de entradas e/);
  assert.match(appHtml, /onclick="openNovaMovimentacao\(\)"/);
});

test('movimentacoes preserva resumo e filtros antigos', () => {
  assert.match(appHtml, /id="sumEntrada"/);
  assert.match(appHtml, /id="sumSaida"/);
  assert.match(appHtml, /id="sumSaldo"/);
  assert.match(appHtml, /id="filtroTipo"/);
  assert.match(appHtml, /id="filtroCategoria"/);
  assert.match(appHtml, /id="filtroMes"/);
  assert.match(appHtml, /id="filtroTexto"/);
  assert.doesNotMatch(appHtml, /id="filtroValorMin"/);
  assert.doesNotMatch(appHtml, /id="filtroValorMax"/);
});

test('tabela de movimentacoes continua com handlers de editar e excluir', () => {
  assert.match(appHtml, /id="movTable"/);
  assert.match(appHtml, /id="movTableBody"/);
  assert.match(appJs, /onclick="editarMov\('\$\{m\.id\}'\)"/);
  assert.match(appJs, /onclick="excluirMov\('\$\{m\.id\}'\)"/);
});

test('estado vazio de movimentacoes preserva ID usado pelo render', () => {
  assert.match(appHtml, /id="movEmpty"/);
  assert.match(appHtml, /Nenhuma movimenta/);
  assert.match(appHtml, /Nova movimenta/);
  assert.doesNotMatch(appHtml, /Importar extrato/);
  assert.match(appJs, /const empty = document\.getElementById\('movEmpty'\)/);
});

test('movimentacoes renderiza cards mobile sem remover tabela desktop', () => {
  assert.match(appHtml, /id="movTable"/);
  assert.match(appHtml, /id="movMobileList"/);
  assert.match(appJs, /const mobileList = document\.getElementById\('movMobileList'\)/);
  assert.match(appJs, /class="mov-mobile-card"/);
});

test('opcoes de importacao ficam ocultas na tela de movimentacoes', () => {
  assert.doesNotMatch(appHtml, /class="import-dashboard-card import-compact-panel"/);
  assert.doesNotMatch(appHtml, /id="importDashboardCompact"/);
  assert.doesNotMatch(appHtml, /class="import-templates-card import-compact-panel"/);
  assert.doesNotMatch(appHtml, /class="import-history-card import-compact-panel"/);
  assert.doesNotMatch(appHtml, /id="modalImportacao"/);
  assert.doesNotMatch(appHtml, /id="modalImportReview"/);
  assert.doesNotMatch(appHtml, /data-open-import/);
});

test('formulario de movimentacao preserva IDs e handlers atuais', () => {
  assert.match(appHtml, /id="modalMovimentacao"/);
  assert.match(appHtml, /id="btnEntrada"/);
  assert.match(appHtml, /id="btnSaida"/);
  assert.match(appHtml, /id="movDesc"/);
  assert.match(appHtml, /id="movValor"/);
  assert.match(appHtml, /id="movCategoria"/);
  assert.match(appHtml, /id="movData"/);
  assert.match(appHtml, /id="movCliente"/);
  assert.match(appHtml, /id="movObs"/);
  assert.match(appHtml, /onclick="salvarMovimentacao\(\)"/);
  assert.match(appJs, /function setTipo\(tipo\)/);
  assert.match(appJs, /function salvarMovimentacao\(\)/);
});

test('rotas de movimentacoes seguem autenticadas no backend', () => {
  assert.match(movimentacaoRoutes, /router\.use\(authMiddleware\)/);
});
