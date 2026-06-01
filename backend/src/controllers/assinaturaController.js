import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { assinaturaService, PLANOS } from '../services/assinaturaService.js';

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

export async function planos(req, res) {
  res.json(Object.values(PLANOS));
}

export async function statusAssinatura(req, res) {
  res.json(await assinaturaService.getSubscriptionStatus(req.user.id));
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

export async function cancelarAssinatura(req, res) {
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
