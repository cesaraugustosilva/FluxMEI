import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const adminRoutes = readFileSync(new URL('../backend/src/routes/adminRoutes.js', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../backend/src/server.js', import.meta.url), 'utf8');
const adminHtml = readFileSync(new URL('../frontend/admin/index.html', import.meta.url), 'utf8');
const adminJs = readFileSync(new URL('../frontend/admin/admin.js', import.meta.url), 'utf8');

function createRes() {
  return {
    payload: null,
    statusCode: 200,
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

function createMockFrom({ profiles = [], subscriptions = [] } = {}) {
  return (table) => {
    const rows = table === 'profiles' ? profiles : subscriptions;
    const chain = {
      filters: [],
      select() {
        return this;
      },
      order() {
        return Promise.resolve({ data: rows, error: null });
      },
      limit(value) {
        return Promise.resolve({ data: rows.slice(0, value), error: null });
      },
      eq(column, value) {
        this.filters.push([column, value]);
        return this;
      },
      maybeSingle() {
        const found = rows.find((row) => this.filters.every(([column, value]) => row[column] === value)) || null;
        return Promise.resolve({ data: found, error: null });
      }
    };
    return chain;
  };
}

async function withAdminMocks({ users, profiles, subscriptions }, fn) {
  const [{ supabaseAdmin }, controller] = await Promise.all([
    import('../backend/src/config/supabase.js'),
    import('../backend/src/controllers/adminController.js?admin-tests')
  ]);

  const originalFrom = supabaseAdmin.from;
  const originalListUsers = supabaseAdmin.auth.admin.listUsers;
  supabaseAdmin.from = createMockFrom({ profiles, subscriptions });
  supabaseAdmin.auth.admin.listUsers = () => Promise.resolve({ data: { users }, error: null });

  try {
    await fn(controller);
  } finally {
    supabaseAdmin.from = originalFrom;
    supabaseAdmin.auth.admin.listUsers = originalListUsers;
  }
}

async function withAdminAuditMocks({ users, profiles, logs }, fn) {
  const [{ supabaseAdmin }, controller] = await Promise.all([
    import('../backend/src/config/supabase.js'),
    import('../backend/src/controllers/adminController.js?admin-audit-tests')
  ]);

  const originalFrom = supabaseAdmin.from;
  const originalListUsers = supabaseAdmin.auth.admin.listUsers;
  const stats = { tables: [], order: null, limit: null };
  supabaseAdmin.from = (table) => {
    stats.tables.push(table);
    const rows = table === 'profiles' ? profiles : logs;
    return {
      select() {
        return this;
      },
      order(column, options) {
        stats.order = [column, options];
        if (table === 'profiles') return Promise.resolve({ data: rows, error: null });
        return this;
      },
      limit(value) {
        stats.limit = value;
        return Promise.resolve({ data: rows.slice(0, value), error: null });
      }
    };
  };
  supabaseAdmin.auth.admin.listUsers = () => Promise.resolve({ data: { users }, error: null });

  try {
    await fn({ adminAuditLogs: controller.adminAuditLogs, stats });
  } finally {
    supabaseAdmin.from = originalFrom;
    supabaseAdmin.auth.admin.listUsers = originalListUsers;
  }
}

test('rotas admin exigem autenticacao e middleware administrativo', () => {
  assert.match(adminRoutes, /router\.use\(authMiddleware, adminMiddleware\)/);
  assert.match(adminRoutes, /router\.get\('\/dashboard', asyncHandler\(adminDashboard\)\)/);
  assert.match(adminRoutes, /router\.get\('\/users', asyncHandler\(adminUsers\)\)/);
  assert.match(adminRoutes, /router\.get\('\/subscriptions', asyncHandler\(adminSubscriptions\)\)/);
  assert.match(adminRoutes, /router\.get\('\/payments', asyncHandler\(adminPayments\)\)/);
  assert.match(adminRoutes, /router\.get\('\/audit-logs', asyncHandler\(adminAuditLogs\)\)/);
  assert.match(serverSource, /apiRouter\.use\('\/admin', adminRoutes\)/);
});

test('middleware admin permite email autorizado e bloqueia usuario comum', async () => {
  const [{ supabaseAdmin }, { adminMiddleware }] = await Promise.all([
    import('../backend/src/config/supabase.js'),
    import('../backend/src/middlewares/adminMiddleware.js?admin-middleware-tests')
  ]);

  const originalEnv = process.env.ADMIN_EMAILS;
  const originalFrom = supabaseAdmin.from;
  process.env.ADMIN_EMAILS = 'dona@fluxmei.com.br';
  supabaseAdmin.from = createMockFrom({ profiles: [{ id: 'user-common', is_admin: false }] });

  try {
    let nextError = null;
    await adminMiddleware(
      { user: { id: 'admin-user', email: 'dona@fluxmei.com.br' } },
      {},
      (error) => { nextError = error || null; }
    );
    assert.equal(nextError, null);

    nextError = null;
    await adminMiddleware(
      { user: { id: 'user-common', email: 'cliente@fluxmei.com.br' } },
      {},
      (error) => { nextError = error || null; }
    );
    assert.equal(nextError?.statusCode, 403);
  } finally {
    process.env.ADMIN_EMAILS = originalEnv;
    supabaseAdmin.from = originalFrom;
  }
});

test('middleware admin permite profile com is_admin=true', async () => {
  const [{ supabaseAdmin }, { adminMiddleware }] = await Promise.all([
    import('../backend/src/config/supabase.js'),
    import('../backend/src/middlewares/adminMiddleware.js?admin-profile-tests')
  ]);

  const originalEnv = process.env.ADMIN_EMAILS;
  const originalFrom = supabaseAdmin.from;
  process.env.ADMIN_EMAILS = '';
  supabaseAdmin.from = createMockFrom({ profiles: [{ id: 'profile-admin', is_admin: true }] });

  try {
    let nextError = null;
    await adminMiddleware(
      { user: { id: 'profile-admin', email: 'admin@empresa.com' } },
      {},
      (error) => { nextError = error || null; }
    );
    assert.equal(nextError, null);
  } finally {
    process.env.ADMIN_EMAILS = originalEnv;
    supabaseAdmin.from = originalFrom;
  }
});

test('dashboard admin retorna metricas principais', async () => {
  const users = [
    { id: 'u1', email: 'ana@fluxmei.com', created_at: '2026-06-01T10:00:00Z' },
    { id: 'u2', email: 'bia@fluxmei.com', created_at: '2026-06-02T10:00:00Z' },
    { id: 'u3', email: 'caio@fluxmei.com', created_at: '2026-06-03T10:00:00Z' }
  ];
  const profiles = users.map((user) => ({ id: user.id, nome: user.email.split('@')[0], created_at: user.created_at, is_admin: false }));
  const subscriptions = [
    { id: 's1', user_id: 'u1', plano: 'pro_mensal', status: 'ativo', valor: 49.9, tipo_cobranca: 'mensal', bloqueado: false, provider_payment_id: 'pay-1', provider_status: 'RECEIVED', payment_provider: 'asaas', created_at: '2026-06-20T10:00:00Z', provider_raw: { attempt: { method: 'pix', valor_original: 49.9 } } },
    { id: 's2', user_id: 'u2', plano: 'pro_anual', status: 'ativo', valor: 478.8, tipo_cobranca: 'anual', bloqueado: false, provider_payment_id: 'pay-2', provider_status: 'PENDING', payment_provider: 'asaas', created_at: '2026-06-21T10:00:00Z', provider_raw: { attempt: { method: 'cartao', valor_original: 478.8 } } },
    { id: 's3', user_id: 'u3', plano: 'gratuito', status: 'teste_gratis', valor: 0, tipo_cobranca: 'mensal', bloqueado: false, created_at: '2026-06-22T10:00:00Z' },
    { id: 's4', user_id: 'u3', plano: 'pro_mensal', status: 'ativo', valor: 49.9, tipo_cobranca: 'mensal', bloqueado: false, cancel_at_period_end: true, provider_payment_id: 'pay-4', provider_status: 'CONFIRMED', payment_provider: 'asaas', created_at: '2026-06-23T10:00:00Z', provider_raw: { attempt: { method: 'boleto', valor_original: 49.9 } } }
  ];

  await withAdminMocks({ users, profiles, subscriptions }, async ({ adminDashboard }) => {
    const res = createRes();
    await adminDashboard({}, res);

    assert.equal(res.payload.success, true);
    assert.equal(res.payload.metrics.usuarios_cadastrados, 3);
    assert.equal(res.payload.metrics.trials_ativos, 1);
    assert.equal(res.payload.metrics.assinaturas_ativas, 3);
    assert.equal(res.payload.metrics.assinaturas_canceladas, 1);
    assert.equal(res.payload.metrics.pagamentos_pendentes, 1);
    assert.equal(res.payload.metrics.receita_total, 99.8);
    assert.equal(res.payload.metrics.mrr, 99.8);
    assert.equal(res.payload.metrics.arr, 1676.4);
  });
});

test('listas admin retornam dados sanitizados', async () => {
  const users = [{ id: 'u1', email: 'ana@fluxmei.com', created_at: '2026-06-01T10:00:00Z', user_metadata: { nome: 'Ana' } }];
  const profiles = [{ id: 'u1', nome: 'Ana MEI', nome_negocio: 'Ana Studio', created_at: '2026-06-01T10:00:00Z', is_admin: false }];
  const subscriptions = [{
    id: 's1',
    user_id: 'u1',
    plano: 'pro_mensal',
    status: 'ativo',
    valor: 49.9,
    tipo_cobranca: 'mensal',
    bloqueado: false,
    data_vencimento: '2026-07-24',
    provider_payment_id: 'pay-1',
    provider_status: 'RECEIVED',
    payment_provider: 'asaas',
    created_at: '2026-06-24T10:00:00Z',
    provider_raw: {
      attempt: { method: 'credit_card', valor_original: 49.9 },
      payment: { cpfCnpj: '12345678901', creditCardNumber: '4111111111111111', cvv: '123' }
    }
  }];

  await withAdminMocks({ users, profiles, subscriptions }, async ({ adminUsers, adminSubscriptions, adminPayments }) => {
    const usersRes = createRes();
    await adminUsers({}, usersRes);
    assert.equal(usersRes.payload.users[0].email, 'ana@fluxmei.com');

    const subscriptionsRes = createRes();
    await adminSubscriptions({}, subscriptionsRes);
    assert.equal(subscriptionsRes.payload.subscriptions[0].user_name, 'Ana MEI');

    const paymentsRes = createRes();
    await adminPayments({}, paymentsRes);
    assert.equal(paymentsRes.payload.payments[0].method, 'cartao');
    assert.equal(paymentsRes.payload.payments[0].provider, 'asaas');
    assert.doesNotMatch(JSON.stringify(paymentsRes.payload), /provider_raw|cpfCnpj|4111111111111111|cvv|12345678901/);
  });
});

test('admin consegue listar audit logs limitados e sanitizados', async () => {
  const users = [{ id: 'u1', email: 'ana@fluxmei.com', user_metadata: { nome: 'Ana' } }];
  const profiles = [{ id: 'u1', nome: 'Ana MEI', created_at: '2026-06-01T10:00:00Z' }];
  const logs = Array.from({ length: 120 }, (_, index) => ({
    id: `log-${index}`,
    user_id: 'u1',
    actor_user_id: 'u1',
    action: index === 0 ? 'payment.created' : 'auth.login',
    entity_type: 'payment',
    entity_id: `pay-${index}`,
    metadata: index === 0 ? { provider: 'asaas', method: 'pix' } : { ok: true },
    ip_address: '127.0.0.1',
    user_agent: 'node-test',
    created_at: `2026-06-${String(24 - Math.min(index, 20)).padStart(2, '0')}T10:00:00.000Z`
  }));

  await withAdminAuditMocks({ users, profiles, logs }, async ({ adminAuditLogs, stats }) => {
    const res = createRes();
    await adminAuditLogs({}, res);

    assert.ok(stats.tables.includes('audit_logs'));
    assert.deepEqual(stats.order, ['created_at', { ascending: false }]);
    assert.equal(stats.limit, 100);
    assert.equal(res.payload.success, true);
    assert.equal(res.payload.logs.length, 100);
    assert.equal(res.payload.logs[0].user_name, 'Ana MEI');
    assert.equal(res.payload.logs[0].action, 'payment.created');
    assert.doesNotMatch(JSON.stringify(res.payload), /provider_raw|cpfCnpj|4111111111111111|cvv/);
  });
});


test('frontend admin possui busca, filtro e nao referencia dados sensiveis', () => {
  assert.match(adminHtml, /id="userSearch"/);
  assert.match(adminHtml, /id="paymentMethodFilter"/);
  assert.match(adminHtml, /id="metricsGrid"/);
  assert.match(adminJs, /apiRequest\('\/admin\/dashboard'\)/);
  assert.match(adminJs, /apiRequest\('\/admin\/users'\)/);
  assert.match(adminJs, /apiRequest\('\/admin\/subscriptions'\)/);
  assert.match(adminJs, /apiRequest\('\/admin\/payments'\)/);
  assert.match(adminJs, /apiRequest\('\/admin\/audit-logs'\)/);
  assert.match(adminHtml, /id="auditTableBody"/);
  assert.doesNotMatch(adminHtml + adminJs, /provider_raw|cpfCnpj|cardNumber|cvv|ASAAS_API_KEY|SUPABASE_SERVICE_ROLE_KEY/);
});
