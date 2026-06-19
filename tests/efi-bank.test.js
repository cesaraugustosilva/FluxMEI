import test from 'node:test';
import assert from 'node:assert/strict';

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
    provider_status: null,
    provider_raw: null,
    ...extra
  };
}

function assinaturaEfiPendentePix() {
  return assinaturaBase({
    payment_provider: 'efi',
    provider_payment_id: 'fxpix123456789012345678901',
    provider_status: 'ATIVA',
    provider_raw: {
      attempt: {
        plano_original: 'pro_mensal',
        valor_original: 49.9,
        tipo_cobranca_original: 'mensal',
        payment_id: 'fxpix123456789012345678901',
        payment_method_id: 'pix',
        created_at: new Date().toISOString(),
        metadata: {
          user_id: 'user-1',
          assinatura_id: 'sub-1',
          plano: 'pro_mensal'
        }
      },
      payment: {
        id: 'fxpix123456789012345678901',
        txid: 'fxpix123456789012345678901',
        status: 'ATIVA',
        payment_method_id: 'pix',
        amount: 49.9,
        metadata: {
          user_id: 'user-1',
          assinatura_id: 'sub-1',
          plano: 'pro_mensal'
        }
      },
      qrcode: {
        qrcode: '000201-efi-pix',
        imagemQrcode: 'base64-pix'
      }
    }
  });
}

function createQueryResult({ assinatura, profile, stats, getAssinatura }) {
  return {
    _table: null,
    _payload: null,
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    limit() { return this; },
    update(payload) {
      this._payload = payload;
      stats.updated += 1;
      stats.lastUpdate = payload;
      return this;
    },
    async maybeSingle() {
      if (this._table === 'profiles') return { data: profile, error: null };
      return { data: getAssinatura ? getAssinatura() : assinatura, error: null };
    },
    async single() {
      return { data: { ...assinatura, ...this._payload }, error: null };
    }
  };
}

async function withMockedEfiEnvironment(assinatura, fn, options = {}) {
  const [{ supabaseAdmin }, { efiBankService }, controller] = await Promise.all([
    import('../backend/src/config/supabase.js'),
    import('../backend/src/services/efiBankService.js'),
    import('../backend/src/controllers/pagamentoController.js?efi-tests')
  ]);

  const originalFrom = supabaseAdmin.from;
  const originalRpc = supabaseAdmin.rpc;
  const originalCriarPix = efiBankService.criarPix;
  const originalCriarCartao = efiBankService.criarCartao;
  const originalCriarBoleto = efiBankService.criarBoleto;
  const originalConsultarPagamento = efiBankService.consultarPagamento;
  const stats = { pixCreated: 0, cardCreated: 0, boletoCreated: 0, updated: 0, locksAcquired: 0, locksReleased: 0, lastUpdate: null };
  const profile = { nome: 'Cliente FluxMEI', cpf: '12345678901' };
  const assinaturaSequence = options.assinaturaSequence || null;
  let assinaturaReadIndex = 0;

  supabaseAdmin.from = (table) => {
    const query = createQueryResult({
      assinatura,
      profile,
      stats,
      getAssinatura: table === 'assinaturas' && assinaturaSequence
        ? () => assinaturaSequence[Math.min(assinaturaReadIndex++, assinaturaSequence.length - 1)]
        : null
    });
    query._table = table;
    return query;
  };

  supabaseAdmin.rpc = async (fn) => {
    if (fn === 'acquire_payment_attempt_lock') {
      stats.locksAcquired += 1;
      if (options.lockDenied) return { data: [{ acquired: false, lock_id: 'lock-1' }], error: null };
      return { data: [{ acquired: true, lock_id: 'lock-1', expires_at: new Date(Date.now() + 120000).toISOString() }], error: null };
    }

    if (fn === 'release_payment_attempt_lock') {
      stats.locksReleased += 1;
      return { data: true, error: null };
    }

    return { data: null, error: null };
  };

  efiBankService.criarPix = async () => {
    stats.pixCreated += 1;
    return {
      payment: {
        id: 'fxpixnew12345678901234567890',
        txid: 'fxpixnew12345678901234567890',
        status: 'ATIVA',
        payment_method_id: 'pix',
        amount: 49.9,
        access_token: 'efi-access-token',
        client_secret: 'efi-client-secret',
        chave: 'efi-pix-key',
        metadata: { user_id: 'user-1', assinatura_id: 'sub-1', plano: 'pro_mensal' }
      },
      qrcode: {
        qrcode: '000201-efi-pix-new',
        imagemQrcode: 'base64-new'
      }
    };
  };

  efiBankService.criarCartao = async () => {
    stats.cardCreated += 1;
    return {
      id: 'card-1',
      charge_id: 'card-1',
      status: options.cardStatus || 'paid',
      payment_method_id: 'cartao',
      amount: 49.9,
      payment_token: 'secure-token',
      card: {
        number: '4111111111111111',
        cvv: '123',
        holder: 'Cliente FluxMEI'
      },
      metadata: { user_id: 'user-1', assinatura_id: 'sub-1', plano: 'pro_mensal' }
    };
  };

  efiBankService.criarBoleto = async () => {
    stats.boletoCreated += 1;
    return {
      id: 'boleto-1',
      charge_id: 'boleto-1',
      status: 'waiting',
      payment_method_id: 'boleto',
      amount: 49.9,
      link: 'https://efi.example/boleto-1',
      barcode: '00190000000000000000000000000000000000000000',
      metadata: { user_id: 'user-1', assinatura_id: 'sub-1', plano: 'pro_mensal' }
    };
  };

  efiBankService.consultarPagamento = async () => options.consultarPagamento || {
    id: 'fxpixnew12345678901234567890',
    txid: 'fxpixnew12345678901234567890',
    status: 'CONCLUIDA',
    amount: 49.9,
    payment_method_id: 'pix',
    metadata: { user_id: 'user-1', assinatura_id: 'sub-1', plano: 'pro_mensal' }
  };

  try {
    await fn({ ...controller, stats });
  } finally {
    supabaseAdmin.from = originalFrom;
    supabaseAdmin.rpc = originalRpc;
    efiBankService.criarPix = originalCriarPix;
    efiBankService.criarCartao = originalCriarCartao;
    efiBankService.criarBoleto = originalCriarBoleto;
    efiBankService.consultarPagamento = originalConsultarPagamento;
  }
}

test('Pix EFI criado registra tentativa e retorna copia e cola', async () => {
  await withMockedEfiEnvironment(assinaturaBase(), async ({ criarPixEfi, stats }) => {
    const response = createMockResponse();
    await criarPixEfi({
      body: { plano: 'pro_mensal' },
      user: { id: 'user-1', email: 'cliente@example.com', user_metadata: {} }
    }, response);

    assert.equal(response.statusCode, 201);
    assert.equal(response.payload.provider, 'efi');
    assert.equal(response.payload.payment_id, 'fxpixnew12345678901234567890');
    assert.equal(response.payload.qr_code, '000201-efi-pix-new');
    assert.equal(stats.pixCreated, 1);
    assert.equal(stats.updated, 1);
    assert.equal(stats.locksReleased, 1);
    assert.equal(stats.lastUpdate.provider_raw.attempt.plano_original, 'pro_mensal');
    assert.equal(stats.lastUpdate.provider_raw.attempt.valor_original, 49.9);
    assert.equal(stats.lastUpdate.provider_raw.attempt.payment_id, 'fxpixnew12345678901234567890');
    assert.equal(stats.lastUpdate.provider_raw.payment.payment_id, 'fxpixnew12345678901234567890');
    assert.equal(stats.lastUpdate.provider_raw.payment.status, 'ATIVA');
    assert.equal(stats.lastUpdate.provider_raw.qrcode.has_qrcode, true);
    assert.doesNotMatch(JSON.stringify(stats.lastUpdate.provider_raw), /efi-access-token|efi-client-secret|efi-pix-key|000201-efi-pix-new|base64-new/);
  });
});

test('Cartao EFI aprovado registra tentativa sem dados sensiveis', async () => {
  await withMockedEfiEnvironment(assinaturaBase(), async ({ criarCartaoEfi, stats }) => {
    const response = createMockResponse();
    await criarCartaoEfi({
      body: { plano: 'pro_mensal', payment: { payment_token: 'secure-token' } },
      user: { id: 'user-1', email: 'cliente@example.com', user_metadata: {} }
    }, response);

    assert.equal(response.statusCode, 201);
    assert.equal(response.payload.provider, 'efi');
    assert.equal(response.payload.payment_status, 'paid');
    assert.equal(stats.cardCreated, 1);
    assert.equal(stats.updated, 1);
    assert.equal(stats.lastUpdate.provider_raw.attempt.plano_original, 'pro_mensal');
    assert.equal(stats.lastUpdate.provider_raw.attempt.payment_id, 'card-1');
    assert.equal(stats.lastUpdate.provider_raw.payment.payment_method, 'cartao');
    assert.equal(stats.lastUpdate.provider_raw.payment.status, 'paid');
    assert.doesNotMatch(JSON.stringify(stats.lastUpdate.provider_raw), /secure-token|4111111111111111|Cliente FluxMEI|cvv|number|holder/);
  });
});

test('Boleto EFI gerado retorna link e linha digitavel', async () => {
  await withMockedEfiEnvironment(assinaturaBase(), async ({ criarBoletoEfi, stats }) => {
    const response = createMockResponse();
    await criarBoletoEfi({
      body: { plano: 'pro_mensal' },
      user: { id: 'user-1', email: 'cliente@example.com', user_metadata: {} }
    }, response);

    assert.equal(response.statusCode, 201);
    assert.equal(response.payload.provider, 'efi');
    assert.equal(response.payload.bank_slip_url, 'https://efi.example/boleto-1');
    assert.equal(response.payload.digitable_line, '00190000000000000000000000000000000000000000');
    assert.equal(stats.boletoCreated, 1);
    assert.equal(stats.updated, 1);
  });
});

test('Pix EFI reconsulta assinatura apos lock e reutiliza tentativa existente', async () => {
  await withMockedEfiEnvironment(assinaturaBase(), async ({ criarPixEfi, stats }) => {
    const response = createMockResponse();
    await criarPixEfi({
      body: { plano: 'pro_mensal' },
      user: { id: 'user-1', email: 'cliente@example.com', user_metadata: {} }
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.reused, true);
    assert.equal(response.payload.qr_code, '000201-efi-pix');
    assert.equal(stats.pixCreated, 0);
    assert.equal(stats.updated, 0);
    assert.equal(stats.locksReleased, 1);
  }, {
    assinaturaSequence: [assinaturaBase(), assinaturaEfiPendentePix()]
  });
});

test('Brick/cartao EFI bloqueia tentativa concorrente apos lock', async () => {
  await withMockedEfiEnvironment(assinaturaBase(), async ({ criarCartaoEfi, stats }) => {
    const response = createMockResponse();
    await assert.rejects(() => criarCartaoEfi({
      body: { plano: 'pro_mensal', payment: { payment_token: 'secure-token' } },
      user: { id: 'user-1', email: 'cliente@example.com', user_metadata: {} }
    }, response), (error) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /pagamento pendente/i);
      return true;
    });

    assert.equal(stats.cardCreated, 0);
    assert.equal(stats.updated, 0);
    assert.equal(stats.locksReleased, 1);
  }, {
    assinaturaSequence: [assinaturaBase(), assinaturaEfiPendentePix()]
  });
});

test('Webhook EFI aprovado ativa assinatura', async () => {
  const previousSecret = process.env.EFI_WEBHOOK_SECRET;
  process.env.EFI_WEBHOOK_SECRET = 'secret';

  await withMockedEfiEnvironment(assinaturaEfiPendentePix(), async ({ webhookEfi, stats }) => {
    const response = createMockResponse();
    await webhookEfi({
      headers: { 'x-efi-webhook-secret': 'secret' },
      body: { txid: 'fxpix123456789012345678901', status: 'CONCLUIDA' }
    }, response);

    assert.equal(response.payload.received, true);
    assert.equal(stats.updated, 1);
  }, {
    consultarPagamento: {
      id: 'fxpix123456789012345678901',
      txid: 'fxpix123456789012345678901',
      status: 'CONCLUIDA',
      amount: 49.9,
      payment_method_id: 'pix',
      metadata: { user_id: 'user-1', assinatura_id: 'sub-1', plano: 'pro_mensal' }
    }
  });

  if (previousSecret === undefined) delete process.env.EFI_WEBHOOK_SECRET;
  else process.env.EFI_WEBHOOK_SECRET = previousSecret;
});
