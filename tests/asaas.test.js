import test from 'node:test';
import assert from 'node:assert/strict';
import { asaasService } from '../backend/src/services/asaasService.js';

function createMockResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.payload = data;
      return this;
    }
  };
}

function assinaturaBase(extra = {}) {
  return {
    id: 'sub-1',
    user_id: 'user-1',
    plano: 'pro_mensal',
    status: 'pendente',
    bloqueado: true,
    payment_provider: null,
    provider_payment_id: null,
    provider_customer_id: null,
    provider_status: null,
    provider_raw: null,
    ...extra
  };
}

async function withEnv(env, fn) {
  const previous = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    process.env[key] = env[key];
  }

  try {
    return await fn();
  } finally {
    for (const key of Object.keys(env)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test('asaasService cria cliente e cobranca com access_token sem expor chave', async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => {
        if (String(url).includes('/customers?')) return { data: [] };
        return { id: url.endsWith('/customers') ? 'cus_1' : 'pay_1', status: 'PENDING' };
      }
    };
  };

  await withEnv({
    ASAAS_API_KEY: 'asaas-secret',
    ASAAS_BASE_URL: 'https://api-sandbox.asaas.com/v3'
  }, async () => {
    try {
      await asaasService.criarOuBuscarCliente({
        user: { id: 'user-1', email: 'cliente@example.com', user_metadata: {} },
        profile: { nome: 'Cliente FluxMEI', cpf: '' },
        cpfCnpj: '123.456.789-01'
      });
      await asaasService.criarCobranca({
        customerId: 'cus_1',
        plan: { value: 49.9, description: 'Plano mensal' },
        method: 'pix',
        externalReference: 'user-1:sub-1:pro_mensal',
        dueDate: '2026-06-23'
      });

      assert.equal(calls[0].url, 'https://api-sandbox.asaas.com/v3/customers?cpfCnpj=12345678901');
      assert.equal(calls[0].options.headers.access_token, 'asaas-secret');
      assert.equal(calls[1].url, 'https://api-sandbox.asaas.com/v3/customers');
      assert.equal(JSON.parse(calls[1].options.body).cpfCnpj, '12345678901');
      assert.equal(calls[2].url, 'https://api-sandbox.asaas.com/v3/payments');
      assert.equal(JSON.parse(calls[2].options.body).billingType, 'PIX');
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

test('asaasService atualiza cliente existente com CPF/CNPJ', async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ id: 'cus_1', cpfCnpj: '12345678901' })
    };
  };

  await withEnv({
    ASAAS_API_KEY: 'asaas-secret',
    ASAAS_BASE_URL: 'https://api-sandbox.asaas.com/v3'
  }, async () => {
    try {
      await asaasService.criarOuBuscarCliente({
        user: { id: 'user-1', email: 'cliente@example.com', user_metadata: {} },
        profile: { nome: 'Cliente FluxMEI', cpf: '' },
        existingCustomerId: 'cus_1',
        cpfCnpj: '123.456.789-01'
      });

      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, 'https://api-sandbox.asaas.com/v3/customers/cus_1');
      assert.equal(calls[0].options.method, 'PUT');
      assert.equal(JSON.parse(calls[0].options.body).cpfCnpj, '12345678901');
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

async function withMockedAsaasEnvironment(assinatura, fn, options = {}) {
  const [{ supabaseAdmin }, { asaasService }, controller] = await Promise.all([
    import('../backend/src/config/supabase.js'),
    import('../backend/src/services/asaasService.js'),
    import('../backend/src/controllers/pagamentoController.js?asaas-tests')
  ]);

  const originalFrom = supabaseAdmin.from;
  const originalRpc = supabaseAdmin.rpc;
  const originalCriarOuBuscarCliente = asaasService.criarOuBuscarCliente;
  const originalCriarCobranca = asaasService.criarCobranca;
  const originalObterPixQrCode = asaasService.obterPixQrCode;
  const originalConsultarPagamento = asaasService.consultarPagamento;
  const stats = {
    pixCreated: 0,
    boletoCreated: 0,
    cardCreated: 0,
    updated: 0,
    locksAcquired: 0,
    locksReleased: 0,
    lastUpdate: null,
    customerCpfCnpj: null,
    lastPaymentMethod: null
  };
  const profile = options.profile ?? { nome: 'Cliente FluxMEI', cpf: '12345678901' };

  supabaseAdmin.from = (table) => {
    const filters = [];
    const query = {
      _payload: null,
      select() { return this; },
      eq(key, value) {
        filters.push([key, value]);
        return this;
      },
      order() { return this; },
      limit() { return this; },
      update(payload) {
        this._payload = payload;
        stats.updated += 1;
        stats.lastUpdate = payload;
        return this;
      },
      async maybeSingle() {
        if (table === 'profiles') return { data: profile, error: null };
        if (
          table === 'assinaturas'
          && options.duplicateAssinatura
          && filters.some(([key, value]) => key === 'payment_provider' && value === options.duplicateAssinatura.payment_provider)
          && filters.some(([key, value]) => key === 'provider_payment_id' && value === options.duplicateAssinatura.provider_payment_id)
        ) {
          return { data: options.duplicateAssinatura, error: null };
        }
        return { data: assinatura, error: null };
      },
      async single() {
        if (options.updateError && this._payload?.provider_payment_id === options.updateErrorPaymentId) {
          return { data: null, error: options.updateError };
        }
        return { data: { ...assinatura, ...this._payload }, error: null };
      }
    };
    return query;
  };

  supabaseAdmin.rpc = async (fn) => {
    if (fn === 'acquire_payment_attempt_lock') {
      stats.locksAcquired += 1;
      return { data: [{ acquired: true, lock_id: 'lock-asaas', expires_at: new Date(Date.now() + 120000).toISOString() }], error: null };
    }

    if (fn === 'release_payment_attempt_lock') {
      stats.locksReleased += 1;
      return { data: true, error: null };
    }

    return { data: null, error: null };
  };

  asaasService.criarOuBuscarCliente = async ({ cpfCnpj }) => {
    stats.customerCpfCnpj = cpfCnpj;
    return { id: 'cus_1' };
  };
  asaasService.criarCobranca = async ({ method }) => {
    stats.lastPaymentMethod = method;
    if (method === 'boleto') stats.boletoCreated += 1;
    else if (method === 'cartao') stats.cardCreated += 1;
    else stats.pixCreated += 1;
    const status = method === 'cartao' ? (options.cardStatus || 'PENDING') : 'PENDING';
    return {
      id: method === 'boleto' ? 'pay_boleto_1' : method === 'cartao' ? 'pay_card_1' : 'pay_pix_1',
      customer: 'cus_1',
      status,
      billingType: method === 'boleto' ? 'BOLETO' : method === 'cartao' ? 'CREDIT_CARD' : 'PIX',
      value: 49.9,
      dueDate: '2026-06-26',
      invoiceUrl: 'https://asaas.example/invoice',
      bankSlipUrl: method === 'boleto' ? 'https://asaas.example/boleto' : undefined,
      identificationField: method === 'boleto' ? '00190.00009' : undefined,
      externalReference: 'user-1:sub-1:pro_mensal'
    };
  };
  asaasService.obterPixQrCode = async () => ({ payload: '000201-asaas-pix', encodedImage: 'base64-pix' });
  asaasService.consultarPagamento = async () => options.consultarPagamento || {
    id: 'pay_pix_1',
    customer: 'cus_1',
    status: 'RECEIVED',
    billingType: 'PIX',
    value: 49.9,
    externalReference: 'user-1:sub-1:pro_mensal'
  };

  try {
    await fn({ ...controller, stats });
  } finally {
    supabaseAdmin.from = originalFrom;
    supabaseAdmin.rpc = originalRpc;
    asaasService.criarOuBuscarCliente = originalCriarOuBuscarCliente;
    asaasService.criarCobranca = originalCriarCobranca;
    asaasService.obterPixQrCode = originalObterPixQrCode;
    asaasService.consultarPagamento = originalConsultarPagamento;
  }
}

test('Pix Asaas criado registra tentativa e retorna copia e cola', async () => {
  await withMockedAsaasEnvironment(assinaturaBase(), async ({ criarPixAsaas, stats }) => {
    const response = createMockResponse();
    await criarPixAsaas({
      body: { plano: 'pro_mensal', cpfCnpj: '123.456.789-01' },
      user: { id: 'user-1', email: 'cliente@example.com', user_metadata: {} }
    }, response);

    assert.equal(response.statusCode, 201);
    assert.equal(response.payload.provider, 'asaas');
    assert.equal(response.payload.payment_id, 'pay_pix_1');
    assert.equal(response.payload.qr_code, '000201-asaas-pix');
    assert.equal(stats.pixCreated, 1);
    assert.equal(stats.updated, 1);
    assert.equal(stats.lastUpdate.payment_provider, 'asaas');
    assert.equal(stats.lastUpdate.provider_customer_id, 'cus_1');
    assert.equal(stats.customerCpfCnpj, '12345678901');
  });
});

test('Boleto Asaas criado retorna link linha e vencimento', async () => {
  await withMockedAsaasEnvironment(assinaturaBase(), async ({ criarBoletoAsaas, stats }) => {
    const response = createMockResponse();
    await criarBoletoAsaas({
      body: { plano: 'pro_mensal', cpfCnpj: '12.345.678/0001-90' },
      user: { id: 'user-1', email: 'cliente@example.com', user_metadata: {} }
    }, response);

    assert.equal(response.statusCode, 201);
    assert.equal(response.payload.provider, 'asaas');
    assert.equal(response.payload.payment_id, 'pay_boleto_1');
    assert.equal(response.payload.bank_slip_url, 'https://asaas.example/boleto');
    assert.equal(response.payload.digitable_line, '00190.00009');
    assert.equal(response.payload.due_date, '2026-06-26');
    assert.equal(stats.boletoCreated, 1);
    assert.equal(stats.customerCpfCnpj, '12345678000190');
  });
});

test('Cartao Asaas hospedado registra tentativa saneada e retorna invoice_url', async () => {
  await withMockedAsaasEnvironment(assinaturaBase(), async ({ criarCartaoAsaas, stats }) => {
    const response = createMockResponse();
    await criarCartaoAsaas({
      body: {
        plano: 'pro_mensal',
        cpfCnpj: '123.456.789-09'
      },
      user: { id: 'user-1', email: 'cliente@example.com', user_metadata: {} }
    }, response);

    assert.equal(response.statusCode, 201);
    assert.equal(response.payload.provider, 'asaas');
    assert.equal(response.payload.payment_id, 'pay_card_1');
    assert.equal(response.payload.payment_method_id, 'credit_card');
    assert.equal(response.payload.invoice_url, 'https://asaas.example/invoice');
    assert.equal(stats.cardCreated, 1);
    assert.equal(stats.lastPaymentMethod, 'cartao');
    assert.equal(stats.customerCpfCnpj, '12345678909');
    assert.equal(stats.lastUpdate.status, 'pendente');
    assert.equal(stats.lastUpdate.bloqueado, true);
    const raw = JSON.stringify(stats.lastUpdate.provider_raw);
    assert.doesNotMatch(raw, /4111111111111111|2030|creditCard|creditCardHolderInfo|holderName|ccv|cvv/);
    assert.doesNotMatch(raw, /creditCard|ccv|cvv|holderName|number/);
  });
});

test('Cartao Asaas pendente nao ativa assinatura antes do webhook', async () => {
  await withMockedAsaasEnvironment(assinaturaBase(), async ({ criarCartaoAsaas, stats }) => {
    const response = createMockResponse();
    await criarCartaoAsaas({
      headers: {},
      ip: '127.0.0.1',
      body: {
        plano: 'pro_mensal',
        cpfCnpj: '12345678909'
      },
      user: { id: 'user-1', email: 'cliente@example.com', user_metadata: {} }
    }, response);

    assert.equal(response.statusCode, 201);
    assert.equal(stats.lastUpdate.status, 'pendente');
    assert.equal(stats.lastUpdate.bloqueado, true);
  });
});

test('Cartao Asaas rejeita dados crus antes do gateway', async () => {
  await withMockedAsaasEnvironment(assinaturaBase(), async ({ criarCartaoAsaas, stats }) => {
    const response = createMockResponse();

    await assert.rejects(
      () => criarCartaoAsaas({
        headers: {},
        body: {
          plano: 'pro_mensal',
          payment: {
            number: '4111111111111112',
            expirationMonth: '12',
            expirationYear: '2030',
            cvv: '123'
          }
        },
        user: { id: 'user-1', email: 'cliente@example.com', user_metadata: {} }
      }, response),
      /Campo de cartao nao permitido/
    );

    assert.equal(stats.cardCreated, 0);
    assert.equal(stats.updated, 0);
  });
});

test('Pagamento Asaas duplicado por unique retorna assinatura existente de forma idempotente', async () => {
  const duplicateAssinatura = assinaturaBase({
    id: 'sub-existing',
    payment_provider: 'asaas',
    provider_payment_id: 'pay_pix_1',
    provider_customer_id: 'cus_1',
    provider_status: 'PENDING',
    provider_raw: {
      attempt: {
        plano_original: 'pro_mensal',
        valor_original: 49.9,
        payment_id: 'pay_pix_1',
        payment_method_id: 'PIX',
        created_at: new Date().toISOString()
      }
    }
  });

  await withMockedAsaasEnvironment(assinaturaBase(), async ({ criarPixAsaas, stats }) => {
    const response = createMockResponse();
    await criarPixAsaas({
      body: { plano: 'pro_mensal', cpfCnpj: '123.456.789-01' },
      user: { id: 'user-1', email: 'cliente@example.com', user_metadata: {} }
    }, response);

    assert.equal(response.statusCode, 201);
    assert.equal(response.payload.success, true);
    assert.equal(response.payload.payment_id, 'pay_pix_1');
    assert.equal(response.payload.assinatura.id, 'sub-existing');
    assert.equal(response.payload.assinatura.duplicate_provider_payment, true);
    assert.equal(stats.pixCreated, 1);
  }, {
    duplicateAssinatura,
    updateErrorPaymentId: 'pay_pix_1',
    updateError: {
      code: '23505',
      message: 'duplicate key value violates unique constraint "idx_assinaturas_provider_payment_unique"',
      details: 'Key (payment_provider, provider_payment_id)=(asaas, pay_pix_1) already exists.'
    }
  });
});

test('Pix Asaas sem CPF/CNPJ retorna erro claro antes de chamar gateway', async () => {
  await withMockedAsaasEnvironment(assinaturaBase(), async ({ criarPixAsaas, stats }) => {
    const response = createMockResponse();

    await assert.rejects(
      () => criarPixAsaas({
        body: { plano: 'pro_mensal' },
        user: { id: 'user-1', email: 'cliente@example.com', user_metadata: {} }
      }, response),
      /Informe seu CPF ou CNPJ para gerar a cobrança/
    );

    assert.equal(stats.customerCpfCnpj, null);
    assert.equal(stats.pixCreated, 0);
  }, { profile: { nome: 'Cliente FluxMEI', cpf: '', cnpj: '' } });
});

test('Pagamento Asaas rejeita plano invalido antes de chamar gateway', async () => {
  await withMockedAsaasEnvironment(assinaturaBase(), async ({ criarPixAsaas, stats }) => {
    const response = createMockResponse();

    await assert.rejects(
      () => criarPixAsaas({
        body: { plano: 'plano_invalido', cpfCnpj: '123.456.789-01' },
        user: { id: 'user-1', email: 'cliente@example.com', user_metadata: {} }
      }, response),
      /Plano invalido/
    );

    assert.equal(stats.customerCpfCnpj, null);
    assert.equal(stats.pixCreated, 0);
  });
});

test('Status Asaas consulta pagamento e preserva assinatura do usuario', async () => {
  await withMockedAsaasEnvironment(assinaturaBase({
    payment_provider: 'asaas',
    provider_payment_id: 'pay_pix_1'
  }), async ({ statusPagamentoAsaas }) => {
    const response = createMockResponse();
    await statusPagamentoAsaas({
      params: { paymentId: 'pay_pix_1' },
      user: { id: 'user-1' }
    }, response);

    assert.equal(response.payload.provider, 'asaas');
    assert.equal(response.payload.payment_id, 'pay_pix_1');
    assert.equal(response.payload.payment_status, 'RECEIVED');
  });
});

test('Webhook Asaas com pagamento recebido ativa assinatura', async () => {
  const previousToken = process.env.ASAAS_WEBHOOK_TOKEN;
  process.env.ASAAS_WEBHOOK_TOKEN = 'secret-token';
  await withMockedAsaasEnvironment(assinaturaBase({
    payment_provider: 'asaas',
    provider_payment_id: 'pay_pix_1',
    provider_status: 'PENDING',
    provider_raw: {
      attempt: {
        plano_original: 'pro_mensal',
        valor_original: 49.9,
        tipo_cobranca_original: 'mensal',
        payment_id: 'pay_pix_1',
        payment_method_id: 'PIX',
        created_at: new Date().toISOString(),
        metadata: { user_id: 'user-1', assinatura_id: 'sub-1', plano: 'pro_mensal' }
      }
    }
  }), async ({ webhookAsaas, stats }) => {
    const response = createMockResponse();
    await webhookAsaas({
      headers: { 'asaas-access-token': 'secret-token' },
      body: { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_pix_1' } }
    }, response);

    assert.equal(response.payload.received, true);
    assert.equal(stats.updated, 1);
    assert.equal(stats.lastUpdate.status, 'ativo');
    assert.equal(stats.lastUpdate.bloqueado, false);
    assert.ok(stats.lastUpdate.paid_at);
  });

  if (previousToken === undefined) delete process.env.ASAAS_WEBHOOK_TOKEN;
  else process.env.ASAAS_WEBHOOK_TOKEN = previousToken;
});
