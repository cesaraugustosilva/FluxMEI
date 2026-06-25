import crypto from 'node:crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { safelyRecordAuditLog } from './auditLogService.js';

const REFERRAL_REWARD_DAYS = 15;
const CODE_PREFIX = 'FLUX';
const CODE_PATTERN = /^[A-Z0-9_-]{4,40}$/;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(dateIso, days) {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

export function normalizeReferralCode(value) {
  const code = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!code) return null;
  if (!CODE_PATTERN.test(code)) throw new AppError('Codigo de indicacao invalido.', 400);
  return code;
}

function buildReferralCode(seed = '') {
  const digest = crypto
    .createHash('sha256')
    .update(`${seed}:${crypto.randomUUID()}`)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase();
  return `${CODE_PREFIX}${digest}`;
}

async function findProfileByReferralCode(code) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id,referral_code')
    .eq('referral_code', code)
    .maybeSingle();

  if (error) throw new AppError('Erro ao validar indicacao.', 500, error.message);
  return data || null;
}

async function generateUniqueReferralCode(userId) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = buildReferralCode(userId);
    const existing = await findProfileByReferralCode(code);
    if (!existing) return code;
  }
  throw new AppError('Nao foi possivel gerar codigo de indicacao.', 500);
}

export async function ensureUserReferralCode(userId) {
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('id,referral_code')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new AppError('Erro ao consultar codigo de indicacao.', 500, error.message);
  if (profile?.referral_code) return profile.referral_code;

  const referralCode = await generateUniqueReferralCode(userId);
  const { data, error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({ referral_code: referralCode })
    .eq('id', userId)
    .select('referral_code')
    .single();

  if (updateError) throw new AppError('Erro ao salvar codigo de indicacao.', 500, updateError.message);
  return data.referral_code;
}

export async function createReferralFromCode({ referralCode, referredUserId, req = null } = {}) {
  let code = null;
  try {
    code = normalizeReferralCode(referralCode);
  } catch {
    return null;
  }
  if (!code || !referredUserId) return null;

  const referrer = await findProfileByReferralCode(code);
  if (!referrer || referrer.id === referredUserId) return null;

  const payload = {
    referrer_user_id: referrer.id,
    referred_user_id: referredUserId,
    referral_code: code,
    status: 'pending',
    reward_days: REFERRAL_REWARD_DAYS
  };

  const { data, error } = await supabaseAdmin
    .from('referrals')
    .upsert(payload, { onConflict: 'referred_user_id', ignoreDuplicates: true })
    .select()
    .maybeSingle();

  if (error) throw new AppError('Erro ao registrar indicacao.', 500, error.message);

  if (data) {
    await safelyRecordAuditLog({
      req,
      userId: referredUserId,
      actorUserId: referredUserId,
      action: 'referral.created',
      entityType: 'referral',
      entityId: data.id,
      metadata: {
        referrer_user_id: referrer.id,
        referral_code: code
      }
    });
  }

  return data || null;
}

async function getLatestReferrerSubscription(userId) {
  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .select('id,user_id,data_vencimento,status,bloqueado')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new AppError('Erro ao consultar assinatura do indicador.', 500, error.message);
  return data || null;
}

async function extendReferrerSubscription(referral) {
  const assinatura = await getLatestReferrerSubscription(referral.referrer_user_id);
  if (!assinatura?.id) return null;

  const baseDate = assinatura.data_vencimento && assinatura.data_vencimento > todayIso()
    ? assinatura.data_vencimento
    : todayIso();
  const dataVencimento = addDaysIso(baseDate, referral.reward_days || REFERRAL_REWARD_DAYS);

  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .update({
      data_vencimento: dataVencimento,
      status: 'ativo',
      bloqueado: false
    })
    .eq('id', assinatura.id)
    .select()
    .single();

  if (error) throw new AppError('Erro ao aplicar recompensa de indicacao.', 500, error.message);
  return data;
}

export async function rewardReferralForPaidUser(referredUserId, { paymentId = null, provider = null, req = null } = {}) {
  if (!referredUserId) return null;

  const { data: referral, error } = await supabaseAdmin
    .from('referrals')
    .select('*')
    .eq('referred_user_id', referredUserId)
    .in('status', ['pending', 'converted'])
    .is('rewarded_at', null)
    .maybeSingle();

  if (error) throw new AppError('Erro ao consultar indicacao.', 500, error.message);
  if (!referral || referral.referrer_user_id === referredUserId) return null;

  const assinatura = await extendReferrerSubscription(referral);
  const now = new Date().toISOString();
  const nextStatus = assinatura ? 'rewarded' : 'converted';

  const { data: updatedReferral, error: updateError } = await supabaseAdmin
    .from('referrals')
    .update({
      status: nextStatus,
      rewarded_at: assinatura ? now : null
    })
    .eq('id', referral.id)
    .is('rewarded_at', null)
    .select()
    .single();

  if (updateError) throw new AppError('Erro ao atualizar indicacao.', 500, updateError.message);

  if (assinatura) {
    await safelyRecordAuditLog({
      req,
      userId: referral.referrer_user_id,
      actorUserId: referredUserId,
      action: 'referral.rewarded',
      entityType: 'referral',
      entityId: referral.id,
      metadata: {
        referred_user_id: referredUserId,
        payment_id: paymentId,
        provider,
        reward_days: referral.reward_days,
        subscription_id: assinatura.id,
        data_vencimento: assinatura.data_vencimento
      }
    });
  }

  return { referral: updatedReferral, assinatura };
}

export async function getReferralSummary(userId) {
  const referralCode = await ensureUserReferralCode(userId);
  const { data, error } = await supabaseAdmin
    .from('referrals')
    .select('id,status,reward_days,rewarded_at,created_at')
    .eq('referrer_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw new AppError('Erro ao consultar indicacoes.', 500, error.message);

  const referrals = data || [];
  return {
    referral_code: referralCode,
    reward_days: REFERRAL_REWARD_DAYS,
    stats: {
      pending: referrals.filter((item) => item.status === 'pending').length,
      converted: referrals.filter((item) => item.status === 'converted').length,
      rewarded: referrals.filter((item) => item.status === 'rewarded').length
    },
    referrals
  };
}

export async function getReferralMetrics() {
  const { data, error } = await supabaseAdmin
    .from('referrals')
    .select('status');

  if (error) throw new AppError('Erro ao consultar metricas de indicacao.', 500, error.message);
  const referrals = data || [];
  return {
    indicacoes_pendentes: referrals.filter((item) => item.status === 'pending').length,
    indicacoes_convertidas: referrals.filter((item) => item.status === 'converted').length,
    indicacoes_recompensadas: referrals.filter((item) => item.status === 'rewarded').length
  };
}
