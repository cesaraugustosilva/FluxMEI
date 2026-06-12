import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import {
  PLANOS,
  TRIAL_DAYS,
  TRIAL_STATUS,
  buildPendingSubscriptionPayload,
  buildSubscriptionStatus,
  buildTrialSubscriptionPayload,
  evaluateSubscriptionAccess
} from './assinaturaRules.js';

export { PLANOS };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function getLatestSubscription(userId) {
  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new AppError('Erro ao consultar assinatura.', 500, error.message);
  return data || null;
}

async function createTrialSubscription(userId) {
  const existing = await getLatestSubscription(userId);
  if (existing) return existing;

  const payload = buildTrialSubscriptionPayload(userId, todayIso());
  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .insert(payload)
    .select()
    .single();

  if (error) throw new AppError('Erro ao criar assinatura de teste gratis.', 500, error.message);
  return data;
}

async function createPendingSubscription(userId, planId = 'pro_mensal') {
  const existing = await getLatestSubscription(userId);
  if (existing) return existing;

  const payload = buildPendingSubscriptionPayload(userId, planId, todayIso());
  if (!payload) throw new AppError('Plano invalido.');

  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .insert(payload)
    .select()
    .single();

  if (error) throw new AppError('Erro ao criar assinatura pendente.', 500, error.message);
  return data;
}

async function ensureTrialSubscription(userId) {
  const existing = await getLatestSubscription(userId);
  if (existing) return existing;
  return createTrialSubscription(userId);
}

async function markSubscriptionExpired(assinatura) {
  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .update({ status: 'vencido', bloqueado: true, renovacao_automatica: false })
    .eq('id', assinatura.id)
    .select()
    .single();

  if (error) throw new AppError('Erro ao atualizar assinatura vencida.', 500, error.message);
  return data;
}

async function evaluateAccess(userId) {
  let assinatura = await ensureTrialSubscription(userId);
  let access = evaluateSubscriptionAccess(assinatura, todayIso());

  if (access.shouldMarkExpired) {
    assinatura = await markSubscriptionExpired(assinatura);
    access = evaluateSubscriptionAccess(assinatura, todayIso());
  }

  return access;
}

async function getSubscriptionStatus(userId) {
  const access = await evaluateAccess(userId);
  return buildSubscriptionStatus(access, todayIso());
}

async function checkFeature(userId) {
  return evaluateAccess(userId);
}

export const assinaturaService = {
  PLANOS,
  TRIAL_DAYS,
  TRIAL_STATUS,
  createTrialSubscription,
  createPendingSubscription,
  ensureTrialSubscription,
  evaluateAccess,
  getSubscriptionStatus,
  checkFeature
};
