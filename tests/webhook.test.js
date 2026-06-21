import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEfiWebhook } from '../backend/src/services/webhookSecurityService.js';

function withEnv(env, fn) {
  const previous = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    process.env[key] = env[key];
  }

  try {
    fn();
  } finally {
    for (const key of Object.keys(env)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test('webhook EFI invalido nao passa validacao', () => {
  withEnv({ NODE_ENV: 'production', EFI_WEBHOOK_SECRET: 'expected-secret' }, () => {
    assert.throws(() => validateEfiWebhook({
      headers: { 'x-efi-webhook-secret': 'wrong-secret' },
      body: { txid: 'fx123', status: 'CONCLUIDA' }
    }), /nao autorizado/i);
  });
});

test('webhook EFI valido passa validacao por bearer token', () => {
  withEnv({ NODE_ENV: 'production', EFI_WEBHOOK_SECRET: 'expected-secret' }, () => {
    const result = validateEfiWebhook({
      headers: { authorization: 'Bearer expected-secret' },
      body: { txid: 'fx123', status: 'CONCLUIDA' }
    });

    assert.equal(result.validated, true);
  });
});

test('webhook EFI sem segredo e recusado em producao', () => {
  withEnv({ NODE_ENV: 'production', EFI_WEBHOOK_SECRET: '' }, () => {
    assert.throws(() => validateEfiWebhook({
      headers: {},
      body: { txid: 'fx123', status: 'CONCLUIDA' }
    }), /configuracao insegura/i);
  });
});
