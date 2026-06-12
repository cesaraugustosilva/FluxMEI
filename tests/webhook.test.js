import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAsaasWebhook,
  validateMercadoPagoWebhook
} from '../backend/src/services/webhookSecurityService.js';

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

test('webhook invalido Asaas nao passa validacao', () => {
  withEnv({ NODE_ENV: 'production', ASAAS_WEBHOOK_TOKEN: 'expected-token' }, () => {
    assert.throws(() => validateAsaasWebhook({
      headers: { 'asaas-access-token': 'wrong-token' },
      body: { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1', status: 'RECEIVED' } }
    }), /nao autorizado/i);
  });
});

test('webhook valido Asaas passa validacao', () => {
  withEnv({ NODE_ENV: 'production', ASAAS_WEBHOOK_TOKEN: 'expected-token' }, () => {
    const result = validateAsaasWebhook({
      headers: { 'asaas-access-token': 'expected-token' },
      body: { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1', status: 'RECEIVED' } }
    });

    assert.equal(result.validated, true);
  });
});

test('webhook invalido Mercado Pago nao passa validacao', () => {
  withEnv({ NODE_ENV: 'production', MERCADO_PAGO_WEBHOOK_SECRET: 'secret' }, () => {
    assert.throws(() => validateMercadoPagoWebhook({
      headers: {
        'x-request-id': 'req-1',
        'x-signature': 'ts=1,v1=invalid'
      }
    }, '123'), /nao autorizado/i);
  });
});

test('webhook valido Mercado Pago passa validacao', () => {
  withEnv({ NODE_ENV: 'production', MERCADO_PAGO_WEBHOOK_SECRET: 'secret' }, () => {
    const dataId = '123';
    const requestId = 'req-1';
    const ts = '1700000000';
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const signature = crypto.createHmac('sha256', 'secret').update(manifest).digest('hex');

    const result = validateMercadoPagoWebhook({
      headers: {
        'x-request-id': requestId,
        'x-signature': `ts=${ts},v1=${signature}`
      }
    }, dataId);

    assert.equal(result.validated, true);
  });
});
