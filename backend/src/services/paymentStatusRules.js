export const PAYMENT_PLANS = {
  pro_mensal: {
    id: 'pro_mensal',
    title: 'FluxMEI Pro Mensal',
    description: 'Assinatura mensal do FluxMEI Pro',
    value: 49.9,
    tipo_cobranca: 'mensal',
    dias: 30
  },
  pro_anual: {
    id: 'pro_anual',
    title: 'FluxMEI Pro Anual',
    description: 'Assinatura anual do FluxMEI Pro',
    value: 478.8,
    tipo_cobranca: 'anual',
    dias: 365
  }
};

export function todayPlusDays(days, baseDate = new Date()) {
  const date = new Date(baseDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayIso(baseDate = new Date()) {
  return baseDate.toISOString().slice(0, 10);
}

function moneyToCents(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100);
}

function getTrialEndDate(assinatura = {}) {
  return assinatura.data_trial_fim || assinatura.data_vencimento || null;
}

export function isActiveTrialSubscription(assinatura = {}, baseDate = new Date()) {
  const trialEnd = getTrialEndDate(assinatura);
  return assinatura.status === 'teste_gratis'
    && assinatura.bloqueado === false
    && trialEnd
    && trialEnd >= todayIso(baseDate);
}

export function isActivePaidSubscription(assinatura = {}, baseDate = new Date()) {
  return assinatura.status === 'ativo'
    && assinatura.bloqueado === false
    && assinatura.data_vencimento
    && assinatura.data_vencimento >= todayIso(baseDate);
}

function buildPreservedAccessPaymentUpdates({ assinatura = {}, providerUpdates = {} }) {
  const {
    plano,
    valor,
    tipo_cobranca,
    data_inicio,
    renovacao_automatica,
    ...accessSafeProviderUpdates
  } = providerUpdates;

  return {
    ...accessSafeProviderUpdates,
    status: assinatura.status,
    bloqueado: false,
    data_vencimento: assinatura.data_vencimento,
    data_trial_fim: assinatura.data_trial_fim
  };
}

export function buildPendingPaymentAttemptUpdates({ assinatura = {}, providerUpdates = {}, baseDate = new Date() }) {
  if (isActiveTrialSubscription(assinatura, baseDate) || isActivePaidSubscription(assinatura, baseDate)) {
    return buildPreservedAccessPaymentUpdates({ assinatura, providerUpdates });
  }

  return {
    ...providerUpdates,
    status: 'pendente',
    bloqueado: true
  };
}

function applyBlockedOrPreservedCancellation(updates, assinatura, baseDate) {
  if (isActiveTrialSubscription(assinatura, baseDate) || isActivePaidSubscription(assinatura, baseDate)) {
    Object.assign(updates, {
      status: assinatura.status,
      bloqueado: false,
      data_vencimento: assinatura.data_vencimento,
      data_trial_fim: assinatura.data_trial_fim
    });
    return;
  }

  Object.assign(updates, {
    status: 'cancelado',
    bloqueado: true,
    renovacao_automatica: false
  });
}

function getMercadoPagoPaymentMetadata(payment = {}) {
  return payment.metadata || payment.metadata_info || {};
}

function getMercadoPagoPaymentPlanId(payment = {}) {
  const metadata = getMercadoPagoPaymentMetadata(payment);
  if (metadata.plano) return String(metadata.plano);

  const reference = String(payment.external_reference || '');
  if (reference.includes(':')) return reference.split(':')[2] || null;
  return null;
}

function getMercadoPagoAttempt(assinatura = {}) {
  const raw = assinatura.provider_raw || {};
  if (raw.attempt) return raw.attempt;

  const rawPlanId = getMercadoPagoPaymentPlanId(raw);
  const rawAmount = raw.transaction_amount;
  if (rawPlanId || rawAmount !== undefined) {
    return {
      plano_original: rawPlanId,
      valor_original: rawAmount,
      payment_id: raw.id ? String(raw.id) : assinatura.provider_payment_id || assinatura.mercado_pago_payment_id || null
    };
  }

  return null;
}

function buildIgnoredMercadoPagoUpdate(payment, outcome) {
  const paymentId = payment?.id ? String(payment.id) : null;
  return {
    payment_provider: 'mercado_pago',
    provider_payment_id: paymentId,
    provider_status: payment?.status,
    provider_raw: payment,
    mercado_pago_payment_id: paymentId,
    mercado_pago_status: payment?.status,
    ignored: true,
    outcome
  };
}

export function buildMercadoPagoPaymentAttempt({ plan, payment, idempotencyKey = null, method = null }) {
  return {
    plano_original: plan.id,
    valor_original: plan.value,
    tipo_cobranca_original: plan.tipo_cobranca,
    payment_id: payment?.id ? String(payment.id) : null,
    payment_method_id: payment?.payment_method_id || method || null,
    idempotency_key: idempotencyKey,
    metadata: {
      user_id: payment?.metadata?.user_id || null,
      assinatura_id: payment?.metadata?.assinatura_id || null,
      plano: plan.id
    }
  };
}

export function buildMercadoPagoProviderRaw({ payment, attempt }) {
  return {
    attempt,
    payment
  };
}

export function buildAsaasPaymentAttempt({ plan, payment = null, subscription = null, recurring = false, method = null }) {
  return {
    plano_original: plan.id,
    valor_original: plan.value,
    tipo_cobranca_original: plan.tipo_cobranca,
    payment_id: payment?.id ? String(payment.id) : null,
    subscription_id: subscription?.id ? String(subscription.id) : null,
    payment_method_id: payment?.billingType || method || null,
    recurring: Boolean(recurring)
  };
}

function parseIsoDate(value, fallbackDate) {
  if (!value) return new Date(fallbackDate);
  return new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
}

export function isAsaasPaidStatus(status) {
  return ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(String(status || '').toUpperCase());
}

export function isAsaasPendingStatus(status) {
  return ['PENDING', 'AWAITING_RISK_ANALYSIS'].includes(String(status || '').toUpperCase());
}

export function isAsaasCancelledStatus(status) {
  return ['CANCELLED', 'REFUNDED', 'REFUND_REQUESTED', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL'].includes(String(status || '').toUpperCase());
}

export function isAsaasOverdueStatus(status) {
  return String(status || '').toUpperCase() === 'OVERDUE';
}

export function buildAsaasSubscriptionUpdates(payment, assinatura, baseDate = new Date(), event = null) {
  const paymentId = payment?.id ? String(payment.id) : null;
  if (paymentId && assinatura.provider_payment_id === paymentId && assinatura.provider_status === payment?.status) {
    return {
      payment_provider: 'asaas',
      provider_payment_id: paymentId,
      provider_customer_id: payment?.customer || assinatura.provider_customer_id || null,
      provider_subscription_id: payment?.subscription || assinatura.provider_subscription_id || null,
      provider_status: payment?.status || assinatura.provider_status,
      provider_raw: payment || assinatura.provider_raw || null
    };
  }

  const rawAttempt = assinatura.provider_raw?.attempt || null;
  const originalPlanId = rawAttempt?.plano_original || assinatura.plano;
  const planConfig = PAYMENT_PLANS[originalPlanId] || PAYMENT_PLANS[assinatura.plano] || PAYMENT_PLANS.pro_mensal;
  const status = payment?.status;
  const updates = {
    payment_provider: 'asaas',
    provider_payment_id: payment?.id ? String(payment.id) : assinatura.provider_payment_id,
    provider_customer_id: payment?.customer || assinatura.provider_customer_id || null,
    provider_subscription_id: payment?.subscription || assinatura.provider_subscription_id || null,
    provider_status: status || assinatura.provider_status,
    provider_raw: {
      ...(assinatura.provider_raw && typeof assinatura.provider_raw === 'object' ? assinatura.provider_raw : {}),
      payment: payment || assinatura.provider_raw?.payment || null
    }
  };

  if (isAsaasPaidStatus(status)) {
    const accessBaseDate = parseIsoDate(payment?.dueDate || payment?.paymentDate || payment?.confirmedDate, baseDate);
    updates.status = 'ativo';
    updates.bloqueado = false;
    updates.plano = planConfig.id;
    updates.valor = planConfig.value;
    updates.tipo_cobranca = planConfig.tipo_cobranca;
    updates.data_inicio = baseDate.toISOString().slice(0, 10);
    updates.data_vencimento = todayPlusDays(planConfig.dias, accessBaseDate);
    updates.renovacao_automatica = Boolean(payment?.subscription);
  } else if (isAsaasPendingStatus(status)) {
    Object.assign(updates, buildPendingPaymentAttemptUpdates({ assinatura, baseDate }));
  } else if (isAsaasOverdueStatus(status)) {
    if (isActiveTrialSubscription(assinatura, baseDate)) {
      updates.status = assinatura.status;
      updates.bloqueado = false;
      updates.data_vencimento = assinatura.data_vencimento;
      updates.data_trial_fim = assinatura.data_trial_fim;
    } else {
      updates.status = 'vencido';
      updates.bloqueado = true;
      updates.renovacao_automatica = false;
    }
  } else if (isAsaasCancelledStatus(status)) {
    if (isActiveTrialSubscription(assinatura, baseDate)) {
      updates.status = assinatura.status;
      updates.bloqueado = false;
      updates.data_vencimento = assinatura.data_vencimento;
      updates.data_trial_fim = assinatura.data_trial_fim;
    } else {
      updates.status = 'cancelado';
      updates.bloqueado = true;
      updates.renovacao_automatica = false;
    }
  }

  if (event === 'PAYMENT_DELETED') {
    if (isActiveTrialSubscription(assinatura, baseDate)) {
      updates.status = assinatura.status;
      updates.bloqueado = false;
      updates.data_vencimento = assinatura.data_vencimento;
      updates.data_trial_fim = assinatura.data_trial_fim;
    } else {
      updates.status = 'cancelado';
      updates.bloqueado = true;
      updates.renovacao_automatica = false;
    }
  }

  return updates;
}

export function buildMercadoPagoSubscriptionUpdates(payment, assinatura, baseDate = new Date()) {
  const status = payment?.status;
  const paymentId = payment?.id ? String(payment.id) : null;
  const sameProviderPayment = paymentId && assinatura.provider_payment_id === paymentId;
  const sameLegacyPayment = paymentId && assinatura.mercado_pago_payment_id === paymentId;
  const alreadyApproved = assinatura.provider_status === 'approved'
    || assinatura.mercado_pago_status === 'approved';

  if (status === 'approved' && (sameProviderPayment || sameLegacyPayment) && alreadyApproved) {
    return {
      payment_provider: 'mercado_pago',
      provider_payment_id: paymentId,
      provider_status: status,
      provider_raw: payment,
      mercado_pago_payment_id: paymentId,
      mercado_pago_status: status,
      already_processed: true,
      outcome: 'duplicate_ignored'
    };
  }

  const attempt = getMercadoPagoAttempt(assinatura);
  const attemptPaymentId = attempt?.payment_id ? String(attempt.payment_id) : null;
  const originalPlanId = attempt?.plano_original || attempt?.metadata?.plano || null;
  const planConfig = PAYMENT_PLANS[originalPlanId];
  const paidPlanId = getMercadoPagoPaymentPlanId(payment);
  const expectedAmountCents = moneyToCents(attempt?.valor_original);
  const paidAmountCents = moneyToCents(payment?.transaction_amount);

  if (status !== 'approved' && attemptPaymentId && paymentId && attemptPaymentId !== paymentId) {
    return buildIgnoredMercadoPagoUpdate(payment, 'ignored_not_current_attempt');
  }

  if (status === 'approved') {
    if (!attempt || !attemptPaymentId || attemptPaymentId !== paymentId || !(sameProviderPayment || sameLegacyPayment)) {
      return buildIgnoredMercadoPagoUpdate(payment, 'ignored_not_current_attempt');
    }

    if (!planConfig || paidPlanId !== originalPlanId) {
      return buildIgnoredMercadoPagoUpdate(payment, 'ignored_plan_mismatch');
    }

    if (expectedAmountCents === null || paidAmountCents === null || paidAmountCents !== expectedAmountCents) {
      return buildIgnoredMercadoPagoUpdate(payment, 'ignored_amount_mismatch');
    }
  }

  const updates = {
    payment_provider: 'mercado_pago',
    provider_payment_id: paymentId,
    provider_status: status,
    provider_raw: buildMercadoPagoProviderRaw({
      payment,
      attempt: attempt || {
        plano_original: originalPlanId,
        valor_original: payment?.transaction_amount,
        payment_id: paymentId,
        metadata: getMercadoPagoPaymentMetadata(payment)
      }
    }),
    mercado_pago_payment_id: paymentId,
    mercado_pago_status: status
  };

  if (status === 'approved') {
    updates.plano = originalPlanId;
    updates.valor = planConfig.value;
    updates.tipo_cobranca = planConfig.tipo_cobranca;
    updates.status = 'ativo';
    updates.bloqueado = false;
    updates.data_inicio = baseDate.toISOString().slice(0, 10);
    updates.data_vencimento = todayPlusDays(planConfig.dias, baseDate);
    updates.renovacao_automatica = false;
  } else if (['pending', 'in_process', 'authorized'].includes(status)) {
    Object.assign(updates, buildPendingPaymentAttemptUpdates({ assinatura, baseDate }));
  } else if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(status)) {
    applyBlockedOrPreservedCancellation(updates, assinatura, baseDate);
  }

  return updates;
}
