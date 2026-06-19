import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPendingPaymentAttemptUpdates,
  buildAsaasSubscriptionUpdates,
  buildEfiBankProviderRaw,
  buildEfiBankSubscriptionUpdates,
  buildMercadoPagoSubscriptionUpdates,
  getRecentEfiBankPendingAttempt,
  getRecentMercadoPagoPendingAttempt,
  sanitizeEfiProviderRaw
} from '../backend/src/services/paymentStatusRules.js';

const baseDate = new Date('2026-06-12T00:00:00Z');
const assinatura = {
  id: 'sub-1',
  plano: 'pro_mensal',
  status: 'pendente',
  bloqueado: true,
  provider_payment_id: null,
  provider_customer_id: null,
  provider_subscription_id: null,
  provider_status: null,
  provider_raw: null
};

function assinaturaMercadoPagoAttempt({ currentPlan = 'pro_mensal', originalPlan = 'pro_mensal', paymentId = '123', amount = 49.9 } = {}) {
  return {
    ...assinatura,
    plano: currentPlan,
    valor: currentPlan === 'pro_anual' ? 478.8 : 49.9,
    tipo_cobranca: currentPlan === 'pro_anual' ? 'anual' : 'mensal',
    payment_provider: 'mercado_pago',
    provider_payment_id: paymentId,
    mercado_pago_payment_id: paymentId,
    provider_raw: {
      attempt: {
        plano_original: originalPlan,
        valor_original: amount,
        tipo_cobranca_original: originalPlan === 'pro_anual' ? 'anual' : 'mensal',
        payment_id: paymentId,
        metadata: {
          plano: originalPlan
        }
      },
      payment: {
        id: paymentId,
        transaction_amount: amount,
        metadata: {
          plano: originalPlan
        }
      }
    }
  };
}

function assinaturaEfiAttempt({ currentPlan = 'pro_mensal', originalPlan = 'pro_mensal', paymentId = 'fx123', amount = 49.9, status = 'ATIVA' } = {}) {
  return {
    ...assinatura,
    user_id: 'user-1',
    plano: currentPlan,
    valor: currentPlan === 'pro_anual' ? 478.8 : 49.9,
    tipo_cobranca: currentPlan === 'pro_anual' ? 'anual' : 'mensal',
    payment_provider: 'efi',
    provider_payment_id: paymentId,
    provider_status: status,
    provider_raw: {
      attempt: {
        plano_original: originalPlan,
        valor_original: amount,
        tipo_cobranca_original: originalPlan === 'pro_anual' ? 'anual' : 'mensal',
        payment_id: paymentId,
        payment_method_id: 'pix',
        created_at: '2026-06-12T00:00:00Z',
        metadata: {
          user_id: 'user-1',
          assinatura_id: 'sub-1',
          plano: originalPlan
        }
      },
      payment: {
        id: paymentId,
        txid: paymentId,
        status,
        amount,
        payment_method_id: 'pix',
        metadata: {
          user_id: 'user-1',
          assinatura_id: 'sub-1',
          plano: originalPlan
        }
      }
    }
  };
}

function assinaturaTrialAtivo(extra = {}) {
  return {
    ...assinatura,
    plano: 'gratuito',
    status: 'teste_gratis',
    bloqueado: false,
    valor: 0,
    tipo_cobranca: 'mensal',
    data_inicio: '2026-06-10',
    data_vencimento: '2026-06-17',
    data_trial_fim: '2026-06-17',
    teste_gratis_usado: true,
    ...extra
  };
}

function assinaturaAtivaMercadoPagoAttempt({
  currentPlan = 'pro_mensal',
  originalPlan = 'pro_mensal',
  paymentId = 'pay_active',
  amount = originalPlan === 'pro_anual' ? 478.8 : 49.9,
  dueDate = '2026-07-12',
  status = 'pending'
} = {}) {
  return {
    ...assinatura,
    plano: currentPlan,
    status: 'ativo',
    bloqueado: false,
    valor: currentPlan === 'pro_anual' ? 478.8 : 49.9,
    tipo_cobranca: currentPlan === 'pro_anual' ? 'anual' : 'mensal',
    data_inicio: '2026-05-12',
    data_vencimento: dueDate,
    data_trial_fim: null,
    payment_provider: 'mercado_pago',
    provider_payment_id: paymentId,
    provider_status: status,
    mercado_pago_payment_id: paymentId,
    mercado_pago_status: status,
    provider_raw: {
      attempt: {
        plano_original: originalPlan,
        valor_original: amount,
        tipo_cobranca_original: originalPlan === 'pro_anual' ? 'anual' : 'mensal',
        payment_id: paymentId,
        metadata: {
          plano: originalPlan
        }
      },
      payment: {
        id: paymentId,
        transaction_amount: amount,
        metadata: {
          plano: originalPlan
        }
      }
    }
  };
}

function assinaturaPendenteMercadoPago({
  paymentId = 'pay_pending',
  planId = 'pro_mensal',
  method = 'pix',
  status = 'pending',
  createdAt = '2026-06-12T00:00:00Z',
  expirationDate = null
} = {}) {
  return {
    ...assinatura,
    user_id: 'user-1',
    id: 'sub-1',
    plano: planId,
    payment_provider: 'mercado_pago',
    provider_payment_id: paymentId,
    provider_status: status,
    mercado_pago_payment_id: paymentId,
    mercado_pago_status: status,
    provider_raw: {
      attempt: {
        plano_original: planId,
        valor_original: planId === 'pro_anual' ? 478.8 : 49.9,
        tipo_cobranca_original: planId === 'pro_anual' ? 'anual' : 'mensal',
        payment_id: paymentId,
        payment_method_id: method,
        created_at: createdAt,
        metadata: {
          user_id: 'user-1',
          assinatura_id: 'sub-1',
          plano: planId
        }
      },
      payment: {
        id: paymentId,
        status,
        payment_method_id: method,
        transaction_amount: planId === 'pro_anual' ? 478.8 : 49.9,
        metadata: {
          user_id: 'user-1',
          assinatura_id: 'sub-1',
          plano: planId
        },
        external_reference: `user-1:sub-1:${planId}`,
        point_of_interaction: expirationDate ? {
          transaction_data: {
            expiration_date: expirationDate
          }
        } : undefined
      }
    }
  };
}

function assinaturaTrialMercadoPagoAttempt({ paymentId = '123', originalPlan = 'pro_mensal', amount = 49.9, trialEnd = '2026-06-17' } = {}) {
  return {
    ...assinaturaTrialAtivo({
      data_vencimento: trialEnd,
      data_trial_fim: trialEnd,
      payment_provider: 'mercado_pago',
      provider_payment_id: paymentId,
      mercado_pago_payment_id: paymentId
    }),
    provider_raw: {
      attempt: {
        plano_original: originalPlan,
        valor_original: amount,
        tipo_cobranca_original: originalPlan === 'pro_anual' ? 'anual' : 'mensal',
        payment_id: paymentId,
        metadata: {
          plano: originalPlan
        }
      },
      payment: {
        id: paymentId,
        transaction_amount: amount,
        metadata: {
          plano: originalPlan
        }
      }
    }
  };
}

test('webhook valido Asaas com pagamento aprovado ativa assinatura', () => {
  const updates = buildAsaasSubscriptionUpdates({
    id: 'pay_1',
    customer: 'cus_1',
    subscription: 'sub_asaas_1',
    dueDate: '2026-06-12',
    status: 'RECEIVED'
  }, assinatura, baseDate);

  assert.equal(updates.status, 'ativo');
  assert.equal(updates.bloqueado, false);
  assert.equal(updates.payment_provider, 'asaas');
  assert.equal(updates.provider_payment_id, 'pay_1');
  assert.equal(updates.provider_subscription_id, 'sub_asaas_1');
  assert.equal(updates.data_inicio, '2026-06-12');
  assert.equal(updates.data_vencimento, '2026-07-12');
});

test('webhook valido Mercado Pago com pagamento aprovado ativa assinatura', () => {
  const updates = buildMercadoPagoSubscriptionUpdates({
    id: 123,
    status: 'approved',
    transaction_amount: 49.9,
    metadata: {
      plano: 'pro_mensal'
    }
  }, assinaturaMercadoPagoAttempt(), baseDate);

  assert.equal(updates.status, 'ativo');
  assert.equal(updates.bloqueado, false);
  assert.equal(updates.payment_provider, 'mercado_pago');
  assert.equal(updates.provider_payment_id, '123');
  assert.equal(updates.plano, 'pro_mensal');
  assert.equal(updates.valor, 49.9);
  assert.equal(updates.tipo_cobranca, 'mensal');
  assert.equal(updates.data_vencimento, '2026-07-12');
});

test('webhook valido EFI com pagamento aprovado ativa assinatura', () => {
  const updates = buildEfiBankSubscriptionUpdates({
    id: 'fx123',
    txid: 'fx123',
    status: 'CONCLUIDA',
    amount: 49.9,
    payment_method_id: 'pix',
    metadata: {
      user_id: 'user-1',
      assinatura_id: 'sub-1',
      plano: 'pro_mensal'
    }
  }, assinaturaEfiAttempt(), baseDate);

  assert.equal(updates.status, 'ativo');
  assert.equal(updates.bloqueado, false);
  assert.equal(updates.payment_provider, 'efi');
  assert.equal(updates.provider_payment_id, 'fx123');
  assert.equal(updates.plano, 'pro_mensal');
  assert.equal(updates.valor, 49.9);
  assert.equal(updates.tipo_cobranca, 'mensal');
  assert.equal(updates.data_vencimento, '2026-07-12');
});

test('provider_raw EFI sanitiza token e preserva attempt necessario', () => {
  const raw = buildEfiBankProviderRaw({
    attempt: {
      plano_original: 'pro_mensal',
      valor_original: 49.9,
      tipo_cobranca_original: 'mensal',
      payment_id: 'fx123',
      payment_method_id: 'pix',
      idempotency_key: 'idem-1',
      created_at: '2026-06-12T00:00:00Z',
      metadata: {
        user_id: 'user-1',
        assinatura_id: 'sub-1',
        plano: 'pro_mensal',
        access_token: 'secret-token'
      }
    },
    payment: {
      id: 'fx123',
      txid: 'fx123',
      status: 'ATIVA',
      amount: 49.9,
      payment_method_id: 'pix',
      access_token: 'secret-token',
      client_secret: 'client-secret',
      chave: 'pix-key',
      metadata: {
        user_id: 'user-1',
        assinatura_id: 'sub-1',
        plano: 'pro_mensal',
        email: 'cliente@example.com'
      }
    },
    qrcode: {
      qrcode: '000201-secret-pix-code',
      imagemQrcode: 'base64-secret-image'
    }
  });

  const serialized = JSON.stringify(raw);

  assert.equal(raw.provider, 'efi');
  assert.equal(raw.attempt.plano_original, 'pro_mensal');
  assert.equal(raw.attempt.valor_original, 49.9);
  assert.equal(raw.attempt.payment_id, 'fx123');
  assert.equal(raw.attempt.idempotency_key, 'idem-1');
  assert.equal(raw.payment.payment_id, 'fx123');
  assert.equal(raw.payment.status, 'ATIVA');
  assert.equal(raw.payment.valor, 49.9);
  assert.equal(raw.payment.metadata.plano, 'pro_mensal');
  assert.equal(raw.qrcode.has_qrcode, true);
  assert.doesNotMatch(serialized, /secret-token|client-secret|pix-key|000201-secret-pix-code|base64-secret-image|cliente@example.com/);
});

test('provider_raw EFI sanitiza dados sensiveis de cartao', () => {
  const raw = sanitizeEfiProviderRaw({
    payment: {
      id: 'card-1',
      charge_id: 'card-1',
      status: 'paid',
      amount: 49.9,
      payment_method_id: 'cartao',
      payment_token: 'card-token',
      card: {
        number: '4111111111111111',
        cvv: '123',
        holder: 'Cliente Teste'
      },
      payment: {
        credit_card: {
          number: '4111111111111111',
          cvv: '123'
        }
      },
      metadata: {
        user_id: 'user-1',
        assinatura_id: 'sub-1',
        plano: 'pro_mensal'
      }
    }
  });

  const serialized = JSON.stringify(raw);

  assert.equal(raw.payment.payment_id, 'card-1');
  assert.equal(raw.payment.charge_id, 'card-1');
  assert.equal(raw.payment.payment_method, 'cartao');
  assert.equal(raw.payment.valor, 49.9);
  assert.doesNotMatch(serialized, /card-token|4111111111111111|123|Cliente Teste|credit_card|cvv|number|holder/);
});

test('provider_raw EFI ignorado preserva attempt sanitizado', () => {
  const updates = buildEfiBankSubscriptionUpdates({
    id: 'old-payment',
    charge_id: 'old-payment',
    status: 'paid',
    amount: 49.9,
    payment_method_id: 'cartao',
    payment_token: 'token-antigo',
    metadata: {
      user_id: 'user-1',
      assinatura_id: 'sub-1',
      plano: 'pro_mensal'
    }
  }, assinaturaEfiAttempt({ paymentId: 'current-payment', status: 'waiting' }), baseDate);

  const serialized = JSON.stringify(updates.provider_raw);

  assert.equal(updates.ignored, true);
  assert.equal(updates.provider_raw.attempt.payment_id, 'current-payment');
  assert.equal(updates.provider_raw.attempt.plano_original, 'pro_mensal');
  assert.equal(updates.provider_raw.payment.payment_id, 'old-payment');
  assert.doesNotMatch(serialized, /token-antigo/);
});

test('pagamento pendente nao ativa assinatura', () => {
  const updates = buildAsaasSubscriptionUpdates({
    id: 'pay_pending',
    status: 'PENDING'
  }, assinatura, baseDate);

  assert.equal(updates.status, 'pendente');
  assert.equal(updates.bloqueado, true);
  assert.equal(updates.data_vencimento, undefined);
});

test('pagamento pendente Mercado Pago nao ativa assinatura', () => {
  const updates = buildMercadoPagoSubscriptionUpdates({
    id: 789,
    status: 'pending'
  }, assinatura, baseDate);

  assert.equal(updates.status, 'pendente');
  assert.equal(updates.bloqueado, true);
  assert.equal(updates.data_vencimento, undefined);
});

test('pagamento pendente EFI nao ativa assinatura', () => {
  const updates = buildEfiBankSubscriptionUpdates({
    id: 'fx123',
    txid: 'fx123',
    status: 'ATIVA'
  }, assinatura, baseDate);

  assert.equal(updates.status, 'pendente');
  assert.equal(updates.bloqueado, true);
  assert.equal(updates.data_vencimento, undefined);
});

test('cartao EFI recusado nao ativa assinatura', () => {
  const updates = buildEfiBankSubscriptionUpdates({
    id: 'card-1',
    charge_id: 'card-1',
    status: 'rejected',
    amount: 49.9,
    payment_method_id: 'cartao',
    metadata: {
      user_id: 'user-1',
      assinatura_id: 'sub-1',
      plano: 'pro_mensal'
    }
  }, assinaturaEfiAttempt({ paymentId: 'card-1', status: 'waiting' }), baseDate);

  assert.equal(updates.status, 'cancelado');
  assert.equal(updates.bloqueado, true);
  assert.equal(updates.data_vencimento, undefined);
});

test('trial ativo gera cobranca e continua liberado', () => {
  const updates = buildPendingPaymentAttemptUpdates({
    assinatura: assinaturaTrialAtivo(),
    providerUpdates: {
      plano: 'pro_mensal',
      valor: 49.9,
      tipo_cobranca: 'mensal',
      payment_provider: 'mercado_pago',
      provider_payment_id: 'pay_trial',
      provider_status: 'pending',
      provider_raw: {
        attempt: {
          plano_original: 'pro_mensal',
          valor_original: 49.9,
          payment_id: 'pay_trial'
        }
      },
      mercado_pago_payment_id: 'pay_trial',
      mercado_pago_status: 'pending',
      checkout_url: null,
      renovacao_automatica: false
    },
    baseDate
  });

  assert.equal(updates.status, 'teste_gratis');
  assert.equal(updates.bloqueado, false);
  assert.equal(updates.data_vencimento, '2026-06-17');
  assert.equal(updates.data_trial_fim, '2026-06-17');
  assert.equal(updates.plano, undefined);
  assert.equal(updates.valor, undefined);
  assert.equal(updates.tipo_cobranca, undefined);
  assert.equal(updates.provider_payment_id, 'pay_trial');
  assert.equal(updates.provider_raw.attempt.plano_original, 'pro_mensal');
});

test('usuario ativo mensal gera nova cobranca e continua ativo', () => {
  const updates = buildPendingPaymentAttemptUpdates({
    assinatura: assinaturaAtivaMercadoPagoAttempt({
      currentPlan: 'pro_mensal',
      originalPlan: 'pro_mensal',
      paymentId: 'pay_new_monthly',
      dueDate: '2026-07-20'
    }),
    providerUpdates: {
      plano: 'pro_mensal',
      valor: 49.9,
      tipo_cobranca: 'mensal',
      payment_provider: 'mercado_pago',
      provider_payment_id: 'pay_new_monthly',
      provider_status: 'pending',
      provider_raw: {
        attempt: {
          plano_original: 'pro_mensal',
          valor_original: 49.9,
          payment_id: 'pay_new_monthly'
        }
      },
      mercado_pago_payment_id: 'pay_new_monthly',
      mercado_pago_status: 'pending',
      checkout_url: null,
      renovacao_automatica: false
    },
    baseDate
  });

  assert.equal(updates.status, 'ativo');
  assert.equal(updates.bloqueado, false);
  assert.equal(updates.data_vencimento, '2026-07-20');
  assert.equal(updates.plano, undefined);
  assert.equal(updates.valor, undefined);
  assert.equal(updates.tipo_cobranca, undefined);
  assert.equal(updates.provider_payment_id, 'pay_new_monthly');
  assert.equal(updates.provider_raw.attempt.plano_original, 'pro_mensal');
});

test('usuario ativo anual gera nova cobranca e continua ativo', () => {
  const updates = buildPendingPaymentAttemptUpdates({
    assinatura: assinaturaAtivaMercadoPagoAttempt({
      currentPlan: 'pro_anual',
      originalPlan: 'pro_anual',
      paymentId: 'pay_new_yearly',
      amount: 478.8,
      dueDate: '2027-06-12'
    }),
    providerUpdates: {
      plano: 'pro_anual',
      valor: 478.8,
      tipo_cobranca: 'anual',
      payment_provider: 'mercado_pago',
      provider_payment_id: 'pay_new_yearly',
      provider_status: 'pending',
      provider_raw: {
        attempt: {
          plano_original: 'pro_anual',
          valor_original: 478.8,
          payment_id: 'pay_new_yearly'
        }
      },
      mercado_pago_payment_id: 'pay_new_yearly',
      mercado_pago_status: 'pending',
      checkout_url: null,
      renovacao_automatica: false
    },
    baseDate
  });

  assert.equal(updates.status, 'ativo');
  assert.equal(updates.bloqueado, false);
  assert.equal(updates.data_vencimento, '2027-06-12');
  assert.equal(updates.plano, undefined);
  assert.equal(updates.valor, undefined);
  assert.equal(updates.tipo_cobranca, undefined);
  assert.equal(updates.provider_payment_id, 'pay_new_yearly');
  assert.equal(updates.provider_raw.attempt.plano_original, 'pro_anual');
});

test('usuario sem assinatura gera pendente bloqueado', () => {
  const updates = buildPendingPaymentAttemptUpdates({
    assinatura: {},
    providerUpdates: {
      plano: 'pro_mensal',
      valor: 49.9,
      tipo_cobranca: 'mensal',
      payment_provider: 'mercado_pago',
      provider_payment_id: 'pay_new'
    },
    baseDate
  });

  assert.equal(updates.status, 'pendente');
  assert.equal(updates.bloqueado, true);
  assert.equal(updates.plano, 'pro_mensal');
  assert.equal(updates.valor, 49.9);
});

test('Pix pendente recente e detectado para impedir nova tentativa conflitante', () => {
  const pending = getRecentMercadoPagoPendingAttempt(assinaturaPendenteMercadoPago({
    paymentId: 'pix-1',
    method: 'pix',
    createdAt: '2026-06-12T00:00:00Z'
  }), { id: 'pro_mensal' }, {
    baseDate: new Date('2026-06-12T00:30:00Z')
  });

  assert.equal(pending.payment_id, 'pix-1');
  assert.equal(pending.plan_id, 'pro_mensal');
  assert.equal(pending.method, 'pix');
});

test('Pix EFI pendente recente e detectado para impedir nova tentativa conflitante', () => {
  const pending = getRecentEfiBankPendingAttempt(assinaturaEfiAttempt({
    paymentId: 'fxpending12345678901234567890',
    status: 'ATIVA'
  }), { id: 'pro_mensal' }, {
    baseDate: new Date('2026-06-12T00:30:00Z')
  });

  assert.equal(pending.payment_id, 'fxpending12345678901234567890');
  assert.equal(pending.plan_id, 'pro_mensal');
  assert.equal(pending.method, 'pix');
});

test('Pix pendente expirado permite nova tentativa', () => {
  const pending = getRecentMercadoPagoPendingAttempt(assinaturaPendenteMercadoPago({
    paymentId: 'pix-expired',
    method: 'pix',
    createdAt: '2026-06-12T00:00:00Z',
    expirationDate: '2026-06-12T00:20:00Z'
  }), { id: 'pro_mensal' }, {
    baseDate: new Date('2026-06-12T00:30:00Z')
  });

  assert.equal(pending, null);
});

test('Pix EFI expirado permite nova tentativa', () => {
  const pending = getRecentEfiBankPendingAttempt({
    ...assinaturaEfiAttempt({
      paymentId: 'fxexpired12345678901234567890',
      status: 'ATIVA'
    }),
    provider_raw: {
      ...assinaturaEfiAttempt({
        paymentId: 'fxexpired12345678901234567890',
        status: 'ATIVA'
      }).provider_raw,
      payment: {
        ...assinaturaEfiAttempt({
          paymentId: 'fxexpired12345678901234567890',
          status: 'ATIVA'
        }).provider_raw.payment,
        expires_at: '2026-06-12T00:20:00Z'
      }
    }
  }, { id: 'pro_mensal' }, {
    baseDate: new Date('2026-06-12T00:30:00Z')
  });

  assert.equal(pending, null);
});

test('Brick pendente recente e detectado para bloquear nova tentativa', () => {
  const pending = getRecentMercadoPagoPendingAttempt(assinaturaPendenteMercadoPago({
    paymentId: 'brick-1',
    method: 'visa',
    status: 'in_process',
    createdAt: '2026-06-12T00:00:00Z'
  }), { id: 'pro_mensal' }, {
    baseDate: new Date('2026-06-12T00:30:00Z')
  });

  assert.equal(pending.payment_id, 'brick-1');
  assert.equal(pending.status, 'in_process');
});

test('tentativa recusada permite nova tentativa', () => {
  const pending = getRecentMercadoPagoPendingAttempt(assinaturaPendenteMercadoPago({
    paymentId: 'pay-rejected',
    status: 'rejected',
    createdAt: '2026-06-12T00:00:00Z'
  }), { id: 'pro_mensal' }, {
    baseDate: new Date('2026-06-12T00:30:00Z')
  });

  assert.equal(pending, null);
});

test('trial ativo com pagamento pendente Mercado Pago continua liberado', () => {
  const updates = buildMercadoPagoSubscriptionUpdates({
    id: 123,
    status: 'pending'
  }, assinaturaTrialMercadoPagoAttempt(), baseDate);

  assert.equal(updates.status, 'teste_gratis');
  assert.equal(updates.bloqueado, false);
  assert.equal(updates.data_vencimento, '2026-06-17');
  assert.equal(updates.provider_status, 'pending');
});

test('pagamento pendente Mercado Pago nao bloqueia usuario ativo', () => {
  const updates = buildMercadoPagoSubscriptionUpdates({
    id: 'pay_active',
    status: 'pending'
  }, assinaturaAtivaMercadoPagoAttempt({
    paymentId: 'pay_active',
    dueDate: '2026-07-20'
  }), baseDate);

  assert.equal(updates.status, 'ativo');
  assert.equal(updates.bloqueado, false);
  assert.equal(updates.data_vencimento, '2026-07-20');
  assert.equal(updates.provider_payment_id, 'pay_active');
  assert.equal(updates.provider_status, 'pending');
});

test('trial ativo com pagamento recusado Mercado Pago continua liberado', () => {
  const updates = buildMercadoPagoSubscriptionUpdates({
    id: 123,
    status: 'rejected'
  }, assinaturaTrialMercadoPagoAttempt(), baseDate);

  assert.equal(updates.status, 'teste_gratis');
  assert.equal(updates.bloqueado, false);
  assert.equal(updates.data_vencimento, '2026-06-17');
  assert.equal(updates.renovacao_automatica, undefined);
});

test('pagamento recusado Mercado Pago nao bloqueia usuario ativo', () => {
  const updates = buildMercadoPagoSubscriptionUpdates({
    id: 'pay_active',
    status: 'rejected'
  }, assinaturaAtivaMercadoPagoAttempt({
    paymentId: 'pay_active',
    dueDate: '2026-07-20'
  }), baseDate);

  assert.equal(updates.status, 'ativo');
  assert.equal(updates.bloqueado, false);
  assert.equal(updates.data_vencimento, '2026-07-20');
  assert.equal(updates.provider_payment_id, 'pay_active');
  assert.equal(updates.provider_status, 'rejected');
  assert.equal(updates.renovacao_automatica, undefined);
});

test('cobranca antiga recusada Mercado Pago nao sobrescreve tentativa atual do trial', () => {
  const updates = buildMercadoPagoSubscriptionUpdates({
    id: 999,
    status: 'rejected'
  }, assinaturaTrialMercadoPagoAttempt({ paymentId: '123' }), baseDate);

  assert.equal(updates.ignored, true);
  assert.equal(updates.outcome, 'ignored_not_current_attempt');
  assert.equal(updates.status, undefined);
  assert.equal(updates.provider_payment_id, '999');
});

test('trial ativo com pagamento aprovado Mercado Pago vira pago', () => {
  const updates = buildMercadoPagoSubscriptionUpdates({
    id: 123,
    status: 'approved',
    transaction_amount: 49.9,
    metadata: {
      plano: 'pro_mensal'
    }
  }, assinaturaTrialMercadoPagoAttempt(), baseDate);

  assert.equal(updates.status, 'ativo');
  assert.equal(updates.bloqueado, false);
  assert.equal(updates.plano, 'pro_mensal');
  assert.equal(updates.valor, 49.9);
  assert.equal(updates.data_vencimento, '2026-07-12');
});

test('pagamento aprovado Mercado Pago renova usuario ativo corretamente', () => {
  const updates = buildMercadoPagoSubscriptionUpdates({
    id: 'pay_active',
    status: 'approved',
    transaction_amount: 49.9,
    metadata: {
      plano: 'pro_mensal'
    }
  }, assinaturaAtivaMercadoPagoAttempt({
    paymentId: 'pay_active',
    dueDate: '2026-07-20',
    status: 'pending'
  }), baseDate);

  assert.equal(updates.status, 'ativo');
  assert.equal(updates.bloqueado, false);
  assert.equal(updates.plano, 'pro_mensal');
  assert.equal(updates.valor, 49.9);
  assert.equal(updates.tipo_cobranca, 'mensal');
  assert.equal(updates.data_vencimento, '2026-07-12');
  assert.equal(updates.provider_status, 'approved');
});

test('trial vencido com pagamento pendente Mercado Pago continua bloqueado', () => {
  const updates = buildMercadoPagoSubscriptionUpdates({
    id: 123,
    status: 'pending'
  }, assinaturaTrialMercadoPagoAttempt({ trialEnd: '2026-06-11' }), baseDate);

  assert.equal(updates.status, 'pendente');
  assert.equal(updates.bloqueado, true);
});

test('assinatura vencida com pagamento pendente Mercado Pago continua bloqueada', () => {
  const updates = buildMercadoPagoSubscriptionUpdates({
    id: 'pay_expired',
    status: 'pending'
  }, assinaturaAtivaMercadoPagoAttempt({
    paymentId: 'pay_expired',
    dueDate: '2026-06-11',
    status: 'pending'
  }), baseDate);

  assert.equal(updates.status, 'pendente');
  assert.equal(updates.bloqueado, true);
  assert.equal(updates.data_vencimento, undefined);
});

test('trial vencido com pagamento aprovado Mercado Pago libera', () => {
  const updates = buildMercadoPagoSubscriptionUpdates({
    id: 123,
    status: 'approved',
    transaction_amount: 49.9,
    metadata: {
      plano: 'pro_mensal'
    }
  }, assinaturaTrialMercadoPagoAttempt({ trialEnd: '2026-06-11' }), baseDate);

  assert.equal(updates.status, 'ativo');
  assert.equal(updates.bloqueado, false);
  assert.equal(updates.plano, 'pro_mensal');
});

test('pagamento recusado nao ativa assinatura', () => {
  const updates = buildMercadoPagoSubscriptionUpdates({
    id: 456,
    status: 'rejected'
  }, assinatura, baseDate);

  assert.equal(updates.status, 'cancelado');
  assert.equal(updates.bloqueado, true);
  assert.equal(updates.data_vencimento, undefined);
});

test('mensal pago apos troca para anual nao libera anual', () => {
  const updates = buildMercadoPagoSubscriptionUpdates({
    id: 123,
    status: 'approved',
    transaction_amount: 49.9,
    metadata: {
      plano: 'pro_mensal'
    }
  }, assinaturaMercadoPagoAttempt({
    currentPlan: 'pro_anual',
    originalPlan: 'pro_mensal',
    paymentId: '123',
    amount: 49.9
  }), baseDate);

  assert.equal(updates.status, 'ativo');
  assert.equal(updates.plano, 'pro_mensal');
  assert.equal(updates.valor, 49.9);
  assert.equal(updates.tipo_cobranca, 'mensal');
  assert.equal(updates.data_vencimento, '2026-07-12');
});

test('anual pago apos troca para mensal nao libera mensal', () => {
  const updates = buildMercadoPagoSubscriptionUpdates({
    id: 321,
    status: 'approved',
    transaction_amount: 478.8,
    metadata: {
      plano: 'pro_anual'
    }
  }, assinaturaMercadoPagoAttempt({
    currentPlan: 'pro_mensal',
    originalPlan: 'pro_anual',
    paymentId: '321',
    amount: 478.8
  }), baseDate);

  assert.equal(updates.status, 'ativo');
  assert.equal(updates.plano, 'pro_anual');
  assert.equal(updates.valor, 478.8);
  assert.equal(updates.tipo_cobranca, 'anual');
  assert.equal(updates.data_vencimento, '2027-06-12');
});

test('cobranca antiga Mercado Pago e ignorada e nao sobrescreve tentativa nova', () => {
  const updates = buildMercadoPagoSubscriptionUpdates({
    id: 123,
    status: 'approved',
    transaction_amount: 49.9,
    metadata: {
      plano: 'pro_mensal'
    }
  }, assinaturaMercadoPagoAttempt({
    currentPlan: 'pro_anual',
    originalPlan: 'pro_anual',
    paymentId: '999',
    amount: 478.8
  }), baseDate);

  assert.equal(updates.ignored, true);
  assert.equal(updates.outcome, 'ignored_not_current_attempt');
  assert.equal(updates.status, undefined);
  assert.equal(updates.data_vencimento, undefined);
});

test('webhook antigo aprovado Mercado Pago com plano errado nao libera assinatura', () => {
  const updates = buildMercadoPagoSubscriptionUpdates({
    id: 123,
    status: 'approved',
    transaction_amount: 49.9,
    metadata: {
      user_id: 'user-1',
      assinatura_id: 'sub-1',
      plano: 'pro_anual'
    },
    external_reference: 'user-1:sub-1:pro_anual'
  }, assinaturaMercadoPagoAttempt({
    currentPlan: 'pro_mensal',
    originalPlan: 'pro_mensal',
    paymentId: '999',
    amount: 49.9
  }), baseDate);

  assert.equal(updates.ignored, true);
  assert.equal(updates.outcome, 'ignored_not_current_attempt');
  assert.equal(updates.status, undefined);
});

test('webhook antigo aprovado Mercado Pago valido gera outcome claro e ativa', () => {
  const updates = buildMercadoPagoSubscriptionUpdates({
    id: 123,
    status: 'approved',
    transaction_amount: 49.9,
    payment_method_id: 'pix',
    metadata: {
      user_id: 'user-1',
      assinatura_id: 'sub-1',
      plano: 'pro_mensal'
    },
    external_reference: 'user-1:sub-1:pro_mensal'
  }, {
    ...assinaturaMercadoPagoAttempt({
    currentPlan: 'pro_mensal',
    originalPlan: 'pro_mensal',
    paymentId: '999',
    amount: 49.9
    }),
    user_id: 'user-1'
  }, baseDate);

  assert.equal(updates.outcome, 'approved_old_attempt');
  assert.equal(updates.status, 'ativo');
  assert.equal(updates.bloqueado, false);
  assert.equal(updates.plano, 'pro_mensal');
  assert.equal(updates.valor, 49.9);
});

test('cobranca correta ativa o plano original mesmo se assinatura atual divergir', () => {
  const updates = buildMercadoPagoSubscriptionUpdates({
    id: 999,
    status: 'approved',
    transaction_amount: 478.8,
    metadata: {
      plano: 'pro_anual'
    }
  }, assinaturaMercadoPagoAttempt({
    currentPlan: 'pro_mensal',
    originalPlan: 'pro_anual',
    paymentId: '999',
    amount: 478.8
  }), baseDate);

  assert.equal(updates.status, 'ativo');
  assert.equal(updates.plano, 'pro_anual');
  assert.equal(updates.valor, 478.8);
  assert.equal(updates.data_vencimento, '2027-06-12');
});

test('valor pago diferente do valor original nao ativa assinatura Mercado Pago', () => {
  const updates = buildMercadoPagoSubscriptionUpdates({
    id: 123,
    status: 'approved',
    transaction_amount: 1,
    metadata: {
      plano: 'pro_mensal'
    }
  }, assinaturaMercadoPagoAttempt(), baseDate);

  assert.equal(updates.ignored, true);
  assert.equal(updates.outcome, 'ignored_amount_mismatch');
  assert.equal(updates.status, undefined);
});

test('plano do pagamento diferente do plano original nao ativa assinatura Mercado Pago', () => {
  const updates = buildMercadoPagoSubscriptionUpdates({
    id: 123,
    status: 'approved',
    transaction_amount: 49.9,
    metadata: {
      plano: 'pro_anual'
    }
  }, assinaturaMercadoPagoAttempt(), baseDate);

  assert.equal(updates.ignored, true);
  assert.equal(updates.outcome, 'ignored_plan_mismatch');
  assert.equal(updates.status, undefined);
});

test('webhook duplicado Mercado Pago aprovado nao avanca vencimento de novo', () => {
  const updates = buildMercadoPagoSubscriptionUpdates({
    id: 123,
    status: 'approved'
  }, {
    ...assinatura,
    status: 'ativo',
    bloqueado: false,
    provider_payment_id: '123',
    provider_status: 'approved',
    mercado_pago_payment_id: '123',
    mercado_pago_status: 'approved',
    data_vencimento: '2026-07-12'
  }, new Date('2026-06-20T00:00:00Z'));

  assert.equal(updates.provider_payment_id, '123');
  assert.equal(updates.provider_status, 'approved');
  assert.equal(updates.mercado_pago_payment_id, '123');
  assert.equal(updates.mercado_pago_status, 'approved');
  assert.equal(updates.already_processed, true);
  assert.equal(updates.outcome, 'duplicate_ignored');
  assert.equal(updates.status, undefined);
  assert.equal(updates.data_vencimento, undefined);
});

test('webhook duplicado EFI aprovado nao avanca vencimento de novo', () => {
  const updates = buildEfiBankSubscriptionUpdates({
    id: 'fx123',
    txid: 'fx123',
    status: 'CONCLUIDA'
  }, {
    ...assinatura,
    status: 'ativo',
    bloqueado: false,
    payment_provider: 'efi',
    provider_payment_id: 'fx123',
    provider_status: 'CONCLUIDA',
    data_vencimento: '2026-07-12'
  }, new Date('2026-06-20T00:00:00Z'));

  assert.equal(updates.provider_payment_id, 'fx123');
  assert.equal(updates.provider_status, 'CONCLUIDA');
  assert.equal(updates.already_processed, true);
  assert.equal(updates.outcome, 'duplicate_ignored');
  assert.equal(updates.status, undefined);
  assert.equal(updates.data_vencimento, undefined);
});

test('valor pago diferente do valor original nao ativa assinatura EFI', () => {
  const updates = buildEfiBankSubscriptionUpdates({
    id: 'fx123',
    txid: 'fx123',
    status: 'CONCLUIDA',
    amount: 1,
    metadata: {
      user_id: 'user-1',
      assinatura_id: 'sub-1',
      plano: 'pro_mensal'
    }
  }, assinaturaEfiAttempt(), baseDate);

  assert.equal(updates.ignored, true);
  assert.equal(updates.outcome, 'ignored_amount_mismatch');
  assert.equal(updates.status, undefined);
});

test('plano do pagamento diferente do plano original nao ativa assinatura EFI', () => {
  const updates = buildEfiBankSubscriptionUpdates({
    id: 'fx123',
    txid: 'fx123',
    status: 'CONCLUIDA',
    amount: 49.9,
    metadata: {
      user_id: 'user-1',
      assinatura_id: 'sub-1',
      plano: 'pro_anual'
    }
  }, assinaturaEfiAttempt(), baseDate);

  assert.equal(updates.ignored, true);
  assert.equal(updates.outcome, 'ignored_plan_mismatch');
  assert.equal(updates.status, undefined);
});

test('pagamento antigo EFI nao libera plano errado', () => {
  const updates = buildEfiBankSubscriptionUpdates({
    id: 'fxold',
    txid: 'fxold',
    status: 'CONCLUIDA',
    amount: 478.8,
    metadata: {
      user_id: 'user-1',
      assinatura_id: 'sub-1',
      plano: 'pro_anual'
    }
  }, assinaturaEfiAttempt({
    currentPlan: 'pro_mensal',
    originalPlan: 'pro_mensal',
    paymentId: 'fxcurrent',
    amount: 49.9
  }), baseDate);

  assert.equal(updates.ignored, true);
  assert.equal(updates.outcome, 'ignored_not_current_attempt');
  assert.equal(updates.status, undefined);
});

test('pagamento recorrente vencido bloqueia assinatura', () => {
  const updates = buildAsaasSubscriptionUpdates({
    id: 'pay_overdue',
    subscription: 'sub_asaas_1',
    status: 'OVERDUE'
  }, assinatura, baseDate);

  assert.equal(updates.status, 'vencido');
  assert.equal(updates.bloqueado, true);
  assert.equal(updates.renovacao_automatica, false);
});

test('webhook duplicado do mesmo pagamento nao avanca vencimento de novo', () => {
  const updates = buildAsaasSubscriptionUpdates({
    id: 'pay_duplicated',
    subscription: 'sub_asaas_1',
    status: 'RECEIVED',
    dueDate: '2026-06-12'
  }, {
    ...assinatura,
    status: 'ativo',
    bloqueado: false,
    provider_payment_id: 'pay_duplicated',
    provider_status: 'RECEIVED',
    data_vencimento: '2026-07-12'
  }, new Date('2026-06-13T00:00:00Z'));

  assert.equal(updates.provider_payment_id, 'pay_duplicated');
  assert.equal(updates.provider_status, 'RECEIVED');
  assert.equal(updates.status, undefined);
  assert.equal(updates.data_vencimento, undefined);
});
