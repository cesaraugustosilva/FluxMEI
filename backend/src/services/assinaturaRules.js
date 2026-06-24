export const TRIAL_DAYS = 7;
export const TRIAL_STATUS = 'teste_gratis';
export const BLOCKED_STATUSES = ['pendente', 'vencido', 'cancelado'];
export const PAYMENT_URL = '/checkout/';

export const PLANOS = {
  gratuito: {
    id: 'gratuito',
    nome: 'Teste gratis',
    preco: 0,
    tipo_cobranca: 'mensal',
    limites: { movimentacoes_mes: null, clientes: null, ia: true },
    recursos: ['7 dias gratis para testar todos os recursos']
  },
  pro_mensal: {
    id: 'pro_mensal',
    nome: 'Plano Pro Mensal',
    preco: 49.9,
    tipo_cobranca: 'mensal',
    limites: { movimentacoes_mes: null, clientes: null, ia: true },
    recursos: ['Movimentacoes ilimitadas', 'Clientes ilimitados', 'DAS', 'Calendario', 'Relatorios', 'Exportacao']
  },
  pro_anual: {
    id: 'pro_anual',
    nome: 'Plano Pro Anual',
    preco: 478.8,
    tipo_cobranca: 'anual',
    limites: { movimentacoes_mes: null, clientes: null, ia: true },
    recursos: ['Todos os recursos do Pro Mensal', 'Cobranca anual com desconto']
  }
};

export function addDaysIsoFrom(dateIso, days) {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getTrialEndDate(assinatura) {
  return assinatura?.data_trial_fim || assinatura?.data_vencimento || null;
}

export function trialExpired(assinatura, todayIso) {
  const trialEnd = getTrialEndDate(assinatura);
  return assinatura?.status === TRIAL_STATUS
    && trialEnd
    && trialEnd < todayIso;
}

export function activeSubscriptionExpired(assinatura, todayIso) {
  return assinatura?.status === 'ativo'
    && assinatura?.data_vencimento
    && assinatura.data_vencimento < todayIso;
}

export function getSubscriptionState(assinatura, allowed = true) {
  if (!assinatura) return TRIAL_STATUS;
  if (assinatura.cancel_at_period_end && ['ativo', TRIAL_STATUS].includes(assinatura.status) && !assinatura.bloqueado) {
    return 'cancelamento_agendado';
  }
  if (assinatura.status === 'ativo' && !assinatura.bloqueado) return 'ativo';
  if (assinatura.status === TRIAL_STATUS && !assinatura.bloqueado && allowed) return TRIAL_STATUS;
  if (assinatura.status === 'pendente') return 'pendente_pagamento';
  if (assinatura.status === 'vencido') return 'expirado';
  if (assinatura.bloqueado || assinatura.status === 'cancelado') return 'bloqueado';
  return assinatura.status || 'bloqueado';
}

export function statusMessage(estado, diasRestantes = 0) {
  if (estado === TRIAL_STATUS && diasRestantes <= 2) {
    return 'Seu teste gratis termina em breve. Assine agora para continuar usando sem interrupcoes.';
  }

  if (estado === TRIAL_STATUS) {
    return `Voce esta no teste gratis do FluxMEI. Faltam ${diasRestantes} dia(s) para o fim do teste.`;
  }

  if (estado === 'expirado') {
    return 'Seu acesso expirou. Para continuar usando o FluxMEI e acessar seus dados, escolha um plano.';
  }

  if (estado === 'pendente_pagamento') {
    return 'Sua assinatura esta aguardando confirmacao de pagamento.';
  }

  if (estado === 'ativo') {
    return 'Acesso completo habilitado.';
  }

  if (estado === 'cancelamento_agendado') {
    return 'Sua assinatura seguira ativa ate o fim do periodo ja pago.';
  }

  return 'Sua assinatura nao esta ativa. Escolha um plano para continuar usando o FluxMEI.';
}

export function diffDaysUntil(dateIso, todayIso) {
  if (!dateIso) return 0;
  const today = new Date(`${todayIso}T00:00:00Z`);
  const target = new Date(`${dateIso}T00:00:00Z`);
  return Math.max(0, Math.ceil((target - today) / 86400000));
}

export function buildTrialSubscriptionPayload(userId, todayIso) {
  const trialEnd = addDaysIsoFrom(todayIso, TRIAL_DAYS);
  return {
    user_id: userId,
    plano: 'gratuito',
    status: TRIAL_STATUS,
    valor: 0,
    tipo_cobranca: 'mensal',
    data_inicio: todayIso,
    data_vencimento: trialEnd,
    data_trial_fim: trialEnd,
    teste_gratis_usado: true,
    bloqueado: false,
    renovacao_automatica: false
  };
}

export function buildPendingSubscriptionPayload(userId, planId, todayIso) {
  const plano = PLANOS[planId];
  if (!plano || planId === 'gratuito') return null;

  return {
    user_id: userId,
    plano: planId,
    status: 'pendente',
    valor: plano.preco,
    tipo_cobranca: plano.tipo_cobranca,
    data_inicio: todayIso,
    data_vencimento: null,
    data_trial_fim: null,
    teste_gratis_usado: false,
    bloqueado: true,
    renovacao_automatica: false
  };
}

export function blockedPayload(assinatura, code = 'TRIAL_EXPIRED') {
  const estado = getSubscriptionState(assinatura, false);
  return {
    allowed: false,
    error: statusMessage(estado),
    code,
    estado,
    redirectTo: PAYMENT_URL,
    assinatura
  };
}

export function evaluateSubscriptionAccess(assinatura, todayIso) {
  if (!assinatura) return { allowed: true, assinatura: null, shouldCreateTrial: true };

  if (trialExpired(assinatura, todayIso) || activeSubscriptionExpired(assinatura, todayIso)) {
    return {
      ...blockedPayload({ ...assinatura, status: 'vencido', bloqueado: true, renovacao_automatica: false }),
      shouldMarkExpired: true
    };
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

export function buildSubscriptionStatus(access, todayIso) {
  const assinatura = access.assinatura;
  const trialEnd = getTrialEndDate(assinatura);
  const accessEnd = assinatura?.data_vencimento || trialEnd;
  const diasRestantes = diffDaysUntil(accessEnd, todayIso);
  const estado = getSubscriptionState(assinatura, access.allowed);
  const providerRaw = assinatura?.provider_raw || {};
  const pendingPaymentPlan = providerRaw?.attempt?.plano_original || providerRaw?.attempt?.metadata?.plano || null;
  const lastPaymentMethod = providerRaw?.attempt?.method || providerRaw?.attempt?.billingType || providerRaw?.payment?.billingType || null;

  return {
    plano: assinatura?.plano || 'gratuito',
    status: assinatura?.status || TRIAL_STATUS,
    estado,
    ativo: estado === 'ativo' || estado === 'cancelamento_agendado',
    allowed: access.allowed,
    bloqueado: !access.allowed || Boolean(assinatura?.bloqueado),
    data_inicio: assinatura?.data_inicio || null,
    data_vencimento: assinatura?.data_vencimento || null,
    data_trial_fim: trialEnd,
    cancel_at_period_end: Boolean(assinatura?.cancel_at_period_end),
    cancelled_at: assinatura?.cancelled_at || null,
    reactivated_at: assinatura?.reactivated_at || null,
    payment_provider: assinatura?.payment_provider || null,
    provider_status: assinatura?.provider_status || null,
    ultimo_pagamento_metodo: lastPaymentMethod,
    ultimo_pagamento_em: assinatura?.paid_at || null,
    pending_payment_plan: pendingPaymentPlan,
    teste_gratis_usado: Boolean(assinatura?.teste_gratis_usado),
    dias_restantes: diasRestantes,
    aviso_urgente: estado === TRIAL_STATUS && diasRestantes <= 2,
    mensagem: statusMessage(estado, diasRestantes),
    cta_url: PAYMENT_URL
  };
}
