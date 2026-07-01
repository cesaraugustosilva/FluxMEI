import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { PAYMENT_PLANS } from './paymentStatusRules.js';

const DISCOUNT_TYPES = new Set(['PERCENTAGE', 'FIXED']);

function cents(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100);
}

function moneyFromCents(value) {
  return Math.round(Number(value || 0)) / 100;
}

export function normalizeCouponCode(value) {
  const code = String(value || '').trim().toLocaleUpperCase('pt-BR').replace(/\s+/g, '');
  if (!/^[\p{L}0-9_-]{3,40}$/u.test(code)) throw new AppError('Cupom invalido.', 400);
  return code;
}

function normalizeDiscountType(value) {
  const type = String(value || '').trim().toUpperCase();
  if (!DISCOUNT_TYPES.has(type)) throw new AppError('Tipo de desconto invalido.', 400);
  return type;
}

function assertCouponUsable(coupon, now = new Date()) {
  if (!coupon) throw new AppError('Cupom nao encontrado.', 404);
  if (!coupon.active) throw new AppError('Cupom inativo.', 400);
  if (coupon.valid_from && new Date(coupon.valid_from) > now) throw new AppError('Cupom ainda nao esta vigente.', 400);
  if (coupon.valid_until && new Date(coupon.valid_until) < now) throw new AppError('Cupom expirado.', 400);
  if (coupon.max_uses != null && Number(coupon.current_uses || 0) >= Number(coupon.max_uses)) {
    throw new AppError('Cupom atingiu o limite de usos.', 400);
  }
}

export function calculateDiscount({ originalValue, discountType, discountValue }) {
  const originalCents = cents(originalValue);
  const value = Number(discountValue);

  if (originalCents <= 0) throw new AppError('Valor do plano invalido.', 400);
  if (!Number.isFinite(value) || value <= 0) throw new AppError('Valor de desconto invalido.', 400);

  let discountCents = 0;
  if (discountType === 'PERCENTAGE') {
    if (value > 100) throw new AppError('Desconto percentual invalido.', 400);
    discountCents = Math.round(originalCents * (value / 100));
  } else if (discountType === 'FIXED') {
    discountCents = cents(value);
  } else {
    throw new AppError('Tipo de desconto invalido.', 400);
  }

  if (discountCents >= originalCents) throw new AppError('Cupom nao pode zerar ou negativar o valor.', 400);

  return {
    original_value: moneyFromCents(originalCents),
    discount_amount: moneyFromCents(discountCents),
    final_value: moneyFromCents(originalCents - discountCents)
  };
}

export async function findCouponByCode(code) {
  const normalizedCode = normalizeCouponCode(code);
  const { data, error } = await supabaseAdmin
    .from('coupons')
    .select('*')
    .eq('code', normalizedCode)
    .maybeSingle();

  if (error) throw new AppError('Erro ao consultar cupom.', 500, error.message);
  return data || null;
}

export async function validateCouponForPlan(code, planId, now = new Date()) {
  const plan = PAYMENT_PLANS[planId];
  if (!plan) throw new AppError('Plano invalido.', 400);

  const coupon = await findCouponByCode(code);
  assertCouponUsable(coupon, now);
  const discountType = normalizeDiscountType(coupon.discount_type);
  const discount = calculateDiscount({
    originalValue: plan.value,
    discountType,
    discountValue: coupon.discount_value
  });

  return {
    coupon: sanitizeCoupon(coupon),
    plan_id: plan.id,
    discount_type: discountType,
    discount_value: Number(coupon.discount_value),
    ...discount
  };
}

export function buildDiscountedPlan(plan, validation) {
  if (!validation) return plan;
  return {
    ...plan,
    value: validation.final_value,
    coupon: {
      code: validation.coupon.code,
      discount_type: validation.discount_type,
      discount_value: validation.discount_value,
      discount_amount: validation.discount_amount,
      original_value: validation.original_value,
      final_value: validation.final_value
    }
  };
}

export async function incrementCouponUsage(couponId) {
  if (!couponId) return null;
  const { data, error } = await supabaseAdmin.rpc('increment_coupon_usage_atomic', {
    p_coupon_id: couponId
  });

  if (error) {
    const message = String(error.message || '');
    if (/nao encontrado/i.test(message)) throw new AppError('Cupom nao encontrado.', 404);
    if (/inativo/i.test(message)) throw new AppError('Cupom inativo.', 400);
    if (/ainda nao esta vigente/i.test(message)) throw new AppError('Cupom ainda nao esta vigente.', 400);
    if (/expirado/i.test(message)) throw new AppError('Cupom expirado.', 400);
    if (/limite de usos/i.test(message)) throw new AppError('Cupom atingiu o limite de usos.', 400);
    throw new AppError('Erro ao registrar uso do cupom.', 500, error.message);
  }

  return data;
}

export async function releaseCouponUsage(couponId) {
  if (!couponId) return null;
  const { data, error } = await supabaseAdmin.rpc('decrement_coupon_usage_atomic', {
    p_coupon_id: couponId
  });

  if (error) throw new AppError('Erro ao liberar uso do cupom.', 500, error.message);
  return data;
}

export function sanitizeCoupon(coupon = {}) {
  return {
    id: coupon.id,
    code: coupon.code,
    description: coupon.description || null,
    discount_type: coupon.discount_type,
    discount_value: Number(coupon.discount_value || 0),
    max_uses: coupon.max_uses ?? null,
    current_uses: Number(coupon.current_uses || 0),
    active: Boolean(coupon.active),
    valid_from: coupon.valid_from || null,
    valid_until: coupon.valid_until || null,
    created_at: coupon.created_at || null
  };
}

export function couponPayloadFromBody(body = {}, existing = {}) {
  const code = body.code !== undefined ? normalizeCouponCode(body.code) : existing.code;
  const discountType = body.discount_type !== undefined ? normalizeDiscountType(body.discount_type) : existing.discount_type;
  const discountValue = body.discount_value !== undefined ? Number(body.discount_value) : Number(existing.discount_value || 0);

  if (!code) throw new AppError('Codigo do cupom e obrigatorio.', 400);
  if (!Number.isFinite(discountValue) || discountValue <= 0) throw new AppError('Valor de desconto invalido.', 400);
  if (discountType === 'PERCENTAGE' && discountValue > 100) throw new AppError('Desconto percentual invalido.', 400);

  const maxUses = body.max_uses === undefined ? existing.max_uses : body.max_uses;
  if (maxUses !== null && maxUses !== undefined && (!Number.isInteger(Number(maxUses)) || Number(maxUses) < 1)) {
    throw new AppError('Limite de usos invalido.', 400);
  }

  const currentUses = body.current_uses === undefined ? existing.current_uses : body.current_uses;
  if (currentUses !== null && currentUses !== undefined && (!Number.isInteger(Number(currentUses)) || Number(currentUses) < 0)) {
    throw new AppError('Uso atual invalido.', 400);
  }

  return {
    code,
    description: body.description !== undefined ? String(body.description || '').trim().slice(0, 240) || null : existing.description || null,
    discount_type: discountType,
    discount_value: discountValue,
    max_uses: maxUses === undefined || maxUses === null || maxUses === '' ? null : Number(maxUses),
    current_uses: currentUses === undefined || currentUses === null || currentUses === '' ? Number(existing.current_uses || 0) : Number(currentUses),
    active: body.active === undefined ? Boolean(existing.active ?? true) : Boolean(body.active),
    valid_from: body.valid_from === undefined ? existing.valid_from || null : body.valid_from || null,
    valid_until: body.valid_until === undefined ? existing.valid_until || null : body.valid_until || null
  };
}
