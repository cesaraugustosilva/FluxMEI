import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { safelyRecordAuditLog } from '../services/auditLogService.js';
import {
  couponPayloadFromBody,
  sanitizeCoupon,
  validateCouponForPlan
} from '../services/couponService.js';

export async function validateCoupon(req, res) {
  const planId = String(req.query.plan || req.query.plano || 'pro_mensal');
  const coupon = await validateCouponForPlan(req.params.code, planId);

  res.json({
    success: true,
    coupon
  });
}

export async function listCoupons(req, res) {
  const { data, error } = await supabaseAdmin
    .from('coupons')
    .select('id,code,description,discount_type,discount_value,max_uses,current_uses,active,valid_from,valid_until,created_at')
    .order('created_at', { ascending: false });

  if (error) throw new AppError('Erro ao listar cupons.', 500, error.message);
  res.json({
    success: true,
    coupons: (data || []).map(sanitizeCoupon)
  });
}

export async function createCoupon(req, res) {
  const payload = couponPayloadFromBody(req.body || {});
  const { data, error } = await supabaseAdmin
    .from('coupons')
    .insert(payload)
    .select()
    .single();

  if (error) throw new AppError('Erro ao criar cupom.', 500, error.message);
  await safelyRecordAuditLog({
    req,
    userId: req.user?.id,
    actorUserId: req.user?.id,
    action: 'coupon.created',
    entityType: 'coupon',
    entityId: data.id,
    metadata: { code: data.code, discount_type: data.discount_type, discount_value: data.discount_value }
  });
  res.status(201).json({ success: true, coupon: sanitizeCoupon(data) });
}

export async function updateCoupon(req, res) {
  const { data: existing, error: findError } = await supabaseAdmin
    .from('coupons')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();

  if (findError) throw new AppError('Erro ao consultar cupom.', 500, findError.message);
  if (!existing) throw new AppError('Cupom nao encontrado.', 404);

  const payload = couponPayloadFromBody(req.body || {}, existing);
  const { data, error } = await supabaseAdmin
    .from('coupons')
    .update(payload)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) throw new AppError('Erro ao atualizar cupom.', 500, error.message);
  await safelyRecordAuditLog({
    req,
    userId: req.user?.id,
    actorUserId: req.user?.id,
    action: 'coupon.updated',
    entityType: 'coupon',
    entityId: data.id,
    metadata: { code: data.code, active: data.active, discount_type: data.discount_type, discount_value: data.discount_value }
  });
  res.json({ success: true, coupon: sanitizeCoupon(data) });
}
