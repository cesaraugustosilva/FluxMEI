import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const assinaturaRoutes = readFileSync(new URL('../backend/src/routes/assinaturaRoutes.js', import.meta.url), 'utf8');
const schemaSql = readFileSync(new URL('../backend/database/schema.sql', import.meta.url), 'utf8');
const migrationSql = readFileSync(new URL('../backend/database/migrate_subscription_management.sql', import.meta.url), 'utf8');

function createRes() {
  return {
    payload: null,
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

function createSubscription(extra = {}) {
  return {
    id: 'sub-1',
    user_id: 'user-1',
    plano: 'pro_mensal',
    status: 'ativo',
    bloqueado: false,
    data_vencimento: '2026-07-24',
    renovacao_automatica: true,
    cancel_at_period_end: false,
    ...extra
  };
}

async function withMockedSubscription(assinatura, fn) {
  const [{ supabaseAdmin }, controller] = await Promise.all([
    import('../backend/src/config/supabase.js'),
    import(`../backend/src/controllers/assinaturaController.js?subscription-management-${Date.now()}-${Math.random()}`)
  ]);

  const originalFrom = supabaseAdmin.from;
  const originalGetUserById = supabaseAdmin.auth.admin.getUserById;
  const originalFetch = global.fetch;
  const originalEmailProvider = process.env.EMAIL_PROVIDER;
  const originalResendApiKey = process.env.RESEND_API_KEY;
  const originalEmailFrom = process.env.EMAIL_FROM;
  const stats = {
    table: null,
    tables: [],
    eq: [],
    order: null,
    limit: null,
    update: null,
    notificationEvents: []
  };

  supabaseAdmin.from = (table) => {
    stats.tables.push(table);
    if (table === 'audit_logs' || table === 'notification_events') {
      return {
        insert(payload) {
          if (table === 'notification_events') stats.notificationEvents.push(payload);
          this.payload = payload;
          return this;
        },
        select() {
          return this;
        },
        update(payload) {
          this.payload = payload;
          return this;
        },
        eq() {
          return this;
        },
        single() {
          return Promise.resolve({ data: { id: `${table}-1`, ...this.payload }, error: null });
        }
      };
    }
    stats.table = table;
    return {
      select() {
        return this;
      },
      eq(column, value) {
        stats.eq.push([column, value]);
        return this;
      },
      order(column, options) {
        stats.order = [column, options];
        return this;
      },
      limit(value) {
        stats.limit = value;
        return this;
      },
      maybeSingle() {
        return Promise.resolve({ data: assinatura, error: null });
      },
      update(payload) {
        stats.update = payload;
        return this;
      },
      single() {
        return Promise.resolve({ data: { ...assinatura, ...stats.update }, error: null });
      }
    };
  };
  supabaseAdmin.auth.admin.getUserById = async () => ({ data: { user: { email: 'cliente@example.com' } }, error: null });
  process.env.EMAIL_PROVIDER = 'resend';
  process.env.RESEND_API_KEY = 'resend-test-key';
  process.env.EMAIL_FROM = 'FluxMEI <no-reply@fluxmei.test>';
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ id: 'email-test' })
  });

  try {
    await fn({ controller, stats });
  } finally {
    supabaseAdmin.from = originalFrom;
    supabaseAdmin.auth.admin.getUserById = originalGetUserById;
    global.fetch = originalFetch;
    if (originalEmailProvider === undefined) delete process.env.EMAIL_PROVIDER;
    else process.env.EMAIL_PROVIDER = originalEmailProvider;
    if (originalResendApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalResendApiKey;
    if (originalEmailFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = originalEmailFrom;
  }
}

test('rotas de assinatura expõem status, cancelar e reativar autenticados', () => {
  assert.match(assinaturaRoutes, /router\.get\('\/status', authMiddleware, asyncHandler\(statusAssinatura\)\)/);
  assert.match(assinaturaRoutes, /router\.post\('\/cancelar', authMiddleware, asyncHandler\(cancelarAssinatura\)\)/);
  assert.match(assinaturaRoutes, /router\.post\('\/reativar', authMiddleware, asyncHandler\(reativarAssinatura\)\)/);
});

test('migration adiciona campos de cancelamento sem apagar historico', () => {
  for (const sql of [schemaSql, migrationSql]) {
    assert.match(sql, /cancel_at_period_end boolean/);
    assert.match(sql, /cancelled_at timestamptz/);
    assert.match(sql, /reactivated_at timestamptz/);
  }
});

test('cancelar assinatura ativa agenda cancelamento sem bloquear acesso', async () => {
  await withMockedSubscription(createSubscription(), async ({ controller, stats }) => {
    const res = createRes();
    await controller.cancelarAssinatura({ user: { id: 'user-1' } }, res);

    assert.ok(stats.table === 'assinaturas' || stats.table === 'notification_events');
    assert.ok(stats.tables.includes('audit_logs'));
    assert.equal(stats.notificationEvents[0].type, 'cancellation_scheduled');
    assert.deepEqual(stats.eq, [['user_id', 'user-1'], ['id', 'sub-1'], ['user_id', 'user-1']]);
    assert.equal(stats.update.cancel_at_period_end, true);
    assert.equal(stats.update.renovacao_automatica, false);
    assert.equal(stats.update.bloqueado, undefined);
    assert.equal(stats.update.status, undefined);
    assert.equal(res.payload.success, true);
    assert.match(res.payload.message, /sera encerrada/);
  });
});

test('reativar assinatura dentro do periodo pago remove cancelamento agendado', async () => {
  await withMockedSubscription(createSubscription({ cancel_at_period_end: true }), async ({ controller, stats }) => {
    const res = createRes();
    await controller.reativarAssinatura({ user: { id: 'user-1' } }, res);

    assert.equal(stats.update.cancel_at_period_end, false);
    assert.equal(stats.update.cancelled_at, null);
    assert.equal(stats.update.renovacao_automatica, true);
    assert.equal(stats.notificationEvents[0].type, 'subscription_reactivated');
    assert.equal(res.payload.action, 'reactivated');
  });
});

test('reativar assinatura vencida envia usuario para checkout', async () => {
  await withMockedSubscription(createSubscription({
    status: 'vencido',
    bloqueado: true,
    data_vencimento: '2026-01-01'
  }), async ({ controller, stats }) => {
    const res = createRes();
    await controller.reativarAssinatura({ user: { id: 'user-1' } }, res);

    assert.equal(stats.update, null);
    assert.equal(res.payload.action, 'checkout');
    assert.equal(res.payload.checkout_url, '/checkout/?plan=pro_mensal');
  });
});
