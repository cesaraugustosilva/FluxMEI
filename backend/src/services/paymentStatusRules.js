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
export const ASAAS_PENDING_STATUSES = ['pending', 'awaiting_risk_analysis'];
export const ASAAS_PAID_STATUSES = ['received', 'confirmed', 'received_in_cash'];
export const ASAAS_CANCELLED_STATUSES = [
  'cancelled',
  'refunded',
  'refund_requested',
  'chargeback_requested',
  'chargeback_dispute',
  'awaiting_chargeback_reversal',
  'deleted',
  'payment_deleted'
];
export const ASAAS_OVERDUE_STATUSES = ['overdue'];
export const EFI_BANK_PENDING_STATUSES = ['ativa', 'active', 'aguardando', 'waiting', 'new', 'pending', 'processing', 'em_processamento'];
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
  'expired',
  'vencido',
  'vencida'
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

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addMilliseconds(date, milliseconds) {
  return new Date(date.getTime() + milliseconds);
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

function applyBlockedOrPreservedCancellation(updates, assinatura, baseDate, status = 'cancelado') {
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
    status,
    bloqueado: true,
    renovacao_automatica: false
  });
}

function cleanObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== '')
  );
}

function normalizeAsaasStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function normalizeAsaasAmount(payment = {}) {
  if (payment?.value !== undefined) return payment.value;
  if (payment?.amount !== undefined) return payment.amount;
  if (payment?.netValue !== undefined) return payment.netValue;
  return null;
}

function getAsaasPaymentId(payment = {}) {
  return payment?.id || payment?.payment_id || null;
}

function getAsaasPaymentPlanId(payment = {}) {
  const reference = String(payment?.externalReference || '');
  if (reference.includes(':')) return reference.split(':')[2] || null;
  return payment?.metadata?.plano || null;
}

function getAsaasPaymentSubscriptionId(payment = {}) {
  const reference = String(payment?.externalReference || '');
  if (reference.includes(':')) return reference.split(':')[1] || null;
  return reference || null;
}

function sanitizeAsaasPaymentAttempt(attempt = null) {
  if (!attempt) return null;

  return cleanObject({
    plano_original: attempt.plano_original || null,
    valor_original: attempt.valor_original ?? null,
    tipo_cobranca_original: attempt.tipo_cobranca_original || null,
    payment_id: attempt.payment_id ? String(attempt.payment_id) : null,
    payment_method_id: attempt.payment_method_id || null,
    created_at: attempt.created_at || null,
    metadata: cleanObject(attempt.metadata || {})
  });
}

function sanitizeAsaasPaymentPayload(payment = null) {
  if (!payment) return null;

  const paymentId = getAsaasPaymentId(payment);
  return cleanObject({
    provider: 'asaas',
    payment_id: paymentId ? String(paymentId) : null,
    customer_id: payment?.customer || null,
    subscription_id: payment?.subscription || null,
    status: payment?.status || null,
    billing_type: payment?.billingType || payment?.payment_method_id || null,
    value: normalizeAsaasAmount(payment),
    due_date: payment?.dueDate || null,
    payment_date: payment?.paymentDate || null,
    confirmed_date: payment?.confirmedDate || null,
    invoice_url: payment?.invoiceUrl || null,
    bank_slip_url: payment?.bankSlipUrl || null,
    digitable_line: payment?.identificationField || payment?.digitableLine || null,
    external_reference: payment?.externalReference || null
  });
}

function sanitizeAsaasPixQrCode(qrcode = null) {
  if (!qrcode) return null;

  return cleanObject({
    has_qrcode: Boolean(qrcode?.payload || qrcode?.qr_code),
    has_image: Boolean(qrcode?.encodedImage || qrcode?.encoded_image || qrcode?.qr_code_base64),
    expiration_date: qrcode?.expirationDate || qrcode?.expiration_date || null
  });
}

export function sanitizeAsaasProviderRaw(payload = {}) {
  return cleanObject({
    provider: 'asaas',
    attempt: sanitizeAsaasPaymentAttempt(payload.attempt || null),
    payment: sanitizeAsaasPaymentPayload(payload.payment || null),
    pixQrCode: sanitizeAsaasPixQrCode(payload.pixQrCode || null),
    outcome: payload.outcome || null,
    timestamp: payload.timestamp || payload.created_at || null
  });
}

export function buildAsaasPaymentAttempt({ plan, payment = null, method = null }) {
  return {
    plano_original: plan.id,
    valor_original: plan.value,
    tipo_cobranca_original: plan.tipo_cobranca,
    payment_id: getAsaasPaymentId(payment) ? String(getAsaasPaymentId(payment)) : null,
    payment_method_id: payment?.billingType || method || null,
    created_at: new Date().toISOString(),
    metadata: {
      user_id: payment?.metadata?.user_id || null,
      assinatura_id: getAsaasPaymentSubscriptionId(payment),
      plano: plan.id
    }
  };
}

export function buildAsaasProviderRaw({ payment, attempt, pixQrCode = null }) {
  return sanitizeAsaasProviderRaw({ payment, attempt, pixQrCode });
}

function getAsaasAttempt(assinatura = {}) {
  const raw = assinatura.provider_raw || {};
  if (raw.attempt) return raw.attempt;

  const rawPayment = raw.payment || raw;
  const rawPlanId = getAsaasPaymentPlanId(rawPayment);
  const rawAmount = rawPayment?.value || rawPayment?.valor || rawPayment?.amount;
  if (rawPlanId || rawAmount !== undefined) {
    return {
      plano_original: rawPlanId,
      valor_original: rawAmount,
      payment_id: rawPayment?.payment_id || rawPayment?.id || assinatura.provider_payment_id || null,
      payment_method_id: rawPayment?.billing_type || rawPayment?.billingType || null
    };
  }

  return null;
}

function buildIgnoredAsaasUpdate(payment, outcome, attempt = null) {
  const paymentId = getAsaasPaymentId(payment);
  return {
    payment_provider: 'asaas',
    provider_payment_id: paymentId ? String(paymentId) : null,
    provider_customer_id: payment?.customer || null,
    provider_subscription_id: payment?.subscription || null,
    provider_status: payment?.status,
    provider_raw: sanitizeAsaasProviderRaw({ payment, attempt, outcome }),
    ignored: true,
    outcome
  };
}

function getAsaasAttemptCreatedAt(assinatura = {}) {
  const raw = assinatura.provider_raw || {};
  const attempt = raw.attempt || {};
  return parseDate(attempt.created_at)
    || parseDate(raw.payment?.created_at)
    || parseDate(raw.payment?.dateCreated)
    || parseDate(assinatura.updated_at)
    || parseDate(assinatura.created_at);
}

export function getRecentAsaasPendingAttempt(assinatura = {}, plan = {}, options = {}) {
  const baseDate = options.baseDate || new Date();
  const ttlMs = options.ttlMs || DEFAULT_PENDING_ATTEMPT_TTL_MS;
  const providerStatus = assinatura.provider_status;
  const raw = assinatura.provider_raw || {};
  const attempt = raw.attempt || null;
  const payment = raw.payment || null;
  const attemptPlanId = attempt?.plano_original || attempt?.metadata?.plano || getAsaasPaymentPlanId(payment);

  if (assinatura.payment_provider !== 'asaas') return null;
  if (!ASAAS_PENDING_STATUSES.includes(normalizeAsaasStatus(providerStatus))) return null;
  if (!assinatura.provider_payment_id && !attempt?.payment_id) return null;
  if (!plan?.id || attemptPlanId !== plan.id) return null;

  const createdAt = getAsaasAttemptCreatedAt(assinatura);
  const expiresAt = createdAt ? addMilliseconds(createdAt, ttlMs) : null;
  if (!expiresAt || expiresAt <= baseDate) return null;

  return {
    provider: 'asaas',
    status: normalizeAsaasStatus(providerStatus),
    payment_id: String(assinatura.provider_payment_id || attempt?.payment_id),
    plan_id: attemptPlanId,
    method: String(attempt?.payment_method_id || payment?.billing_type || payment?.billingType || '').toLowerCase(),
    expires_at: expiresAt.toISOString(),
    attempt,
    payment,
    pixQrCode: raw.pixQrCode || null
  };
}

function normalizeEfiBankStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function normalizeEfiBankAmount(payment = {}) {
  if (payment?.amount !== undefined) return payment.amount;
  if (payment?.value !== undefined) return Number(payment.value) / 100;
  if (payment?.valor?.original !== undefined) return payment.valor.original;
  if (payment?.total !== undefined) return Number(payment.total) / 100;
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

function getEfiBankPaymentId(payment = {}) {
  return payment?.id || payment?.txid || payment?.charge_id || payment?.chargeId || null;
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
  const amount = normalizeEfiBankAmount(payment);

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
    valor: amount,
    amount,
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
  return cleanObject({
    provider: 'efi',
    attempt: sanitizeEfiPaymentAttempt(payload.attempt || null),
    payment: sanitizeEfiPaymentPayload(payload.payment || null),
    qrcode: sanitizeEfiQrCode(payload.qrcode || null),
    outcome: payload.outcome || null,
    timestamp: payload.timestamp || payload.created_at || null
  });
}

export function buildEfiBankPaymentAttempt({ plan, payment, idempotencyKey = null, method = null }) {
  return {
    plano_original: plan.id,
    valor_original: plan.value,
    tipo_cobranca_original: plan.tipo_cobranca,
    payment_id: getEfiBankPaymentId(payment) ? String(getEfiBankPaymentId(payment)) : null,
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

export function buildEfiBankProviderRaw({ payment, attempt, qrcode = null }) {
  return sanitizeEfiProviderRaw({ payment, attempt, qrcode });
}

function getEfiBankAttempt(assinatura = {}) {
  const raw = assinatura.provider_raw || {};
  if (raw.attempt) return raw.attempt;

  const rawPayment = raw.payment || raw;
  const rawPlanId = rawPayment?.metadata?.plano || rawPayment?.fluxmei_metadata?.plano || rawPayment?.plano || null;
  const rawAmount = rawPayment?.amount || rawPayment?.valor || rawPayment?.valor?.original || rawPayment?.value;
  if (rawPlanId || rawAmount !== undefined) {
    return {
      plano_original: rawPlanId,
      valor_original: rawAmount,
      payment_id: rawPayment?.payment_id || rawPayment?.id || rawPayment?.txid || assinatura.provider_payment_id || null,
      payment_method_id: rawPayment?.payment_method_id || rawPayment?.method || null
    };
  }

  return null;
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

export function buildAsaasSubscriptionUpdates(payment, assinatura, baseDate = new Date(), event = null) {
  const status = payment?.status;
  const normalizedStatus = normalizeAsaasStatus(status);
  const normalizedEvent = normalizeAsaasStatus(event).replace(/^payment_/, '');
  const paymentId = getAsaasPaymentId(payment);
  const sameProviderPayment = paymentId && assinatura.provider_payment_id === String(paymentId);
  const alreadyApproved = assinatura.status === 'ativo'
    && ASAAS_PAID_STATUSES.includes(normalizeAsaasStatus(assinatura.provider_status));
  const attempt = getAsaasAttempt(assinatura);

  if (ASAAS_PAID_STATUSES.includes(normalizedStatus) && sameProviderPayment && alreadyApproved) {
    return {
      payment_provider: 'asaas',
      provider_payment_id: String(paymentId),
      provider_customer_id: payment?.customer || assinatura.provider_customer_id || null,
      provider_subscription_id: payment?.subscription || assinatura.provider_subscription_id || null,
      provider_status: status,
      provider_raw: sanitizeAsaasProviderRaw({ payment, attempt, outcome: 'duplicate_ignored' }),
      already_processed: true,
      outcome: 'duplicate_ignored'
    };
  }

  const attemptPaymentId = attempt?.payment_id ? String(attempt.payment_id) : null;
  const originalPlanId = attempt?.plano_original || attempt?.metadata?.plano || null;
  const planConfig = PAYMENT_PLANS[originalPlanId];
  const paidPlanId = getAsaasPaymentPlanId(payment) || originalPlanId;
  const expectedAmountCents = moneyToCents(attempt?.valor_original);
  const paidAmountCents = moneyToCents(normalizeAsaasAmount(payment));

  if (!ASAAS_PAID_STATUSES.includes(normalizedStatus) && attemptPaymentId && paymentId && attemptPaymentId !== String(paymentId)) {
    return buildIgnoredAsaasUpdate(payment, 'ignored_not_current_attempt', attempt);
  }

  if (ASAAS_PAID_STATUSES.includes(normalizedStatus)) {
    if (!attempt || !attemptPaymentId || attemptPaymentId !== String(paymentId) || !sameProviderPayment) {
      return buildIgnoredAsaasUpdate(payment, 'ignored_not_current_attempt', attempt);
    }

    if (!planConfig || paidPlanId !== originalPlanId) {
      return buildIgnoredAsaasUpdate(payment, 'ignored_plan_mismatch', attempt);
    }

    if (expectedAmountCents === null || paidAmountCents === null || paidAmountCents !== expectedAmountCents) {
      return buildIgnoredAsaasUpdate(payment, 'ignored_amount_mismatch', attempt);
    }
  }

  const updates = {
    payment_provider: 'asaas',
    provider_payment_id: paymentId ? String(paymentId) : assinatura.provider_payment_id,
    provider_customer_id: payment?.customer || assinatura.provider_customer_id || null,
    provider_subscription_id: payment?.subscription || assinatura.provider_subscription_id || null,
    provider_status: status || assinatura.provider_status,
    provider_raw: buildAsaasProviderRaw({
      payment,
      attempt: attempt || {
        plano_original: originalPlanId,
        valor_original: normalizeAsaasAmount(payment),
        payment_id: paymentId ? String(paymentId) : null,
        metadata: { assinatura_id: getAsaasPaymentSubscriptionId(payment), plano: paidPlanId }
      }
    })
  };

  if (ASAAS_PAID_STATUSES.includes(normalizedStatus)) {
    updates.plano = originalPlanId;
    updates.valor = planConfig.value;
    updates.tipo_cobranca = planConfig.tipo_cobranca;
    updates.status = 'ativo';
    updates.bloqueado = false;
    updates.data_inicio = baseDate.toISOString().slice(0, 10);
    updates.data_vencimento = todayPlusDays(planConfig.dias, baseDate);
    updates.paid_at = baseDate.toISOString();
    updates.renovacao_automatica = Boolean(payment?.subscription);
  } else if (ASAAS_PENDING_STATUSES.includes(normalizedStatus)) {
    Object.assign(updates, buildPendingPaymentAttemptUpdates({ assinatura, baseDate }));
  } else if (ASAAS_OVERDUE_STATUSES.includes(normalizedStatus) || normalizedEvent === 'overdue') {
    applyBlockedOrPreservedCancellation(updates, assinatura, baseDate, 'vencido');
  } else if (ASAAS_CANCELLED_STATUSES.includes(normalizedStatus) || ASAAS_CANCELLED_STATUSES.includes(normalizedEvent)) {
    applyBlockedOrPreservedCancellation(updates, assinatura, baseDate, 'cancelado');
  }

  return updates;
}

export function buildEfiBankSubscriptionUpdates(payment, assinatura, baseDate = new Date()) {
  const status = payment?.status;
  const normalizedStatus = normalizeEfiBankStatus(status);
  const paymentId = getEfiBankPaymentId(payment);
  const sameProviderPayment = paymentId && assinatura.provider_payment_id === String(paymentId);
  const alreadyApproved = assinatura.status === 'ativo'
    && EFI_BANK_PAID_STATUSES.includes(normalizeEfiBankStatus(assinatura.provider_status));
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
    updates.paid_at = baseDate.toISOString();
    updates.renovacao_automatica = false;
  } else if (EFI_BANK_PENDING_STATUSES.includes(normalizedStatus)) {
    Object.assign(updates, buildPendingPaymentAttemptUpdates({ assinatura, baseDate }));
  } else if (EFI_BANK_CANCELLED_STATUSES.includes(normalizedStatus)) {
    const nextStatus = ['expired', 'vencido', 'vencida'].includes(normalizedStatus) ? 'vencido' : 'cancelado';
    applyBlockedOrPreservedCancellation(updates, assinatura, baseDate, nextStatus);
  }

  return updates;
}
