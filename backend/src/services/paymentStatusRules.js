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

export function isAsaasPaidStatus(status) {
  return ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(String(status || '').toUpperCase());
}

export function isAsaasPendingStatus(status) {
  return ['PENDING', 'AWAITING_RISK_ANALYSIS'].includes(String(status || '').toUpperCase());
}

export function isAsaasCancelledStatus(status) {
  return ['OVERDUE', 'CANCELLED', 'REFUNDED', 'REFUND_REQUESTED', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL'].includes(String(status || '').toUpperCase());
}

export function buildAsaasSubscriptionUpdates(payment, assinatura, baseDate = new Date()) {
  const planConfig = PAYMENT_PLANS[assinatura.plano] || PAYMENT_PLANS.pro_mensal;
  const status = payment?.status;
  const updates = {
    payment_provider: 'asaas',
    provider_payment_id: payment?.id ? String(payment.id) : assinatura.provider_payment_id,
    provider_customer_id: payment?.customer || assinatura.provider_customer_id || null,
    provider_subscription_id: payment?.subscription || assinatura.provider_subscription_id || null,
    provider_status: status || assinatura.provider_status,
    provider_raw: payment || assinatura.provider_raw || null
  };

  if (isAsaasPaidStatus(status)) {
    updates.status = 'ativo';
    updates.bloqueado = false;
    updates.data_inicio = baseDate.toISOString().slice(0, 10);
    updates.data_vencimento = todayPlusDays(planConfig.dias, baseDate);
    updates.renovacao_automatica = Boolean(payment?.subscription);
  } else if (isAsaasPendingStatus(status)) {
    updates.status = 'pendente';
    updates.bloqueado = true;
  } else if (isAsaasCancelledStatus(status)) {
    updates.status = 'cancelado';
    updates.bloqueado = true;
    updates.renovacao_automatica = false;
  }

  return updates;
}

export function buildMercadoPagoSubscriptionUpdates(payment, assinatura, baseDate = new Date()) {
  const planConfig = PAYMENT_PLANS[assinatura.plano] || PAYMENT_PLANS.pro_mensal;
  const status = payment?.status;
  const updates = {
    payment_provider: 'mercado_pago',
    provider_payment_id: payment?.id ? String(payment.id) : null,
    provider_status: status,
    provider_raw: payment,
    mercado_pago_payment_id: payment?.id ? String(payment.id) : null,
    mercado_pago_status: status
  };

  if (status === 'approved') {
    updates.status = 'ativo';
    updates.bloqueado = false;
    updates.data_inicio = baseDate.toISOString().slice(0, 10);
    updates.data_vencimento = todayPlusDays(planConfig.dias, baseDate);
    updates.renovacao_automatica = false;
  } else if (['pending', 'in_process', 'authorized'].includes(status)) {
    updates.status = 'pendente';
    updates.bloqueado = true;
  } else if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(status)) {
    updates.status = 'cancelado';
    updates.bloqueado = true;
    updates.renovacao_automatica = false;
  }

  return updates;
}
