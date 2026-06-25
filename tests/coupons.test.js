import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const couponRoutes = readFileSync(new URL('../backend/src/routes/couponRoutes.js', import.meta.url), 'utf8');
const adminRoutes = readFileSync(new URL('../backend/src/routes/adminRoutes.js', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../backend/src/server.js', import.meta.url), 'utf8');
const schemaSql = readFileSync(new URL('../backend/database/schema.sql', import.meta.url), 'utf8');
const migrationSql = readFileSync(new URL('../backend/database/migrate_coupons.sql', import.meta.url), 'utf8');
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
  }
}

test('schema e migration criam tabela de cupons', () => {
  for (const source of [schemaSql, migrationSql]) {
    assert.match(source, /create table if not exists public\.coupons/);
    assert.match(source, /discount_type text not null check/);
    assert.match(source, /current_uses integer not null default 0/);
    assert.match(source, /alter table public\.coupons enable row level security/);
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

test('registra uso do cupom', async () => {
  await withCouponMock(couponRow({ current_uses: 2 }), async ({ service, getUpdatedPayload }) => {
    const updated = await service.incrementCouponUsage('coupon-1');

    assert.equal(getUpdatedPayload().current_uses, 3);
    assert.equal(updated.current_uses, 3);
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
  assert.match(pagamentoController, /action: 'coupon\.used'/);
});
