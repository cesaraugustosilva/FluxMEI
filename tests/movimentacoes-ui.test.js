import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appHtml = readFileSync(new URL('../frontend/app/index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../frontend/app/app.js', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../frontend/app/style.css', import.meta.url), 'utf8');
const movimentacaoRoutes = readFileSync(new URL('../backend/src/routes/movimentacaoRoutes.js', import.meta.url), 'utf8');

test('area de movimentacoes renderiza hero premium e acoes principais', () => {
  assert.match(appHtml, /id="page-movimentacoes"/);
  assert.match(appHtml, /Controle receitas, despesas e acompanhe o fluxo do seu MEI\./);
  assert.match(appHtml, /Nova receita/);
  assert.match(appHtml, /Nova despesa/);
  assert.match(appHtml, /Importar extrato/);
  assert.match(appHtml, /Em breve/);
});

test('movimentacoes possui cards de resumo e filtros premium', () => {
  assert.match(appHtml, /id="sumEntrada"/);
  assert.match(appHtml, /id="sumSaida"/);
  assert.match(appHtml, /id="sumSaldo"/);
  assert.match(appHtml, /id="sumQuantidade"/);
  assert.match(appHtml, /id="filtroTipo"/);
  assert.match(appHtml, /id="filtroCategoria"/);
  assert.match(appHtml, /id="filtroMes"/);
  assert.match(appHtml, /id="filtroTexto"/);
  assert.match(appHtml, /id="filtroValorMin"/);
  assert.match(appHtml, /id="filtroValorMax"/);
  assert.match(appHtml, /id="limparFiltrosMov"/);
  assert.match(appJs, /function limparFiltrosMovimentacoes/);
  assert.match(appJs, /filtroValorMin/);
  assert.match(appJs, /filtroValorMax/);
});

test('tabela desktop e cards mobile de movimentacoes continuam com handlers', () => {
  assert.match(appHtml, /id="movTable"/);
  assert.match(appHtml, /id="movTableBody"/);
  assert.match(appHtml, /id="movMobileList"/);
  assert.match(appJs, /class="movement-mobile-card/);
  assert.match(appJs, /onclick="editarMov\('\$\{m\.id\}'\)"/);
  assert.match(appJs, /onclick="excluirMov\('\$\{m\.id\}'\)"/);
  assert.match(appJs, /Duplicar/);
  assert.match(appCss, /\.movements-mobile-list/);
});

test('estado vazio de movimentacoes possui CTAs de receita e despesa', () => {
  assert.match(appHtml, /id="movEmpty"/);
  assert.match(appHtml, /Você ainda não cadastrou nenhuma movimentação\./);
  assert.match(appHtml, /Adicionar receita/);
  assert.match(appHtml, /Adicionar despesa/);
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
