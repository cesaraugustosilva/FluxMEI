import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'production';
process.env.ENABLE_ASAAS = 'false';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

function createMockResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

function createQueryResult({ assinatura, profile = null, stats }) {
  const query = {
    _table: null,
    _payload: null,
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    limit() { return this; },
    update(payload) {
      stats.updated += 1;
      this._payload = payload;
      return this;
    },
    async maybeSingle() {
      if (this._table === 'profiles') return { data: profile, error: null };
      return { data: assinatura, error: null };
    },
    async single() {
      return { data: { ...assinatura, ...this._payload }, error: null };
    }
  };
  return query;
}

function pendingPixAssinatura({ expiresAt }) {
  return {
    id: 'sub-1',
    user_id: 'user-1',
    plano: 'pro_mensal',
    status: 'pendente',
    bloqueado: true,
    payment_provider: 'mercado_pago',
    provider_payment_id: 'pix-1',
    provider_status: 'pending',
    mercado_pago_payment_id: 'pix-1',
    mercado_pago_status: 'pending',
    provider_raw: {
      attempt: {
        plano_original: 'pro_mensal',
        valor_original: 49.9,
        tipo_cobranca_original: 'mensal',
        payment_id: 'pix-1',
        payment_method_id: 'pix',
        created_at: new Date().toISOString(),
        metadata: {
          user_id: 'user-1',
          assinatura_id: 'sub-1',
          plano: 'pro_mensal'
        }
      },
      payment: {
        id: 'pix-1',
        status: 'pending',
        payment_method_id: 'pix',
        payment_type_id: 'bank_transfer',
        transaction_amount: 49.9,
        metadata: {
          user_id: 'user-1',
          assinatura_id: 'sub-1',
          plano: 'pro_mensal'
        },
        external_reference: 'user-1:sub-1:pro_mensal',
        point_of_interaction: {
          transaction_data: {
            qr_code: '000201-pix-copia-e-cola',
            qr_code_base64: 'base64-qrcode',
            ticket_url: 'https://mercadopago.example/pix-1',
            expiration_date: expiresAt
          }
        }
      }
    }
  };
}

async function withMockedPaymentEnvironment(assinatura, fn, options = {}) {
  const [{ supabaseAdmin }, { mercadoPagoService }, controller] = await Promise.all([
    import('../backend/src/config/supabase.js'),
    import('../backend/src/services/mercadoPagoService.js'),
    import('../backend/src/controllers/pagamentoController.js?attempt-tests')
  ]);

  const originalFrom = supabaseAdmin.from;
  const originalRpc = supabaseAdmin.rpc;
  const originalCriarPagamento = mercadoPagoService.criarPagamento;
  const stats = { created: 0, updated: 0, locksAcquired: 0, locksDenied: 0, locksReleased: 0 };
  const lockState = {
    locked: Boolean(options.initialLock),
    lockId: 'lock-1',
    expiresAt: new Date(Date.now() + 120 * 1000).toISOString()
  };

  supabaseAdmin.from = (table) => {
    const query = createQueryResult({ assinatura, stats });
    query._table = table;
    return query;
  };

  supabaseAdmin.rpc = async (name) => {
    if (name === 'acquire_payment_attempt_lock') {
      if (lockState.locked) {
        stats.locksDenied += 1;
        return {
          data: [{ acquired: false, lock_id: lockState.lockId, expires_at: lockState.expiresAt }],
          error: null
        };
      }

      lockState.locked = true;
      stats.locksAcquired += 1;
      return {
        data: [{ acquired: true, lock_id: lockState.lockId, expires_at: lockState.expiresAt }],
        error: null
      };
    }

    if (name === 'release_payment_attempt_lock') {
      lockState.locked = false;
      stats.locksReleased += 1;
      return { data: true, error: null };
    }

    return originalRpc.call(supabaseAdmin, name);
  };

  mercadoPagoService.criarPagamento = async () => {
    stats.created += 1;
    if (options.paymentDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.paymentDelayMs));
    }
    return {
      id: 'pix-2',
      status: 'pending',
      payment_method_id: 'pix',
      payment_type_id: 'bank_transfer',
      transaction_amount: 49.9,
      metadata: {
        user_id: 'user-1',
        assinatura_id: 'sub-1',
        plano: 'pro_mensal'
      },
      point_of_interaction: {
        transaction_data: {
          qr_code: '000201-novo-pix',
          qr_code_base64: 'novo-base64'
        }
      }
    };
  };

  try {
    await fn({ ...controller, stats });
  } finally {
    supabaseAdmin.from = originalFrom;
    supabaseAdmin.rpc = originalRpc;
    mercadoPagoService.criarPagamento = originalCriarPagamento;
  }
}

test('Pix pendente recente retorna dados existentes e nao cria novo pagamento', async () => {
  const assinatura = pendingPixAssinatura({
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
  });

  await withMockedPaymentEnvironment(assinatura, async ({ criarPixMercadoPago, stats }) => {
    const response = createMockResponse();

    await criarPixMercadoPago({
      body: { plano: 'pro_mensal' },
      user: { id: 'user-1', email: 'cliente@example.com', user_metadata: {} }
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.reused, true);
    assert.equal(response.payload.payment_id, 'pix-1');
    assert.equal(response.payload.qr_code, '000201-pix-copia-e-cola');
    assert.equal(stats.created, 0);
    assert.equal(stats.updated, 0);
  });
});

test('Pix pendente expirado permite criar novo Pix', async () => {
  const assinatura = pendingPixAssinatura({
    expiresAt: new Date(Date.now() - 30 * 60 * 1000).toISOString()
  });

  await withMockedPaymentEnvironment(assinatura, async ({ criarPixMercadoPago, stats }) => {
    const response = createMockResponse();

    await criarPixMercadoPago({
      body: { plano: 'pro_mensal' },
      user: { id: 'user-1', email: 'cliente@example.com', user_metadata: {} }
    }, response);

    assert.equal(response.statusCode, 201);
    assert.equal(response.payload.payment_id, 'pix-2');
    assert.equal(response.payload.qr_code, '000201-novo-pix');
    assert.equal(stats.created, 1);
    assert.equal(stats.updated, 1);
    assert.equal(stats.locksAcquired, 1);
    assert.equal(stats.locksReleased, 1);
  });
});

test('Brick com tentativa pendente recente bloqueia nova criacao', async () => {
  const assinatura = pendingPixAssinatura({
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
  });

  await withMockedPaymentEnvironment(assinatura, async ({ processarPagamentoBrick, stats }) => {
    const response = createMockResponse();

    await assert.rejects(() => processarPagamentoBrick({
      body: {
        plano: 'pro_mensal',
        payment: {
          token: 'card-token',
          payment_method_id: 'visa',
          installments: 1
        }
      },
      user: { id: 'user-1', email: 'cliente@example.com', user_metadata: {} }
    }, response), (error) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /pagamento pendente/i);
      return true;
    });

    assert.equal(stats.created, 0);
    assert.equal(stats.updated, 0);
  });
});

test('duas criacoes simultaneas de Pix aceitam somente uma tentativa', async () => {
  const assinatura = {
    id: 'sub-1',
    user_id: 'user-1',
    plano: 'pro_mensal',
    status: 'pendente',
    bloqueado: true,
    payment_provider: null,
    provider_payment_id: null,
    provider_status: null,
    mercado_pago_payment_id: null,
    mercado_pago_status: null,
    provider_raw: null
  };

  await withMockedPaymentEnvironment(assinatura, async ({ criarPixMercadoPago, stats }) => {
    const request = {
      body: { plano: 'pro_mensal' },
      user: { id: 'user-1', email: 'cliente@example.com', user_metadata: {} }
    };
    const firstResponse = createMockResponse();
    const secondResponse = createMockResponse();

    const results = await Promise.allSettled([
      criarPixMercadoPago(request, firstResponse),
      criarPixMercadoPago(request, secondResponse)
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.statusCode, 409);
    assert.match(rejected[0].reason.message, /processamento/i);
    assert.equal(stats.created, 1);
    assert.equal(stats.updated, 1);
    assert.equal(stats.locksAcquired, 1);
    assert.equal(stats.locksDenied, 1);
    assert.equal(stats.locksReleased, 1);
  }, { paymentDelayMs: 20 });
});

test('tentativa recusada permite nova tentativa com nova trava', async () => {
  const assinatura = {
    id: 'sub-1',
    user_id: 'user-1',
    plano: 'pro_mensal',
    status: 'pendente',
    bloqueado: true,
    payment_provider: 'mercado_pago',
    provider_payment_id: 'pix-rejected',
    provider_status: 'rejected',
    mercado_pago_payment_id: 'pix-rejected',
    mercado_pago_status: 'rejected',
    provider_raw: {
      attempt: {
        plano_original: 'pro_mensal',
        valor_original: 49.9,
        payment_id: 'pix-rejected',
        payment_method_id: 'pix',
        created_at: new Date().toISOString()
      },
      payment: {
        id: 'pix-rejected',
        status: 'rejected',
        payment_method_id: 'pix',
        transaction_amount: 49.9
      }
    }
  };

  await withMockedPaymentEnvironment(assinatura, async ({ criarPixMercadoPago, stats }) => {
    const response = createMockResponse();

    await criarPixMercadoPago({
      body: { plano: 'pro_mensal' },
      user: { id: 'user-1', email: 'cliente@example.com', user_metadata: {} }
    }, response);

    assert.equal(response.statusCode, 201);
    assert.equal(response.payload.payment_id, 'pix-2');
    assert.equal(stats.created, 1);
    assert.equal(stats.updated, 1);
    assert.equal(stats.locksAcquired, 1);
    assert.equal(stats.locksReleased, 1);
  });
});
