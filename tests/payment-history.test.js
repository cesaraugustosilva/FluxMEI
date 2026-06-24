import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pagamentoRoutes = readFileSync(new URL('../backend/src/routes/pagamentoRoutes.js', import.meta.url), 'utf8');

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

async function withMockedHistory(rows, fn) {
  const [{ supabaseAdmin }, controller] = await Promise.all([
    import('../backend/src/config/supabase.js'),
    import('../backend/src/controllers/pagamentoController.js?payment-history-tests')
  ]);

  const originalFrom = supabaseAdmin.from;
  const stats = {
    table: null,
    select: null,
    eq: [],
    not: [],
    order: null,
    limit: null
  };

  supabaseAdmin.from = (table) => {
    stats.table = table;
    return {
      select(columns) {
        stats.select = columns;
        return this;
      },
      eq(column, value) {
        stats.eq.push([column, value]);
        return this;
      },
      not(column, operator, value) {
        stats.not.push([column, operator, value]);
        return this;
      },
      order(column, options) {
        stats.order = [column, options];
        return this;
      },
      limit(value) {
        stats.limit = value;
        return Promise.resolve({ data: rows.slice(0, value), error: null });
      }
    };
  };

  try {
    await fn({ historicoPagamentos: controller.historicoPagamentos, stats });
  } finally {
    supabaseAdmin.from = originalFrom;
  }
}

test('rota de historico exige autenticacao', () => {
  assert.match(pagamentoRoutes, /router\.get\('\/historico', authMiddleware, asyncHandler\(historicoPagamentos\)\)/);
});

test('historico de pagamentos filtra usuario, ordena e limita a 10', async () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    id: `sub-${index}`,
    user_id: index === 11 ? 'other-user' : 'user-1',
    created_at: `2026-06-${String(24 - index).padStart(2, '0')}T10:00:00.000Z`,
    paid_at: index === 0 ? '2026-06-24T10:10:00.000Z' : null,
    plano: index === 1 ? 'pro_anual' : 'pro_mensal',
    valor: index === 1 ? 478.8 : 49.9,
    status: 'ativo',
    payment_provider: 'asaas',
    provider_payment_id: `pay-${index}`,
    provider_status: index === 0 ? 'RECEIVED' : 'PENDING',
    checkout_url: index === 2 ? 'https://boleto.example/2' : null,
    provider_raw: {
      attempt: {
        plano_original: index === 1 ? 'pro_anual' : 'pro_mensal',
        valor_original: index === 1 ? 478.8 : 49.9,
        method: index === 2 ? 'boleto' : 'pix'
      },
      payment: {
        status: 'RECEIVED',
        cpfCnpj: '12345678901',
        card: { number: '4111111111111111' }
      }
    }
  }));

  await withMockedHistory(rows, async ({ historicoPagamentos, stats }) => {
    const res = createRes();
    await historicoPagamentos({ user: { id: 'user-1' } }, res);

    assert.equal(stats.table, 'assinaturas');
    assert.deepEqual(stats.eq, [['user_id', 'user-1']]);
    assert.deepEqual(stats.not, [['provider_payment_id', 'is', null]]);
    assert.deepEqual(stats.order, ['created_at', { ascending: false }]);
    assert.equal(stats.limit, 10);
    assert.equal(res.payload.success, true);
    assert.equal(res.payload.payments.length, 10);
    assert.equal(res.payload.payments[0].id, 'pay-0');
    assert.equal(res.payload.payments[0].payment_method, 'pix');
    assert.equal(res.payload.payments[2].link, 'https://boleto.example/2');
    assert.doesNotMatch(JSON.stringify(res.payload), /provider_raw|cpfCnpj|4111111111111111|12345678901/);
  });
});
