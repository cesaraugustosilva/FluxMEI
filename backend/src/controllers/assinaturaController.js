import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { assinaturaService, PLANOS } from '../services/assinaturaService.js';
import {
  notifyCancellationScheduled,
  notifySubscriptionLifecycle,
  notifySubscriptionReactivated,
  safelyNotify
} from '../services/notificationService.js';
import { safelyRecordAuditLog } from '../services/auditLogService.js';

const TRIAL_DAYS = assinaturaService.TRIAL_DAYS;
const TRIAL_STATUS = assinaturaService.TRIAL_STATUS;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function payloadFromPlan(body, userId) {
  const planoId = body.plano || 'gratuito';
  const plano = PLANOS[planoId];
  if (!plano) throw new AppError('Plano inválido.');

  const status = body.status || TRIAL_STATUS;
  const isTrial = status === TRIAL_STATUS;

  return {
    user_id: userId,
    plano: planoId,
    status,
    valor: body.valor ?? (isTrial ? 0 : plano.preco),
    tipo_cobranca: plano.tipo_cobranca,
    data_inicio: body.data_inicio || todayIso(),
    data_vencimento: body.data_vencimento || (isTrial ? addDaysIso(TRIAL_DAYS) : null),
    data_trial_fim: isTrial ? (body.data_trial_fim || addDaysIso(TRIAL_DAYS)) : body.data_trial_fim,
    teste_gratis_usado: isTrial ? true : body.teste_gratis_usado,
    bloqueado: body.bloqueado ?? false,
    renovacao_automatica: body.renovacao_automatica ?? !isTrial
  };
}

function assertSelfManagedSubscriptionsEnabled() {
  if (process.env.ALLOW_SELF_MANAGED_SUBSCRIPTIONS === 'true') return;
  throw new AppError('Alterações de assinatura estão desativadas nesta instalação.', 403);
}

async function getLatestUserSubscription(userId) {
  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new AppError('Erro ao consultar assinatura.', 500, error.message);
  if (!data) throw new AppError('Assinatura nao encontrada.', 404);
  return data;
}

function hasPaidAccessUntilEnd(assinatura) {
  return Boolean(
    assinatura
    && assinatura.data_vencimento
    && assinatura.data_vencimento >= todayIso()
    && !assinatura.bloqueado
    && ['ativo', TRIAL_STATUS].includes(assinatura.status)
  );
}

export async function planos(req, res) {
  res.json(Object.values(PLANOS));
}

export async function statusAssinatura(req, res) {
  const status = await assinaturaService.getSubscriptionStatus(req.user.id);
  await safelyNotify(notifySubscriptionLifecycle, status, req.user.id);
  res.json(status);
}

export async function listAssinaturas(req, res) {
  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) throw new AppError('Erro ao listar assinaturas.', 500, error.message);
  res.json(data);
}

export async function createAssinatura(req, res) {
  assertSelfManagedSubscriptionsEnabled();
  const payload = payloadFromPlan(req.body, req.user.id);
  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .insert(payload)
    .select()
    .single();

  if (error) throw new AppError('Erro ao criar assinatura.', 500, error.message);
  res.status(201).json(data);
}

export async function updateAssinatura(req, res) {
  assertSelfManagedSubscriptionsEnabled();
  const allowed = ['plano', 'status', 'valor', 'data_inicio', 'data_vencimento', 'data_trial_fim', 'teste_gratis_usado', 'bloqueado', 'renovacao_automatica'];
  const payload = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));

  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .update(payload)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) throw new AppError('Assinatura não encontrada ou não atualizada.', 404);
  res.json(data);
}

export async function cancelarAssinaturaLegado(req, res) {
  assertSelfManagedSubscriptionsEnabled();
  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .update({ status: 'cancelado', renovacao_automatica: false })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) throw new AppError('Assinatura não encontrada.', 404);
  res.json(data);
}

export async function cancelarAssinatura(req, res) {
  const assinatura = await getLatestUserSubscription(req.user.id);
  const preserveAccess = hasPaidAccessUntilEnd(assinatura);
  const updates = preserveAccess
    ? {
        cancel_at_period_end: true,
        cancelled_at: new Date().toISOString(),
        reactivated_at: null,
        renovacao_automatica: false
      }
    : {
        status: 'cancelado',
        bloqueado: true,
        cancel_at_period_end: false,
        cancelled_at: new Date().toISOString(),
        reactivated_at: null,
        renovacao_automatica: false
      };

  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .update(updates)
    .eq('id', assinatura.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) throw new AppError('Erro ao cancelar assinatura.', 500, error.message);
  await safelyNotify(notifyCancellationScheduled, { assinatura: data });
  await safelyRecordAuditLog({
    req,
    userId: req.user.id,
    actorUserId: req.user.id,
    action: 'subscription.cancel_scheduled',
    entityType: 'subscription',
    entityId: data.id,
    metadata: {
      plan: data.plano,
      status: data.status,
      cancel_at_period_end: data.cancel_at_period_end,
      preserve_access: preserveAccess,
      data_vencimento: data.data_vencimento
    }
  });
  res.json({
    success: true,
    message: preserveAccess
      ? `Sua assinatura sera encerrada em ${data.data_vencimento}.`
      : 'Sua assinatura foi cancelada.',
    assinatura: data
  });
}

export async function reativarAssinatura(req, res) {
  const assinatura = await getLatestUserSubscription(req.user.id);
  const insidePaidPeriod = hasPaidAccessUntilEnd(assinatura);

  if (!insidePaidPeriod) {
    res.json({
      success: true,
      action: 'checkout',
      checkout_url: `/checkout/?plan=${encodeURIComponent(assinatura.plano && assinatura.plano !== 'gratuito' ? assinatura.plano : 'pro_mensal')}`,
      message: 'Sua assinatura esta vencida. Reative escolhendo um plano no checkout.'
    });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .update({
      cancel_at_period_end: false,
      cancelled_at: null,
      reactivated_at: new Date().toISOString(),
      renovacao_automatica: true
    })
    .eq('id', assinatura.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) throw new AppError('Erro ao reativar assinatura.', 500, error.message);
  await safelyNotify(notifySubscriptionReactivated, { assinatura: data });
  await safelyRecordAuditLog({
    req,
    userId: req.user.id,
    actorUserId: req.user.id,
    action: 'subscription.reactivated',
    entityType: 'subscription',
    entityId: data.id,
    metadata: {
      plan: data.plano,
      status: data.status,
      data_vencimento: data.data_vencimento
    }
  });
  res.json({
    success: true,
    action: 'reactivated',
    message: 'Sua assinatura foi reativada.',
    assinatura: data
  });
}
