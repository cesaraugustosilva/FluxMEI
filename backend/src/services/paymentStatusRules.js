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

export const DEFAULT_PENDING_ATTEMPT_TTL_MS = 60 * 60 * 1000;
export const MERCADO_PAGO_PENDING_STATUSES = ['pending', 'in_process', 'authorized'];
export const EFI_BANK_PENDING_STATUSES = ['ativa', 'waiting', 'new', 'pending', 'processing', 'em_processamento'];
export const EFI_BANK_PAID_STATUSES = ['concluida', 'paid', 'settled', 'received', 'confirmed', 'approved'];
export const EFI_BANK_CANCELLED_STATUSES = [
  'removida_pelo_usuario_recebedor',
  'removida_pelo_psp',
  'canceled',
  'cancelled',
  'unpaid',
  'refunded',
  'contested',
  'failed',
  'rejected',
  'expired'
];

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
  const source = payment || {};
  return source.metadata || source.metadata_info || {};
}

function getMercadoPagoPaymentSubscriptionId(payment = {}) {
  const source = payment || {};
  const metadata = getMercadoPagoPaymentMetadata(payment);
  if (metadata.assinatura_id) return String(metadata.assinatura_id);

  const reference = String(source.external_reference || '');
  if (reference.includes(':')) return reference.split(':')[1] || null;
  return reference || null;
}

function getMercadoPagoPaymentUserId(payment = {}) {
  const source = payment || {};
  const metadata = getMercadoPagoPaymentMetadata(payment);
  if (metadata.user_id) return String(metadata.user_id);

  const reference = String(source.external_reference || '');
  if (reference.includes(':')) return reference.split(':')[0] || null;
  return null;
}

function getMercadoPagoPaymentPlanId(payment = {}) {
  const source = payment || {};
  const metadata = getMercadoPagoPaymentMetadata(payment);
  if (metadata.plano) return String(metadata.plano);

  const reference = String(source.external_reference || '');
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
    created_at: new Date().toISOString(),
    metadata: {
      user_id: payment?.metadata?.user_id || null,
      assinatura_id: payment?.metadata?.assinatura_id || null,
      plano: plan.id
    }
  };
}

export function buildEfiBankPaymentAttempt({ plan, payment, idempotencyKey = null, method = null }) {
  return {
    plano_original: plan.id,
    valor_original: plan.value,
    tipo_cobranca_original: plan.tipo_cobranca,
    payment_id: payment?.id || payment?.txid || payment?.charge_id ? String(payment.id || payment.txid || payment.charge_id) : null,
    payment_method_id: payment?.payment_method_id || method || null,
    idempotency_key: idempotencyKey,
    created_at: new Date().toISOString(),
    metadata: {
      user_id: payment?.metadata?.user_id || null,
      assinatura_id: payment?.metadata?.assinatura_id || null,
      plano: plan.id
    }
  };
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addMilliseconds(date, milliseconds) {
  return new Date(date.getTime() + milliseconds);
}

function getMercadoPagoPaymentExpiration(payment = {}) {
  return parseDate(payment.date_of_expiration)
    || parseDate(payment.expiration_date)
    || parseDate(payment.point_of_interaction?.transaction_data?.expiration_date);
}

function getMercadoPagoAttemptCreatedAt(assinatura = {}) {
  const raw = assinatura.provider_raw || {};
  const attempt = raw.attempt || {};
  return parseDate(attempt.created_at)
    || parseDate(raw.payment?.date_created)
    || parseDate(raw.payment?.date_approved)
    || parseDate(assinatura.updated_at)
    || parseDate(assinatura.created_at);
}

export function getRecentMercadoPagoPendingAttempt(assinatura = {}, plan = {}, options = {}) {
  const baseDate = options.baseDate || new Date();
  const ttlMs = options.ttlMs || DEFAULT_PENDING_ATTEMPT_TTL_MS;
  const providerStatus = assinatura.provider_status || assinatura.mercado_pago_status;
  const raw = assinatura.provider_raw || {};
  const attempt = raw.attempt || null;
  const payment = raw.payment || null;
  const attemptPlanId = attempt?.plano_original || attempt?.metadata?.plano || getMercadoPagoPaymentPlanId(payment);

  if (assinatura.payment_provider !== 'mercado_pago') return null;
  if (!MERCADO_PAGO_PENDING_STATUSES.includes(String(providerStatus || '').toLowerCase())) return null;
  if (!assinatura.provider_payment_id && !assinatura.mercado_pago_payment_id && !attempt?.payment_id) return null;
  if (!plan?.id || attemptPlanId !== plan.id) return null;

  const explicitExpiration = getMercadoPagoPaymentExpiration(payment);
  const createdAt = getMercadoPagoAttemptCreatedAt(assinatura);
  const expiresAt = explicitExpiration || (createdAt ? addMilliseconds(createdAt, ttlMs) : null);
  if (!expiresAt || expiresAt <= baseDate) return null;

  return {
    provider: 'mercado_pago',
    status: String(providerStatus || '').toLowerCase(),
    payment_id: String(assinatura.provider_payment_id || assinatura.mercado_pago_payment_id || attempt?.payment_id),
    plan_id: attemptPlanId,
    method: attempt?.payment_method_id || payment?.payment_method_id || null,
    expires_at: expiresAt.toISOString(),
    attempt,
    payment
  };
}

export function buildMercadoPagoProviderRaw({ payment, attempt }) {
  return {
    attempt,
    payment
  };
}

function getEfiBankAttempt(assinatura = {}) {
  const raw = assinatura.provider_raw || {};
  if (raw.attempt) return raw.attempt;

  const rawPayment = raw.payment || raw;
  const rawPlanId = rawPayment?.metadata?.plano || rawPayment?.fluxmei_metadata?.plano || null;
  const rawAmount = rawPayment?.amount || rawPayment?.valor?.original || rawPayment?.value;
  if (rawPlanId || rawAmount !== undefined) {
    return {
      plano_original: rawPlanId,
      valor_original: rawAmount,
      payment_id: rawPayment?.id || rawPayment?.txid || assinatura.provider_payment_id || null,
      payment_method_id: rawPayment?.payment_method_id || rawPayment?.method || null
    };
  }

  return null;
}

function normalizeEfiBankStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function normalizeEfiBankAmount(payment = {}) {
  if (payment?.amount !== undefined) return payment.amount;
  if (payment?.value !== undefined) return Number(payment.value) / 100;
  if (payment?.valor?.original !== undefined) return payment.valor.original;
  if (payment?.payment?.banking_billet?.total !== undefined) return Number(payment.payment.banking_billet.total) / 100;
  if (payment?.payment?.credit_card?.total !== undefined) return Number(payment.payment.credit_card.total) / 100;
  return null;
}

function getEfiBankPaymentPlanId(payment = {}) {
  return payment?.metadata?.plano
    || payment?.fluxmei_metadata?.plano
    || payment?.custom_id?.split?.(':')?.[2]
    || null;
}

function getEfiBankPaymentSubscriptionId(payment = {}) {
  return payment?.metadata?.assinatura_id
    || payment?.fluxmei_metadata?.assinatura_id
    || payment?.custom_id?.split?.(':')?.[1]
    || null;
}

function getEfiBankPaymentUserId(payment = {}) {
  return payment?.metadata?.user_id
    || payment?.fluxmei_metadata?.user_id
    || payment?.custom_id?.split?.(':')?.[0]
    || null;
}

function getEfiBankPaymentId(payment = {}) {
  return payment?.id || payment?.txid || payment?.charge_id || payment?.chargeId || null;
}

function cleanObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== '')
  );
}

function sanitizeEfiMetadata(metadata = {}) {
  return cleanObject({
    user_id: metadata?.user_id || null,
    assinatura_id: metadata?.assinatura_id || null,
    plano: metadata?.plano || null
  });
}

function sanitizeEfiPaymentAttempt(attempt = null) {
  if (!attempt) return null;

  return cleanObject({
    plano_original: attempt.plano_original || null,
    valor_original: attempt.valor_original ?? null,
    tipo_cobranca_original: attempt.tipo_cobranca_original || null,
    payment_id: attempt.payment_id ? String(attempt.payment_id) : null,
    payment_method_id: attempt.payment_method_id || null,
    idempotency_key: attempt.idempotency_key || null,
    created_at: attempt.created_at || null,
    metadata: sanitizeEfiMetadata(attempt.metadata || {})
  });
}

function sanitizeEfiPaymentPayload(payment = null) {
  if (!payment) return null;

  const paymentId = getEfiBankPaymentId(payment);
  const metadata = sanitizeEfiMetadata(payment.metadata || payment.fluxmei_metadata || {});

  return cleanObject({
    provider: 'efi',
    payment_id: paymentId ? String(paymentId) : null,
    txid: payment?.txid ? String(payment.txid) : null,
    charge_id: payment?.charge_id || payment?.chargeId ? String(payment.charge_id || payment.chargeId) : null,
    boleto_id: payment?.boleto_id || payment?.billet_id ? String(payment.boleto_id || payment.billet_id) : null,
    subscription_id: payment?.subscription_id || payment?.subscriptionId ? String(payment.subscription_id || payment.subscriptionId) : null,
    payment_method: payment?.payment_method_id || payment?.method || null,
    payment_method_id: payment?.payment_method_id || payment?.method || null,
    status: payment?.status || null,
    valor: normalizeEfiBankAmount(payment),
    amount: normalizeEfiBankAmount(payment),
    plano: metadata.plano || getEfiBankPaymentPlanId(payment),
    vencimento: payment?.expire_at || payment?.expires_at || payment?.expiration_date || payment?.payment?.banking_billet?.expire_at || null,
    created_at: payment?.created_at || payment?.calendario?.criacao || null,
    updated_at: payment?.updated_at || payment?.last_update || null,
    custom_id: payment?.custom_id || null,
    metadata
  });
}

function sanitizeEfiQrCode(qrcode = null) {
  if (!qrcode) return null;

  return cleanObject({
    location_id: qrcode?.loc?.id || qrcode?.location_id || null,
    ticket_url: qrcode?.linkVisualizacao || qrcode?.ticket_url || null,
    has_qrcode: Boolean(qrcode?.qrcode || qrcode?.qr_code),
    has_image: Boolean(qrcode?.imagemQrcode || qrcode?.imagem_qrcode || qrcode?.qr_code_base64)
  });
}

export function sanitizeEfiProviderRaw(payload = {}) {
  const raw = {
    provider: 'efi',
    attempt: sanitizeEfiPaymentAttempt(payload.attempt || null),
    payment: sanitizeEfiPaymentPayload(payload.payment || null),
    qrcode: sanitizeEfiQrCode(payload.qrcode || null),
    outcome: payload.outcome || null,
    timestamp: payload.timestamp || payload.created_at || null
  };

  return cleanObject(raw);
}

function buildIgnoredEfiBankUpdate(payment, outcome, attempt = null) {
  const paymentId = getEfiBankPaymentId(payment);
  return {
    payment_provider: 'efi',
    provider_payment_id: paymentId ? String(paymentId) : null,
    provider_status: payment?.status,
    provider_raw: sanitizeEfiProviderRaw({ payment, attempt, outcome }),
    ignored: true,
    outcome
  };
}

function getEfiBankPaymentExpiration(payment = {}) {
  return parseDate(payment?.expires_at)
    || parseDate(payment?.calendario?.criacao && payment?.calendario?.expiracao
      ? addMilliseconds(new Date(payment.calendario.criacao), Number(payment.calendario.expiracao) * 1000).toISOString()
      : null)
    || parseDate(payment?.expire_at)
    || parseDate(payment?.expiration_date);
}

function getEfiBankAttemptCreatedAt(assinatura = {}) {
  const raw = assinatura.provider_raw || {};
  const attempt = raw.attempt || {};
  return parseDate(attempt.created_at)
    || parseDate(raw.payment?.created_at)
    || parseDate(raw.payment?.calendario?.criacao)
    || parseDate(assinatura.updated_at)
    || parseDate(assinatura.created_at);
}

export function getRecentEfiBankPendingAttempt(assinatura = {}, plan = {}, options = {}) {
  const baseDate = options.baseDate || new Date();
  const ttlMs = options.ttlMs || DEFAULT_PENDING_ATTEMPT_TTL_MS;
  const providerStatus = assinatura.provider_status;
  const raw = assinatura.provider_raw || {};
  const attempt = raw.attempt || null;
  const payment = raw.payment || null;
  const attemptPlanId = attempt?.plano_original || attempt?.metadata?.plano || getEfiBankPaymentPlanId(payment);

  if (assinatura.payment_provider !== 'efi') return null;
  if (!EFI_BANK_PENDING_STATUSES.includes(normalizeEfiBankStatus(providerStatus))) return null;
  if (!assinatura.provider_payment_id && !attempt?.payment_id) return null;
  if (!plan?.id || attemptPlanId !== plan.id) return null;

  const explicitExpiration = getEfiBankPaymentExpiration(payment);
  const createdAt = getEfiBankAttemptCreatedAt(assinatura);
  const expiresAt = explicitExpiration || (createdAt ? addMilliseconds(createdAt, ttlMs) : null);
  if (!expiresAt || expiresAt <= baseDate) return null;

  return {
    provider: 'efi',
    status: normalizeEfiBankStatus(providerStatus),
    payment_id: String(assinatura.provider_payment_id || attempt?.payment_id),
    plan_id: attemptPlanId,
    method: attempt?.payment_method_id || payment?.payment_method_id || payment?.method || null,
    expires_at: expiresAt.toISOString(),
    attempt,
    payment,
    qrcode: raw.qrcode || null
  };
}

export function buildEfiBankProviderRaw({ payment, attempt, qrcode = null }) {
  return sanitizeEfiProviderRaw({ payment, attempt, qrcode });
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
      const oldPlanConfig = PAYMENT_PLANS[paidPlanId];
      const paymentSubscriptionId = getMercadoPagoPaymentSubscriptionId(payment);
      const paymentUserId = getMercadoPagoPaymentUserId(payment);
      const paymentMatchesSubscription = paymentSubscriptionId && assinatura.id && paymentSubscriptionId === String(assinatura.id);
      const paymentMatchesUser = paymentUserId && assinatura.user_id && paymentUserId === String(assinatura.user_id);
      const paidAmountMatchesPlan = oldPlanConfig && paidAmountCents === moneyToCents(oldPlanConfig.value);

      if (!paymentMatchesSubscription || !paymentMatchesUser || !paidAmountMatchesPlan) {
        return buildIgnoredMercadoPagoUpdate(payment, 'ignored_not_current_attempt');
      }

      return {
        payment_provider: 'mercado_pago',
        provider_payment_id: paymentId,
        provider_status: status,
        provider_raw: buildMercadoPagoProviderRaw({
          payment,
          attempt: {
            plano_original: paidPlanId,
            valor_original: oldPlanConfig.value,
            tipo_cobranca_original: oldPlanConfig.tipo_cobranca,
            payment_id: paymentId,
            payment_method_id: payment?.payment_method_id || null,
            metadata: getMercadoPagoPaymentMetadata(payment)
          }
        }),
        mercado_pago_payment_id: paymentId,
        mercado_pago_status: status,
        plano: paidPlanId,
        valor: oldPlanConfig.value,
        tipo_cobranca: oldPlanConfig.tipo_cobranca,
        status: 'ativo',
        bloqueado: false,
        data_inicio: baseDate.toISOString().slice(0, 10),
        data_vencimento: todayPlusDays(oldPlanConfig.dias, baseDate),
        renovacao_automatica: false,
        outcome: 'approved_old_attempt'
      };
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

export function buildEfiBankSubscriptionUpdates(payment, assinatura, baseDate = new Date()) {
  const status = payment?.status;
  const normalizedStatus = normalizeEfiBankStatus(status);
  const paymentId = getEfiBankPaymentId(payment);
  const sameProviderPayment = paymentId && assinatura.provider_payment_id === String(paymentId);
  const alreadyApproved = EFI_BANK_PAID_STATUSES.includes(normalizeEfiBankStatus(assinatura.provider_status));
  const attempt = getEfiBankAttempt(assinatura);

  if (EFI_BANK_PAID_STATUSES.includes(normalizedStatus) && sameProviderPayment && alreadyApproved) {
    return {
      payment_provider: 'efi',
      provider_payment_id: String(paymentId),
      provider_status: status,
      provider_raw: sanitizeEfiProviderRaw({ payment, attempt, outcome: 'duplicate_ignored' }),
      already_processed: true,
      outcome: 'duplicate_ignored'
    };
  }

  const attemptPaymentId = attempt?.payment_id ? String(attempt.payment_id) : null;
  const originalPlanId = attempt?.plano_original || attempt?.metadata?.plano || null;
  const planConfig = PAYMENT_PLANS[originalPlanId];
  const paidPlanId = getEfiBankPaymentPlanId(payment);
  const expectedAmountCents = moneyToCents(attempt?.valor_original);
  const paidAmountCents = moneyToCents(normalizeEfiBankAmount(payment));

  if (!EFI_BANK_PAID_STATUSES.includes(normalizedStatus) && attemptPaymentId && paymentId && attemptPaymentId !== String(paymentId)) {
    return buildIgnoredEfiBankUpdate(payment, 'ignored_not_current_attempt', attempt);
  }

  if (EFI_BANK_PAID_STATUSES.includes(normalizedStatus)) {
    if (!attempt || !attemptPaymentId || attemptPaymentId !== String(paymentId) || !sameProviderPayment) {
      return buildIgnoredEfiBankUpdate(payment, 'ignored_not_current_attempt', attempt);
    }

    if (!planConfig || paidPlanId !== originalPlanId) {
      return buildIgnoredEfiBankUpdate(payment, 'ignored_plan_mismatch', attempt);
    }

    if (expectedAmountCents === null || paidAmountCents === null || paidAmountCents !== expectedAmountCents) {
      return buildIgnoredEfiBankUpdate(payment, 'ignored_amount_mismatch', attempt);
    }
  }

  const updates = {
    payment_provider: 'efi',
    provider_payment_id: paymentId ? String(paymentId) : assinatura.provider_payment_id,
    provider_status: status,
    provider_raw: buildEfiBankProviderRaw({
      payment,
      attempt: attempt || {
        plano_original: originalPlanId,
        valor_original: normalizeEfiBankAmount(payment),
        payment_id: paymentId ? String(paymentId) : null,
        metadata: payment?.metadata || payment?.fluxmei_metadata || null
      }
    })
  };

  if (EFI_BANK_PAID_STATUSES.includes(normalizedStatus)) {
    updates.plano = originalPlanId;
    updates.valor = planConfig.value;
    updates.tipo_cobranca = planConfig.tipo_cobranca;
    updates.status = 'ativo';
    updates.bloqueado = false;
    updates.data_inicio = baseDate.toISOString().slice(0, 10);
    updates.data_vencimento = todayPlusDays(planConfig.dias, baseDate);
    updates.renovacao_automatica = false;
  } else if (EFI_BANK_PENDING_STATUSES.includes(normalizedStatus)) {
    Object.assign(updates, buildPendingPaymentAttemptUpdates({ assinatura, baseDate }));
  } else if (EFI_BANK_CANCELLED_STATUSES.includes(normalizedStatus)) {
    applyBlockedOrPreservedCancellation(updates, assinatura, baseDate);
  }

  return updates;
}
