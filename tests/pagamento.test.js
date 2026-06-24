import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAYMENT_PLANS,
  buildAsaasPaymentAttempt,
  buildAsaasProviderRaw,
  buildAsaasSubscriptionUpdates,
  buildEfiBankPaymentAttempt,
  buildEfiBankProviderRaw,
  buildEfiBankSubscriptionUpdates,
  buildPendingPaymentAttemptUpdates,
  getRecentEfiBankPendingAttempt,
  sanitizeAsaasProviderRaw,
  sanitizeEfiProviderRaw,
  todayPlusDays
} from '../backend/src/services/paymentStatusRules.js';

function assinaturaBase(extra = {}) {
  return {
    id: 'sub-1',
    user_id: 'user-1',
    plano: 'pro_mensal',
    valor: 49.9,
    tipo_cobranca: 'mensal',
    status: 'pendente',
    bloqueado: true,
    payment_provider: 'efi',
    provider_payment_id: 'pay-1',
    provider_status: 'ATIVA',
    provider_raw: {
      attempt: {
        plano_original: 'pro_mensal',
        valor_original: 49.9,
        tipo_cobranca_original: 'mensal',
        payment_id: 'pay-1',
        payment_method_id: 'pix',
        created_at: new Date().toISOString(),
        metadata: {
          user_id: 'user-1',
          assinatura_id: 'sub-1',
          plano: 'pro_mensal'
        }
      },
      payment: {
        provider: 'efi',
        payment_id: 'pay-1',
        status: 'ATIVA',
        payment_method_id: 'pix',
        amount: 49.9,
        plano: 'pro_mensal',
        metadata: {
          user_id: 'user-1',
          assinatura_id: 'sub-1',
          plano: 'pro_mensal'
        }
      }
    },
    ...extra
  };
}

function payment(status = 'CONCLUIDA', extra = {}) {
  return {
    id: 'pay-1',
    txid: 'pay-1',
    status,
    amount: 49.9,
    payment_method_id: 'pix',
    metadata: {
      user_id: 'user-1',
      assinatura_id: 'sub-1',
      plano: 'pro_mensal'
    },
    ...extra
  };
}

function assinaturaAsaasBase(extra = {}) {
  return {
    ...assinaturaBase({
      payment_provider: 'asaas',
      provider_payment_id: 'pay_asaas_1',
      provider_customer_id: 'cus_1',
      provider_status: 'PENDING',
      provider_raw: {
        attempt: {
          plano_original: 'pro_mensal',
          valor_original: 49.9,
          tipo_cobranca_original: 'mensal',
          payment_id: 'pay_asaas_1',
          payment_method_id: 'PIX',
          created_at: new Date().toISOString(),
          metadata: {
            user_id: 'user-1',
            assinatura_id: 'sub-1',
            plano: 'pro_mensal'
          }
        },
        payment: {
          provider: 'asaas',
          payment_id: 'pay_asaas_1',
          status: 'PENDING',
          billing_type: 'PIX',
          value: 49.9,
          external_reference: 'user-1:sub-1:pro_mensal'
        }
      }
    }),
    ...extra
  };
}

function asaasPayment(status = 'RECEIVED', extra = {}) {
  return {
    id: 'pay_asaas_1',
    customer: 'cus_1',
    status,
    billingType: 'PIX',
    value: 49.9,
    dueDate: '2026-06-21',
    externalReference: 'user-1:sub-1:pro_mensal',
    ...extra
  };
}

test('tentativa EFI preserva dados necessarios para conciliacao', () => {
  const attempt = buildEfiBankPaymentAttempt({
    plan: PAYMENT_PLANS.pro_mensal,
    payment: payment('ATIVA'),
    idempotencyKey: 'idem-1',
    method: 'pix'
  });

  assert.equal(attempt.plano_original, 'pro_mensal');
  assert.equal(attempt.valor_original, 49.9);
  assert.equal(attempt.tipo_cobranca_original, 'mensal');
  assert.equal(attempt.payment_id, 'pay-1');
  assert.equal(attempt.payment_method_id, 'pix');
  assert.equal(attempt.idempotency_key, 'idem-1');
  assert.equal(attempt.metadata.assinatura_id, 'sub-1');
});

test('tentativa Asaas preserva dados necessarios para conciliacao', () => {
  const attempt = buildAsaasPaymentAttempt({
    plan: PAYMENT_PLANS.pro_mensal,
    payment: asaasPayment('PENDING'),
    method: 'pix'
  });

  assert.equal(attempt.plano_original, 'pro_mensal');
  assert.equal(attempt.valor_original, 49.9);
  assert.equal(attempt.tipo_cobranca_original, 'mensal');
  assert.equal(attempt.payment_id, 'pay_asaas_1');
  assert.equal(attempt.payment_method_id, 'PIX');
  assert.equal(attempt.metadata.assinatura_id, 'sub-1');
});

test('provider_raw Asaas remove dados sensiveis e preserva tentativa', () => {
  const raw = sanitizeAsaasProviderRaw({
    attempt: {
      plano_original: 'pro_mensal',
      valor_original: 49.9,
      tipo_cobranca_original: 'mensal',
      payment_id: 'pay_asaas_1',
      payment_method_id: 'PIX',
      created_at: '2026-06-21T10:00:00.000Z'
    },
    payment: {
      id: 'pay_asaas_1',
      customer: 'cus_1',
      status: 'PENDING',
      billingType: 'PIX',
      value: 49.9,
      cpfCnpj: '12345678901',
      email: 'cliente@example.com',
      creditCard: { number: '4111111111111111', cvv: '123' }
    },
    pixQrCode: {
      payload: '000201-pix',
      encodedImage: 'base64'
    }
  });

  const serialized = JSON.stringify(raw);
  assert.equal(raw.provider, 'asaas');
  assert.equal(raw.payment.payment_id, 'pay_asaas_1');
  assert.equal(raw.pixQrCode.has_qrcode, true);
  assert.doesNotMatch(serialized, /12345678901|cliente@example.com|4111111111111111|000201-pix|base64|cvv/);
});

test('buildAsaasProviderRaw usa sanitizacao segura', () => {
  const raw = buildAsaasProviderRaw({
    attempt: { plano_original: 'pro_mensal', valor_original: 49.9, payment_id: 'pay_asaas_1' },
    payment: asaasPayment('PENDING', { email: 'cliente@example.com' }),
    pixQrCode: { payload: 'payload-pix' }
  });

  assert.equal(raw.payment.payment_id, 'pay_asaas_1');
  assert.doesNotMatch(JSON.stringify(raw), /cliente@example.com|payload-pix/);
});

test('provider_raw EFI remove dados sensiveis e preserva attempt', () => {
  const raw = sanitizeEfiProviderRaw({
    attempt: {
      plano_original: 'pro_mensal',
      valor_original: 49.9,
      tipo_cobranca_original: 'mensal',
      payment_id: 'pay-1',
      payment_method_id: 'cartao',
      idempotency_key: 'idem-1',
      created_at: '2026-06-21T10:00:00.000Z',
      metadata: { user_id: 'user-1', assinatura_id: 'sub-1', plano: 'pro_mensal' }
    },
    payment: {
      id: 'pay-1',
      charge_id: 'pay-1',
      status: 'paid',
      amount: 49.9,
      payment_method_id: 'cartao',
      access_token: 'token-secreto',
      client_secret: 'secret',
      certificate: 'cert',
      card: { number: '4111111111111111', cvv: '123', holder: 'Cliente' },
      metadata: { user_id: 'user-1', assinatura_id: 'sub-1', plano: 'pro_mensal' }
    }
  });

  const serialized = JSON.stringify(raw);
  assert.equal(raw.provider, 'efi');
  assert.equal(raw.attempt.plano_original, 'pro_mensal');
  assert.equal(raw.attempt.valor_original, 49.9);
  assert.equal(raw.payment.payment_id, 'pay-1');
  assert.equal(raw.payment.status, 'paid');
  assert.doesNotMatch(serialized, /token-secreto|4111111111111111|cvv|certificate|client_secret|holder/);
});

test('buildEfiBankProviderRaw usa sanitizacao segura', () => {
  const raw = buildEfiBankProviderRaw({
    attempt: { plano_original: 'pro_mensal', valor_original: 49.9, payment_id: 'pay-1' },
    payment: payment('ATIVA', { access_token: 'nao-salvar' }),
    qrcode: { qrcode: 'payload-pix', imagemQrcode: 'base64' }
  });

  assert.equal(raw.payment.payment_id, 'pay-1');
  assert.equal(raw.qrcode.has_qrcode, true);
  assert.equal(raw.qrcode.has_image, true);
  assert.doesNotMatch(JSON.stringify(raw), /nao-salvar|payload-pix|base64/);
});

test('pagamento EFI aprovado ativa assinatura com plano e valor validos', () => {
  const baseDate = new Date('2026-06-21T12:00:00.000Z');
  const updates = buildEfiBankSubscriptionUpdates(payment('CONCLUIDA'), assinaturaBase(), baseDate);

  assert.equal(updates.payment_provider, 'efi');
  assert.equal(updates.provider_payment_id, 'pay-1');
  assert.equal(updates.provider_status, 'CONCLUIDA');
  assert.equal(updates.status, 'ativo');
  assert.equal(updates.bloqueado, false);
  assert.equal(updates.plano, 'pro_mensal');
  assert.equal(updates.valor, 49.9);
  assert.equal(updates.data_vencimento, todayPlusDays(30, baseDate));
  assert.equal(updates.paid_at, baseDate.toISOString());
});

test('pagamento Asaas recebido ativa assinatura com plano e valor validos', () => {
  const baseDate = new Date('2026-06-21T12:00:00.000Z');
  const updates = buildAsaasSubscriptionUpdates(asaasPayment('RECEIVED'), assinaturaAsaasBase(), baseDate, 'PAYMENT_RECEIVED');

  assert.equal(updates.payment_provider, 'asaas');
  assert.equal(updates.provider_payment_id, 'pay_asaas_1');
  assert.equal(updates.provider_status, 'RECEIVED');
  assert.equal(updates.status, 'ativo');
  assert.equal(updates.bloqueado, false);
  assert.equal(updates.plano, 'pro_mensal');
  assert.equal(updates.valor, 49.9);
  assert.equal(updates.data_vencimento, todayPlusDays(30, baseDate));
  assert.equal(updates.paid_at, baseDate.toISOString());
});

test('webhook Asaas de cartao confirmado ativa assinatura', () => {
  const baseDate = new Date('2026-06-21T12:00:00.000Z');
  const assinatura = assinaturaAsaasBase({
    provider_raw: {
      attempt: {
        plano_original: 'pro_mensal',
        valor_original: 49.9,
        tipo_cobranca_original: 'mensal',
        payment_id: 'pay_asaas_1',
        payment_method_id: 'CREDIT_CARD',
        created_at: '2026-06-21T10:00:00.000Z',
        metadata: { user_id: 'user-1', assinatura_id: 'sub-1', plano: 'pro_mensal' }
      }
    }
  });
  const updates = buildAsaasSubscriptionUpdates(
    asaasPayment('CONFIRMED', { billingType: 'CREDIT_CARD' }),
    assinatura,
    baseDate,
    'PAYMENT_CONFIRMED'
  );

  assert.equal(updates.status, 'ativo');
  assert.equal(updates.bloqueado, false);
  assert.equal(updates.provider_status, 'CONFIRMED');
  assert.equal(updates.data_vencimento, todayPlusDays(30, baseDate));
});

test('webhook Asaas duplicado aprovado nao avanca vencimento de novo', () => {
  const updates = buildAsaasSubscriptionUpdates(asaasPayment('RECEIVED'), assinaturaAsaasBase({
    status: 'ativo',
    bloqueado: false,
    provider_status: 'RECEIVED',
    data_vencimento: '2026-07-21'
  }));

  assert.equal(updates.already_processed, true);
  assert.equal(updates.outcome, 'duplicate_ignored');
  assert.equal(updates.status, undefined);
});

test('pagamento Asaas estornado nao ativa assinatura', () => {
  const updates = buildAsaasSubscriptionUpdates(asaasPayment('REFUNDED'), assinaturaAsaasBase({
    status: 'pendente',
    bloqueado: true
  }), new Date('2026-06-21T12:00:00.000Z'), 'PAYMENT_REFUNDED');

  assert.equal(updates.status, 'cancelado');
  assert.equal(updates.bloqueado, true);
  assert.equal(updates.renovacao_automatica, false);
});

test('pagamento EFI pendente mantem usuario vencido bloqueado', () => {
  const updates = buildEfiBankSubscriptionUpdates(payment('ATIVA'), assinaturaBase({
    status: 'vencido',
    bloqueado: true
  }));

  assert.equal(updates.payment_provider, 'efi');
  assert.equal(updates.provider_status, 'ATIVA');
  assert.equal(updates.status, 'pendente');
  assert.equal(updates.bloqueado, true);
});

test('pagamento EFI vencido marca assinatura vencida sem ativar', () => {
  const updates = buildEfiBankSubscriptionUpdates(payment('expired'), assinaturaBase({
    status: 'pendente',
    bloqueado: true
  }));

  assert.equal(updates.status, 'vencido');
  assert.equal(updates.bloqueado, true);
  assert.equal(updates.renovacao_automatica, false);
});

test('pagamento EFI cancelado preserva trial ativo', () => {
  const baseDate = new Date('2026-06-21T12:00:00.000Z');
  const updates = buildEfiBankSubscriptionUpdates(payment('canceled'), assinaturaBase({
    status: 'teste_gratis',
    bloqueado: false,
    data_trial_fim: '2026-06-25',
    data_vencimento: '2026-06-25'
  }), baseDate);

  assert.equal(updates.status, 'teste_gratis');
  assert.equal(updates.bloqueado, false);
  assert.equal(updates.data_trial_fim, '2026-06-25');
});

test('webhook EFI duplicado aprovado nao avanca vencimento de novo', () => {
  const updates = buildEfiBankSubscriptionUpdates(payment('CONCLUIDA'), assinaturaBase({
    status: 'ativo',
    bloqueado: false,
    provider_status: 'CONCLUIDA',
    data_vencimento: '2026-07-21'
  }));

  assert.equal(updates.already_processed, true);
  assert.equal(updates.outcome, 'duplicate_ignored');
  assert.equal(updates.status, undefined);
});

test('valor pago diferente do valor original nao ativa assinatura EFI', () => {
  const updates = buildEfiBankSubscriptionUpdates(payment('CONCLUIDA', { amount: 10 }), assinaturaBase());

  assert.equal(updates.ignored, true);
  assert.equal(updates.outcome, 'ignored_amount_mismatch');
  assert.equal(updates.status, undefined);
});

test('plano pago diferente do plano original nao ativa assinatura EFI', () => {
  const updates = buildEfiBankSubscriptionUpdates(payment('CONCLUIDA', {
    metadata: { user_id: 'user-1', assinatura_id: 'sub-1', plano: 'pro_anual' }
  }), assinaturaBase());

  assert.equal(updates.ignored, true);
  assert.equal(updates.outcome, 'ignored_plan_mismatch');
  assert.equal(updates.status, undefined);
});

test('tentativa pendente EFI recente e reutilizavel', () => {
  const pending = getRecentEfiBankPendingAttempt(assinaturaBase(), PAYMENT_PLANS.pro_mensal, {
    baseDate: new Date()
  });

  assert.equal(pending.provider, 'efi');
  assert.equal(pending.payment_id, 'pay-1');
  assert.equal(pending.method, 'pix');
});

test('tentativa pendente EFI expirada nao e reutilizada', () => {
  const pending = getRecentEfiBankPendingAttempt(assinaturaBase({
    provider_raw: {
      attempt: {
        plano_original: 'pro_mensal',
        valor_original: 49.9,
        payment_id: 'pay-1',
        payment_method_id: 'pix',
        created_at: '2026-06-20T10:00:00.000Z'
      },
      payment: { payment_id: 'pay-1', status: 'ATIVA', payment_method_id: 'pix', plano: 'pro_mensal' }
    }
  }), PAYMENT_PLANS.pro_mensal, {
    baseDate: new Date('2026-06-21T12:00:00.000Z')
  });

  assert.equal(pending, null);
});

test('tentativa pendente preserva acesso de trial ativo', () => {
  const updates = buildPendingPaymentAttemptUpdates({
    assinatura: assinaturaBase({
      status: 'teste_gratis',
      bloqueado: false,
      data_trial_fim: '2026-06-25',
      data_vencimento: '2026-06-25'
    }),
    providerUpdates: {
      plano: 'pro_mensal',
      valor: 49.9,
      payment_provider: 'efi',
      provider_payment_id: 'pay-1',
      provider_status: 'ATIVA'
    },
    baseDate: new Date('2026-06-21T12:00:00.000Z')
  });

  assert.equal(updates.status, 'teste_gratis');
  assert.equal(updates.bloqueado, false);
  assert.equal(updates.payment_provider, 'efi');
  assert.equal(updates.provider_payment_id, 'pay-1');
});
