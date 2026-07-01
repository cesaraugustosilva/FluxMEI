import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function readJson(path) {
  return JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
}

describe('build and deploy standardization', () => {
  it('keeps the root package as an orchestrator', () => {
    const pkg = readJson('package.json');

    assert.deepEqual(pkg.workspaces, ['backend', 'frontend']);
    assert.deepEqual(pkg.dependencies, {});

    for (const script of ['dev', 'dev:backend', 'dev:frontend', 'build', 'build:frontend', 'test', 'test:backend', 'lint', 'check-env', 'deploy-check']) {
      assert.ok(pkg.scripts[script], `missing root script ${script}`);
    }
  });

  it('keeps backend runtime dependencies in backend/package.json', () => {
    const pkg = readJson('backend/package.json');

    for (const dep of ['express', '@supabase/supabase-js', '@google/generative-ai', 'sdk-node-apis-efi']) {
      assert.ok(pkg.dependencies[dep], `missing backend dependency ${dep}`);
    }

    assert.ok(pkg.scripts.start);
    assert.ok(pkg.scripts.dev);
    assert.ok(pkg.scripts.test);
  });

  it('keeps frontend build scripts in frontend/package.json', () => {
    const pkg = readJson('frontend/package.json');

    assert.equal(pkg.scripts.build, 'node scripts/write-env.js');
    assert.equal(pkg.scripts.dev, 'node scripts/serve.js');
  });

  it('documents required deploy environment checks', () => {
    const deployCheck = readFileSync(new URL('../scripts/deploy-check.js', import.meta.url), 'utf8');

    for (const envName of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ASAAS_API_KEY', 'FLUXMEI_API_URL', 'FLUXMEI_PAYMENT_GATEWAY']) {
      assert.match(deployCheck, new RegExp(envName));
    }
  });
});
