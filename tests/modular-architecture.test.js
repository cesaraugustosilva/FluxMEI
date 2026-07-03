import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

const backendModules = [
  'auth',
  'payments',
  'subscriptions',
  'ai',
  'imports',
  'notifications',
  'admin',
  'coupons',
  'referrals',
  'exports',
  'audit'
];

const frontendModules = [
  'dashboard',
  'movimentacoes',
  'metas',
  'fluxia',
  'minha-conta',
  'notificacoes',
  'importacoes',
  'assinatura',
  'ui'
];

test('backend possui barrels modulares conservadores', () => {
  for (const moduleName of backendModules) {
    const file = join(root, 'backend', 'src', 'modules', moduleName, 'index.js');
    assert.equal(existsSync(file), true, `Modulo backend ausente: ${moduleName}`);
  }

  const aiBarrel = readFileSync(join(root, 'backend', 'src', 'modules', 'ai', 'index.js'), 'utf8');
  assert.match(aiBarrel, /financialIntelligenceService/);
  assert.match(aiBarrel, /aiRoutes/);
});

test('frontend possui estrutura modular documentada sem quebrar app.js', () => {
  for (const moduleName of frontendModules) {
    const file = join(root, 'frontend', 'app', 'modules', moduleName, 'README.md');
    assert.equal(existsSync(file), true, `Modulo frontend ausente: ${moduleName}`);
  }

  const appJs = readFileSync(join(root, 'frontend', 'app', 'app.js'), 'utf8');
  assert.match(appJs, /function renderPage/);
});

test('documentacao de arquitetura modular existe e preserva regra conservadora', () => {
  const doc = readFileSync(join(root, 'docs', 'arquitetura-modular.md'), 'utf8');
  assert.match(doc, /Arquitetura modular do FluxMEI/);
  assert.match(doc, /nao moveu logica critica/i);
  assert.match(doc, /endpoints publicos/);
});
