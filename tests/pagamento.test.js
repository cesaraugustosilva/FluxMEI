import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAsaasSubscriptionUpdates,
  buildMercadoPagoSubscriptionUpdates
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
    status: 'approved'
  }, assinatura, baseDate);

  assert.equal(updates.status, 'ativo');
  assert.equal(updates.bloqueado, false);
  assert.equal(updates.payment_provider, 'mercado_pago');
  assert.equal(updates.provider_payment_id, '123');
  assert.equal(updates.data_vencimento, '2026-07-12');
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

test('pagamento recusado nao ativa assinatura', () => {
  const updates = buildMercadoPagoSubscriptionUpdates({
    id: 456,
    status: 'rejected'
  }, assinatura, baseDate);

  assert.equal(updates.status, 'cancelado');
  assert.equal(updates.bloqueado, true);
  assert.equal(updates.data_vencimento, undefined);
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
