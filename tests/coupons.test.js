import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const couponRoutes = readFileSync(new URL('../backend/src/routes/couponRoutes.js', import.meta.url), 'utf8');
const adminRoutes = readFileSync(new URL('../backend/src/routes/adminRoutes.js', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../backend/src/server.js', import.meta.url), 'utf8');
const schemaSql = readFileSync(new URL('../backend/database/schema.sql', import.meta.url), 'utf8');
const migrationSql = readFileSync(new URL('../backend/database/migrate_coupons.sql', import.meta.url), 'utf8');
const atomicCouponMigrationSql = readFileSync(new URL('../backend/database/migrate_atomic_coupon_usage.sql', import.meta.url), 'utf8');
const checkoutHtml = readFileSync(new URL('../frontend/checkout/index.html', import.meta.url), 'utf8');
const checkoutJs = readFileSync(new URL('../frontend/checkout/checkout.js', import.meta.url), 'utf8');
const adminHtml = readFileSync(new URL('../frontend/admin/index.html', import.meta.url), 'utf8');
const adminJs = readFileSync(new URL('../frontend/admin/admin.js', import.meta.url), 'utf8');
const pagamentoController = readFileSync(new URL('../backend/src/controllers/pagamentoController.js', import.meta.url), 'utf8');

function couponRow(extra = {}) {
  return {
    id: 'coupon-1',
    code: 'LANCAMENTO50',
    description: '50% OFF',
    discount_type: 'PERCENTAGE',
    discount_value: 50,
    max_uses: 10,
    current_uses: 0,
    active: true,
    valid_from: '2026-01-01T00:00:00.000Z',
    valid_until: '2026-12-31T23:59:59.000Z',
    created_at: '2026-06-24T10:00:00.000Z',
    ...extra
  };
}

async function withCouponMock(row, fn) {
  const [{ supabaseAdmin }, service] = await Promise.all([
    import('../backend/src/config/supabase.js'),
    import(`../backend/src/services/couponService.js?coupon-${Date.now()}-${Math.random()}`)
  ]);
  const originalFrom = supabaseAdmin.from;
  const originalRpc = supabaseAdmin.rpc;
  let updatedPayload = null;

  supabaseAdmin.from = (table) => {
    assert.equal(table, 'coupons');
    return {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      maybeSingle() {
        return Promise.resolve({ data: row, error: null });
      },
      update(payload) {
        updatedPayload = payload;
        return this;
      },
      single() {
        return Promise.resolve({ data: { ...row, ...updatedPayload }, error: null });
      }
    };
  };

  try {
    await fn({ service, getUpdatedPayload: () => updatedPayload });
  } finally {
    supabaseAdmin.from = originalFrom;
    supabaseAdmin.rpc = originalRpc;
  }
}

async function withCouponRpcMock(responses, fn) {
  const [{ supabaseAdmin }, service] = await Promise.all([
    import('../backend/src/config/supabase.js'),
    import(`../backend/src/services/couponService.js?coupon-rpc-${Date.now()}-${Math.random()}`)
  ]);
  const originalRpc = supabaseAdmin.rpc;
  const calls = [];
  let index = 0;

  supabaseAdmin.rpc = async (rpcName, params) => {
    calls.push({ rpcName, params });
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return response;
  };

  try {
    await fn({ service, calls });
  } finally {
    supabaseAdmin.rpc = originalRpc;
  }
}

test('schema e migration criam tabela de cupons', () => {
  for (const source of [schemaSql, migrationSql]) {
    assert.match(source, /create table if not exists public\.coupons/);
    assert.match(source, /discount_type text not null check/);
    assert.match(source, /current_uses integer not null default 0/);
    assert.match(source, /alter table public\.coupons enable row level security/);
  }
  for (const source of [schemaSql, atomicCouponMigrationSql]) {
    assert.match(source, /create or replace function public\.increment_coupon_usage_atomic\(p_coupon_id uuid\)/);
    assert.match(source, /set current_uses = current_uses \+ 1/);
    assert.match(source, /max_uses is null or current_uses < max_uses/);
    assert.match(source, /grant execute on function public\.increment_coupon_usage_atomic\(uuid\) to service_role/);
    assert.match(source, /create or replace function public\.decrement_coupon_usage_atomic\(p_coupon_id uuid\)/);
    assert.match(source, /set current_uses = greatest\(current_uses - 1, 0\)/);
    assert.match(source, /grant execute on function public\.decrement_coupon_usage_atomic\(uuid\) to service_role/);
  }
});

test('rotas de cupom estao registradas', () => {
  assert.match(couponRoutes, /router\.get\('\/validate\/:code', asyncHandler\(validateCoupon\)\)/);
  assert.match(adminRoutes, /router\.get\('\/coupons', asyncHandler\(listCoupons\)\)/);
  assert.match(adminRoutes, /router\.post\('\/coupons', asyncHandler\(createCoupon\)\)/);
  assert.match(adminRoutes, /router\.put\('\/coupons\/:id', asyncHandler\(updateCoupon\)\)/);
  assert.match(serverSource, /apiRouter\.use\('\/coupons', couponRoutes\)/);
});

test('valida cupom percentual valido', async () => {
  await withCouponMock(couponRow(), async ({ service }) => {
    const result = await service.validateCouponForPlan('lancamento50', 'pro_mensal', new Date('2026-06-24T12:00:00Z'));

    assert.equal(result.coupon.code, 'LANCAMENTO50');
    assert.equal(result.discount_type, 'PERCENTAGE');
    assert.equal(result.discount_amount, 24.95);
    assert.equal(result.final_value, 24.95);
  });
});

test('aplica desconto fixo', async () => {
  await withCouponMock(couponRow({ code: 'ANUAL20', discount_type: 'FIXED', discount_value: 20 }), async ({ service }) => {
    const result = await service.validateCouponForPlan('ANUAL20', 'pro_anual', new Date('2026-06-24T12:00:00Z'));

    assert.equal(result.discount_amount, 20);
    assert.equal(result.final_value, 458.8);
  });
});

test('rejeita cupom expirado e inativo', async () => {
  await withCouponMock(couponRow({ valid_until: '2026-01-01T00:00:00.000Z' }), async ({ service }) => {
    await assert.rejects(
      () => service.validateCouponForPlan('LANCAMENTO50', 'pro_mensal', new Date('2026-06-24T12:00:00Z')),
      /Cupom expirado/
    );
  });

  await withCouponMock(couponRow({ active: false }), async ({ service }) => {
    await assert.rejects(
      () => service.validateCouponForPlan('LANCAMENTO50', 'pro_mensal', new Date('2026-06-24T12:00:00Z')),
      /Cupom inativo/
    );
  });
});

test('rejeita cupom acima do limite e desconto negativo', async () => {
  await withCouponMock(couponRow({ max_uses: 1, current_uses: 1 }), async ({ service }) => {
    await assert.rejects(
      () => service.validateCouponForPlan('LANCAMENTO50', 'pro_mensal', new Date('2026-06-24T12:00:00Z')),
      /limite de usos/
    );
  });

  await assert.rejects(
    async () => {
      const { calculateDiscount } = await import('../backend/src/services/couponService.js?negative-discount');
      calculateDiscount({ originalValue: 49.9, discountType: 'FIXED', discountValue: 100 });
    },
    /zerar ou negativar/
  );
});

test('cupom valido incrementa uso de forma atomica', async () => {
  await withCouponRpcMock([{ data: couponRow({ current_uses: 3 }), error: null }], async ({ service, calls }) => {
    const updated = await service.incrementCouponUsage('coupon-1');

    assert.equal(calls[0].rpcName, 'increment_coupon_usage_atomic');
    assert.deepEqual(calls[0].params, { p_coupon_id: 'coupon-1' });
    assert.equal(updated.current_uses, 3);
  });
});

test('ultimo uso de cupom so permite uma chamada atomica', async () => {
  await withCouponRpcMock([
    { data: couponRow({ max_uses: 1, current_uses: 1 }), error: null },
    { data: null, error: { message: 'Cupom atingiu o limite de usos.' } }
  ], async ({ service }) => {
    const first = await service.incrementCouponUsage('coupon-1');
    assert.equal(first.current_uses, 1);

    await assert.rejects(
      () => service.incrementCouponUsage('coupon-1'),
      /limite de usos/
    );
  });
});

test('gateway pode liberar reserva atomica de cupom sem negativar uso', async () => {
  await withCouponRpcMock([{ data: couponRow({ current_uses: 0 }), error: null }], async ({ service, calls }) => {
    const updated = await service.releaseCouponUsage('coupon-1');

    assert.equal(calls[0].rpcName, 'decrement_coupon_usage_atomic');
    assert.deepEqual(calls[0].params, { p_coupon_id: 'coupon-1' });
    assert.equal(updated.current_uses, 0);
  });
});

test('incremento atomico rejeita cupom inativo expirado e limite atingido', async () => {
  await withCouponRpcMock([{ data: null, error: { message: 'Cupom inativo.' } }], async ({ service }) => {
    await assert.rejects(() => service.incrementCouponUsage('coupon-1'), /Cupom inativo/);
  });

  await withCouponRpcMock([{ data: null, error: { message: 'Cupom expirado.' } }], async ({ service }) => {
    await assert.rejects(() => service.incrementCouponUsage('coupon-1'), /Cupom expirado/);
  });

  await withCouponRpcMock([{ data: null, error: { message: 'Cupom atingiu o limite de usos.' } }], async ({ service }) => {
    await assert.rejects(() => service.incrementCouponUsage('coupon-1'), /limite de usos/);
  });
});

test('checkout e admin possuem UI de cupons', () => {
  assert.match(checkoutHtml, /id="couponCode"/);
  assert.match(checkoutHtml, /id="applyCouponButton"/);
  assert.match(checkoutJs, /function applyCoupon\(\)/);
  assert.match(checkoutJs, /\/coupons\/validate\//);
  assert.match(checkoutJs, /coupon_code/);
  assert.match(checkoutJs, /getPayableAmount\(\)/);
  assert.match(adminHtml, /id="couponForm"/);
  assert.match(adminHtml, /id="couponsTableBody"/);
  assert.match(adminJs, /apiRequest\('\/admin\/coupons'\)/);
  assert.match(adminJs, /function renderCoupons\(\)/);
});

test('pagamento registra uso e auditoria de cupom', () => {
  assert.match(pagamentoController, /applyCouponIfPresent/);
  assert.match(pagamentoController, /recordCouponUsed/);
  assert.match(pagamentoController, /incrementCouponUsage/);
  assert.match(pagamentoController, /releaseReservedCouponUsage/);
  assert.match(pagamentoController, /action: 'coupon\.used'/);
  assert.doesNotMatch(pagamentoController, /usage_increment_failed/);
});
