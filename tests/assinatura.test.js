import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSubscriptionStatus,
  buildPendingSubscriptionPayload,
  buildTrialSubscriptionPayload,
  evaluateSubscriptionAccess
} from '../backend/src/services/assinaturaRules.js';

test('usuario novo recebe teste gratis corretamente', () => {
  const payload = buildTrialSubscriptionPayload('user-1', '2026-06-12');

  assert.equal(payload.user_id, 'user-1');
  assert.equal(payload.plano, 'gratuito');
  assert.equal(payload.status, 'teste_gratis');
  assert.equal(payload.valor, 0);
  assert.equal(payload.bloqueado, false);
  assert.equal(payload.teste_gratis_usado, true);
  assert.equal(payload.data_inicio, '2026-06-12');
  assert.equal(payload.data_vencimento, '2026-06-19');
  assert.equal(payload.data_trial_fim, '2026-06-19');
});

test('assinatura direta cria assinatura pendente sem trial automatico', () => {
  const payload = buildPendingSubscriptionPayload('user-2', 'pro_mensal', '2026-06-12');

  assert.equal(payload.user_id, 'user-2');
  assert.equal(payload.plano, 'pro_mensal');
  assert.equal(payload.status, 'pendente');
  assert.equal(payload.bloqueado, true);
  assert.equal(payload.teste_gratis_usado, false);
  assert.equal(payload.data_trial_fim, null);
});

test('trial expirado retorna bloqueado', () => {
  const assinatura = {
    id: 'sub-1',
    plano: 'gratuito',
    status: 'teste_gratis',
    bloqueado: false,
    data_trial_fim: '2026-06-10',
    data_vencimento: '2026-06-10'
  };

  const access = evaluateSubscriptionAccess(assinatura, '2026-06-12');

  assert.equal(access.allowed, false);
  assert.equal(access.estado, 'expirado');
  assert.equal(access.shouldMarkExpired, true);
  assert.equal(access.assinatura.status, 'vencido');
  assert.equal(access.assinatura.bloqueado, true);
});

test('assinatura ativa retorna acesso liberado', () => {
  const assinatura = {
    id: 'sub-2',
    plano: 'pro_mensal',
    status: 'ativo',
    bloqueado: false,
    data_vencimento: '2026-07-12'
  };

  const access = evaluateSubscriptionAccess(assinatura, '2026-06-12');

  assert.equal(access.allowed, true);
  assert.equal(access.assinatura.id, 'sub-2');
});

test('assinatura com cancelamento agendado preserva acesso ate vencimento', () => {
  const assinatura = {
    id: 'sub-3',
    plano: 'pro_anual',
    status: 'ativo',
    bloqueado: false,
    cancel_at_period_end: true,
    data_vencimento: '2026-07-12'
  };

  const access = evaluateSubscriptionAccess(assinatura, '2026-06-12');
  const status = buildSubscriptionStatus(access, '2026-06-12');

  assert.equal(access.allowed, true);
  assert.equal(status.estado, 'cancelamento_agendado');
  assert.equal(status.ativo, true);
  assert.equal(status.cancel_at_period_end, true);
  assert.equal(status.dias_restantes, 30);
});
