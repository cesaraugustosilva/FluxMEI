import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appHtml = readFileSync(new URL('../frontend/app/index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../frontend/app/app.js', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../frontend/app/style.css', import.meta.url), 'utf8');

test('Metas Financeiras renderiza tela simples restaurada e indicadores principais', () => {
  assert.match(appHtml, /id="page-metas"/);
  assert.match(appHtml, /Metas Financeiras/);
  assert.match(appHtml, /Defina objetivos e acompanhe sua evolucao financeira\./);
  assert.match(appHtml, /id="goalsTotal"/);
  assert.match(appHtml, /id="goalsDone"/);
  assert.match(appHtml, /id="goalsRemaining"/);
  assert.match(appHtml, /id="newGoalButton"/);
});

test('Metas possui cards e barra de progresso sem depender de backend', () => {
  assert.match(appHtml, /id="goalsGrid"/);
  assert.match(appJs, /function renderMetas\(\)/);
  assert.match(appJs, /class="dash-card goal-card"/);
  assert.match(appJs, /class="goal-progress-track"/);
  assert.match(appJs, /width:\$\{goal\.percent\}%/);
  assert.match(appCss, /\.goal-progress-track span/);
});

test('Metas mostra FluxIA recomenda usando dados existentes', () => {
  assert.match(appHtml, /id="goalsFluxiaInsight"/);
  assert.match(appHtml, /FluxIA recomenda/);
  assert.match(appJs, /function renderGoalFluxiaInsight/);
  assert.match(appJs, /Cadastre movimentacoes para receber previsoes da FluxIA\./);
  assert.match(appJs, /Se mantiver sua media atual/);
  assert.doesNotMatch(appJs, /\/api\/ai\/chat.*goalsFluxiaInsight/s);
});

test('Metas possui estado vazio e exemplos rapidos', () => {
  assert.match(appHtml, /id="goalsEmpty"/);
  assert.match(appHtml, /Voce ainda nao criou nenhuma meta financeira\./);
  assert.match(appHtml, /Criar primeira meta/);
  assert.match(appHtml, /Explorar exemplos/);
  assert.match(appHtml, /Comprar notebook/);
  assert.match(appHtml, /Capital de giro/);
  assert.match(appHtml, /Reserva de emergencia/);
  assert.match(appJs, /function preencherExemploMeta/);
});

test('Modal de metas preserva IDs e handlers principais', () => {
  assert.match(appHtml, /id="modalMeta"/);
  assert.match(appHtml, /id="metaId"/);
  assert.match(appHtml, /id="metaNome"/);
  assert.match(appHtml, /id="metaValor"/);
  assert.match(appHtml, /id="metaPrazo"/);
  assert.match(appHtml, /id="metaDescricao"/);
  assert.match(appHtml, /onclick="salvarMeta\(\)"/);
  assert.match(appJs, /function openNovaMeta/);
  assert.match(appJs, /function salvarMeta/);
  assert.match(appJs, /function editarMeta/);
  assert.match(appJs, /function excluirMeta/);
});

test('Metas nao cria novas chamadas ao backend', () => {
  assert.match(appJs, /const FINANCIAL_GOALS_KEY = 'fluxmei_financial_goals'/);
  assert.match(appJs, /localStorage\.setItem\(FINANCIAL_GOALS_KEY/);
  assert.doesNotMatch(appJs, /apiRequest\('\/metas/);
  assert.doesNotMatch(appJs, /apiRequest\(`\/metas/);
});
