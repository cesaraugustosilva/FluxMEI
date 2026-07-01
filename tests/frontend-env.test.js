import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildPublicConfig,
  serializePublicConfig,
  writeEnvFile
} from '../frontend/scripts/write-env.js';

test('write-env gera API_URL correta para o frontend', () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'fluxmei-env-'));
  const outputPath = join(outputDir, 'env.js');

  const config = writeEnvFile({
    outputPath,
    env: {
      NODE_ENV: 'production',
      FLUXMEI_API_URL: 'https://api.fluxmei.com.br/api/',
      FLUXMEI_PAYMENT_GATEWAY: 'asaas'
    }
  });

  const generated = readFileSync(outputPath, 'utf8');
  assert.equal(config.API_URL, 'https://api.fluxmei.com.br/api');
  assert.match(generated, /window\.FLUXMEI_CONFIG = /);
  assert.match(generated, /"API_URL":"https:\/\/api\.fluxmei\.com\.br\/api"/);
  assert.match(generated, /"PAYMENT_GATEWAY":"asaas"/);
});

test('write-env falha em producao sem FLUXMEI_API_URL', () => {
  assert.throws(
    () => buildPublicConfig({ NODE_ENV: 'production' }),
    /FLUXMEI_API_URL obrigatoria em producao\/Vercel/
  );

  assert.throws(
    () => buildPublicConfig({ VERCEL: '1' }),
    /FLUXMEI_API_URL obrigatoria em producao\/Vercel/
  );
});

test('write-env usa fallback local somente em desenvolvimento', () => {
  const config = buildPublicConfig({ NODE_ENV: 'development' });
  assert.equal(config.API_URL, 'http://localhost:3002/api');
});

test('env.js gerado nao vaza secrets', () => {
  const generated = serializePublicConfig(buildPublicConfig({
    NODE_ENV: 'production',
    FLUXMEI_API_URL: 'https://api.fluxmei.com.br/api',
    FLUXMEI_PAYMENT_GATEWAY: 'asaas',
    ASAAS_API_KEY: 'asaas-secret',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
    RESEND_API_KEY: 'resend-secret',
    GEMINI_API_KEY: 'gemini-secret'
  }));

  assert.doesNotMatch(generated, /ASAAS_API_KEY|SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY|GEMINI_API_KEY/);
  assert.doesNotMatch(generated, /asaas-secret|service-role-secret|resend-secret|gemini-secret/);
  assert.match(generated, /"API_URL":"https:\/\/api\.fluxmei\.com\.br\/api"/);
});
