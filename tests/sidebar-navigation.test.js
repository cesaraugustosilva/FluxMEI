import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appHtml = readFileSync(new URL('../frontend/app/index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../frontend/app/app.js', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../frontend/app/style.css', import.meta.url), 'utf8');

test('sidebar premium renderiza logo FluxMEI e grupos de navegacao', () => {
  assert.match(appHtml, /class="brand-lockup"[^>]*data-page="dashboard"/);
  assert.match(appHtml, /<span class="brand-name">FluxMEI<\/span>/);
  assert.match(appHtml, />Principal<\/span>/);
  assert.match(appHtml, />Conta<\/span>/);
  assert.match(appHtml, />Sistema<\/span>/);
  assert.match(appHtml, />Dashboard<\/span>/);
  assert.match(appHtml, />Movimentações<\/span>/);
  assert.match(appHtml, />Metas<\/span>/);
  assert.match(appHtml, />FluxIA<\/span>/);
});

test('sidebar preserva navegacao e item ativo acessivel', () => {
  assert.match(appHtml, /class="nav-item active" data-page="dashboard" aria-current="page"/);
  assert.match(appHtml, /data-page="movimentacoes"/);
  assert.match(appHtml, /data-page="assistente"/);
  assert.match(appHtml, /data-page="configuracoes"/);
  assert.match(appJs, /document\.querySelectorAll\('\.nav-item, \.bottom-item'\)/);
  assert.match(appJs, /setAttribute\('aria-current', 'page'\)/);
});

test('perfil do usuario e CTA de assinatura aparecem na sidebar', () => {
  assert.match(appHtml, /id="sidebarUserName"/);
  assert.match(appHtml, /id="sidebarUserEmail"/);
  assert.match(appHtml, /id="sidebarUserPlan"/);
  assert.match(appHtml, /id="sidebarUserStatus"/);
  assert.match(appHtml, /id="sidebarUpgradeCta"/);
  assert.match(appHtml, /Continue usando o FluxMEI Pro/);
  assert.match(appJs, /function renderSidebarUpgradeCta/);
  assert.match(appJs, /estado === 'teste_gratis'/);
});

test('acoes laterais mantem conta indicacao exportacao e suporte sem novas rotas', () => {
  assert.match(appHtml, /data-sidebar-action="account"/);
  assert.match(appHtml, /data-sidebar-action="referral"/);
  assert.match(appHtml, /data-sidebar-action="export"/);
  assert.match(appHtml, /data-sidebar-action="support"/);
  assert.match(appJs, /function handleSidebarAction/);
  assert.match(appJs, /openAccountSection\(action\)/);
  assert.match(appJs, /#accountReferralCard/);
  assert.match(appJs, /\.account-export-card/);
});

test('menu mobile preserva navegacao com overlay e aria-expanded', () => {
  assert.match(appHtml, /id="hamburger"[^>]*aria-controls="sidebar"[^>]*aria-expanded="false"/);
  assert.match(appHtml, /id="mobileOverlay" aria-hidden="true"/);
  assert.match(appJs, /function setMobileMenuState/);
  assert.match(appJs, /setAttribute\('aria-expanded', open \? 'true' : 'false'\)/);
  assert.match(appJs, /event\.key === 'Escape'/);
  assert.match(appCss, /\.sidebar\.mobile-open \{ transform: translateX\(0\); \}/);
});
