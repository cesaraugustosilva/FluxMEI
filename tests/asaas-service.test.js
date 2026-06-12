import test from 'node:test';
import assert from 'node:assert/strict';
import { asaasService } from '../backend/src/services/asaasService.js';

test('criarAssinatura envia payload recorrente mensal para o Asaas', async () => {
  const previousApiKey = process.env.ASAAS_API_KEY;
  const previousBaseUrl = process.env.ASAAS_BASE_URL;
  const previousFetch = globalThis.fetch;
  let capturedUrl = null;
  let capturedOptions = null;

  process.env.ASAAS_API_KEY = 'fake-key';
  process.env.ASAAS_BASE_URL = 'https://api-sandbox.asaas.com/v3';
  globalThis.fetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ id: 'sub_1', status: 'ACTIVE' })
    };
  };

  try {
    const result = await asaasService.criarAssinatura({
      customerId: 'cus_1',
      plan: {
        value: 49.9,
        tipo_cobranca: 'mensal',
        description: 'Plano mensal'
      },
      method: 'pix',
      externalReference: 'assinatura-1',
      nextDueDate: '2026-06-12'
    });

    const body = JSON.parse(capturedOptions.body);
    assert.equal(result.id, 'sub_1');
    assert.equal(capturedUrl, 'https://api-sandbox.asaas.com/v3/subscriptions');
    assert.equal(capturedOptions.method, 'POST');
    assert.equal(body.customer, 'cus_1');
    assert.equal(body.billingType, 'PIX');
    assert.equal(body.cycle, 'MONTHLY');
    assert.equal(body.externalReference, 'assinatura-1');
    assert.equal(body.nextDueDate, '2026-06-12');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApiKey === undefined) delete process.env.ASAAS_API_KEY;
    else process.env.ASAAS_API_KEY = previousApiKey;
    if (previousBaseUrl === undefined) delete process.env.ASAAS_BASE_URL;
    else process.env.ASAAS_BASE_URL = previousBaseUrl;
  }
});
