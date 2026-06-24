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
  const stats = {
    table: null,
    eq: [],
    order: null,
    limit: null,
    update: null
  };

  supabaseAdmin.from = (table) => {
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

  try {
    await fn({ controller, stats });
  } finally {
    supabaseAdmin.from = originalFrom;
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
