import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appHtml = readFileSync(new URL('../frontend/app/index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../frontend/app/app.js', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../frontend/app/style.css', import.meta.url), 'utf8');

test('dashboard e Minha Conta possuem containers de avisos inteligentes', () => {
  assert.match(appHtml, /id="dashboardSmartAlerts"/);
  assert.match(appHtml, /id="accountSmartAlerts"/);
  assert.match(appJs, /function renderSmartAlerts\(rootId, options = \{\}\)/);
  assert.match(appJs, /renderSmartAlerts\('dashboardSmartAlerts', \{ includeActive: true \}\)/);
  assert.match(appJs, /renderSmartAlerts\('accountSmartAlerts', \{ includeActive: true \}\)/);
});

test('aviso de assinatura vencendo usa limites de 7 e 3 dias', () => {
  assert.match(appJs, /id: 'assinatura-vence'/);
  assert.match(appJs, /dias <= 7/);
  assert.match(appJs, /dias <= 3/);
  assert.match(appJs, /Seu plano vence em \$\{dias\} dia\(s\)\. Evite interrupções renovando sua assinatura\./);
  assert.match(appJs, /actionLabel: 'Renovar agora'/);
});

test('aviso de pagamento pendente mostra metodo valor e data', () => {
  assert.match(appJs, /id: 'pagamento-pendente'/);
  assert.match(appJs, /Existe um pagamento aguardando confirmação\./);
  assert.match(appJs, /Metodo: \$\{method\.label\}\. Valor: \$\{value\}\. Data: \$\{date\}\./);
  assert.match(appJs, /actionLabel: 'Ver pagamento'/);
});

test('aviso de cancelamento agendado permite reativar', () => {
  assert.match(appJs, /id: 'cancelamento-agendado'/);
  assert.match(appJs, /Sua assinatura será encerrada em/);
  assert.match(appJs, /actionLabel: 'Reativar assinatura'/);
  assert.match(appJs, /action === 'reactivate'/);
});

test('avisos de trial expirando e expirado existem', () => {
  assert.match(appJs, /id: 'trial-fim'/);
  assert.match(appJs, /Seu período gratuito termina em \$\{dias\} dia\(s\)\./);
  assert.match(appJs, /id: 'trial-expirado'/);
  assert.match(appJs, /Seu período de teste terminou\./);
  assert.match(appJs, /actionLabel: 'Escolher plano'/);
});

test('assinatura ativa exibe card positivo', () => {
  assert.match(appJs, /id: 'assinatura-ativa'/);
  assert.match(appJs, /Seu plano está ativo\./);
  assert.match(appJs, /tone: 'success'/);
  assert.match(appJs, /Status: Ativo/);
});

test('estilos dos avisos cobrem tons verde amarelo vermelho e azul', () => {
  assert.match(appCss, /\.smart-alert\.success/);
  assert.match(appCss, /\.smart-alert\.warning/);
  assert.match(appCss, /\.smart-alert\.danger/);
  assert.match(appCss, /\.smart-alert\.info/);
  assert.match(appJs, /data-smart-alert-close/);
});
