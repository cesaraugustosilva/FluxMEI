import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';

const TRIAL_DAYS = 7;
const TRIAL_STATUS = 'teste_gratis';
const BLOCKED_STATUSES = ['pendente', 'vencido', 'cancelado'];

export const PLANOS = {
  gratuito: {
    id: 'gratuito',
    nome: 'Teste grátis',
    preco: 0,
    tipo_cobranca: 'mensal',
    limites: { movimentacoes_mes: null, clientes: null, ia: true },
    recursos: ['7 dias grátis para testar todos os recursos']
  },
  pro_mensal: {
    id: 'pro_mensal',
    nome: 'Plano Pro Mensal',
    preco: 49.9,
    tipo_cobranca: 'mensal',
    limites: { movimentacoes_mes: null, clientes: null, ia: true },
    recursos: ['Movimentações ilimitadas', 'Clientes ilimitados', 'DAS', 'Calendário', 'Relatórios', 'Exportação']
  },
  pro_anual: {
    id: 'pro_anual',
    nome: 'Plano Pro Anual',
    preco: 478.8,
    tipo_cobranca: 'anual',
    limites: { movimentacoes_mes: null, clientes: null, ia: true },
    recursos: ['Todos os recursos do Pro Mensal', 'Cobrança anual com desconto']
  }
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function diffDaysUntil(dateIso) {
  if (!dateIso) return 0;
  const today = new Date(`${todayIso()}T00:00:00Z`);
  const target = new Date(`${dateIso}T00:00:00Z`);
  return Math.max(0, Math.ceil((target - today) / 86400000));
}

function trialExpired(assinatura) {
  return assinatura?.status === TRIAL_STATUS
    && assinatura.data_vencimento
    && assinatura.data_vencimento < todayIso();
}

function blockedPayload(assinatura, code = 'TRIAL_EXPIRED') {
  return {
    allowed: false,
    error: 'Teste grátis expirado',
    code,
    redirectTo: '/app/payment/index.html',
    assinatura
  };
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

  const trialEnd = addDaysIso(TRIAL_DAYS);
  const payload = {
    user_id: userId,
    plano: 'gratuito',
    status: TRIAL_STATUS,
    valor: 0,
    tipo_cobranca: 'mensal',
    data_inicio: todayIso(),
    data_vencimento: trialEnd,
    data_trial_fim: trialEnd,
    teste_gratis_usado: true,
    bloqueado: false,
    renovacao_automatica: false
  };

  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .insert(payload)
    .select()
    .single();

  if (error) throw new AppError('Erro ao criar assinatura de teste grátis.', 500, error.message);
  return data;
}

async function createPendingSubscription(userId, planId = 'pro_mensal') {
  const existing = await getLatestSubscription(userId);
  if (existing) return existing;

  const plano = PLANOS[planId];
  if (!plano || planId === 'gratuito') throw new AppError('Plano invalido.');

  const payload = {
    user_id: userId,
    plano: planId,
    status: 'pendente',
    valor: plano.preco,
    tipo_cobranca: plano.tipo_cobranca,
    data_inicio: todayIso(),
    data_vencimento: null,
    data_trial_fim: null,
    teste_gratis_usado: false,
    bloqueado: true,
    renovacao_automatica: false
  };

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

async function markTrialExpired(assinatura) {
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

  if (trialExpired(assinatura)) {
    assinatura = await markTrialExpired(assinatura);
    return blockedPayload(assinatura);
  }

  if (assinatura.status === 'ativo' && !assinatura.bloqueado) {
    return { allowed: true, assinatura };
  }

  if (assinatura.status === TRIAL_STATUS && !assinatura.bloqueado) {
    return { allowed: true, assinatura };
  }

  if (assinatura.bloqueado || BLOCKED_STATUSES.includes(assinatura.status)) {
    return blockedPayload(assinatura, assinatura.status === 'vencido' ? 'TRIAL_EXPIRED' : 'SUBSCRIPTION_BLOCKED');
  }

  return { allowed: true, assinatura };
}

async function getSubscriptionStatus(userId) {
  const access = await evaluateAccess(userId);
  const assinatura = access.assinatura;

  return {
    plano: assinatura?.plano || 'gratuito',
    status: assinatura?.status || TRIAL_STATUS,
    bloqueado: !access.allowed || Boolean(assinatura?.bloqueado),
    data_inicio: assinatura?.data_inicio || null,
    data_vencimento: assinatura?.data_vencimento || null,
    data_trial_fim: assinatura?.data_trial_fim || assinatura?.data_vencimento || null,
    dias_restantes: assinatura?.status === TRIAL_STATUS ? diffDaysUntil(assinatura.data_vencimento) : 0
  };
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
