import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAYMENT_PLANS,
  buildEfiBankPaymentAttempt,
  buildEfiBankProviderRaw,
  buildEfiBankSubscriptionUpdates,
  buildPendingPaymentAttemptUpdates,
  getRecentEfiBankPendingAttempt,
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
