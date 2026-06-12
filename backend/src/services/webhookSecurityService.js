import crypto from 'node:crypto';
import { AppError } from '../middlewares/errorMiddleware.js';

const warnedMissingSecrets = new Set();

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function hasValue(value) {
  return Boolean(String(value || '').trim());
}

function warnMissingSecretOnce(provider, envName) {
  const key = `${provider}:${envName}`;
  if (warnedMissingSecrets.has(key)) return;
  warnedMissingSecrets.add(key);
  console.warn(`[webhook:${provider}] ${envName} ausente. Ambiente local aceitara notificacoes sem validacao; configure antes de producao.`);
}

function getSignatureParts(signature = '') {
  return String(signature)
    .split(',')
    .map((part) => part.split('='))
    .reduce((acc, [key, value]) => {
      if (key && value) acc[key.trim()] = value.trim();
      return acc;
    }, {});
}

function timingSafeEqualHex(left, right) {
  try {
    const leftBuffer = Buffer.from(left || '', 'hex');
    const rightBuffer = Buffer.from(right || '', 'hex');
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
  } catch {
    return false;
  }
}

export function validateMercadoPagoWebhook(req, dataId) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

  if (!hasValue(secret)) {
    if (isProduction()) {
      console.error('[webhook:mercado_pago] configuracao insegura: MERCADO_PAGO_WEBHOOK_SECRET ausente em producao.');
      throw new AppError('Webhook Mercado Pago indisponivel por configuracao insegura.', 503);
    }

    warnMissingSecretOnce('mercado_pago', 'MERCADO_PAGO_WEBHOOK_SECRET');
    return { validated: false, reason: 'missing_secret_dev' };
  }

  const signature = req.headers['x-signature'];
  const requestId = req.headers['x-request-id'];
  const { ts, v1 } = getSignatureParts(signature);

  if (!dataId || !requestId || !ts || !v1) {
    logWebhookEvent({ provider: 'mercado_pago', event: 'payment', paymentId: dataId, outcome: 'rejected_missing_signature' });
    throw new AppError('Webhook Mercado Pago sem assinatura valida.', 401);
  }

  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  if (!timingSafeEqualHex(expected, v1)) {
    logWebhookEvent({ provider: 'mercado_pago', event: 'payment', paymentId: dataId, outcome: 'rejected_invalid_signature' });
    throw new AppError('Webhook Mercado Pago nao autorizado.', 401);
  }

  return { validated: true };
}

export function validateAsaasWebhook(req) {
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;

  if (!hasValue(expectedToken)) {
    if (isProduction()) {
      console.error('[webhook:asaas] configuracao insegura: ASAAS_WEBHOOK_TOKEN ausente em producao.');
      throw new AppError('Webhook Asaas indisponivel por configuracao insegura.', 503);
    }

    warnMissingSecretOnce('asaas', 'ASAAS_WEBHOOK_TOKEN');
    return { validated: false, reason: 'missing_token_dev' };
  }

  if (req.headers['asaas-access-token'] !== expectedToken) {
    logWebhookEvent({
      provider: 'asaas',
      event: req.body?.event || null,
      paymentId: req.body?.payment?.id || null,
      subscriptionId: req.body?.payment?.subscription || req.body?.subscription?.id || null,
      status: req.body?.payment?.status || null,
      outcome: 'rejected_invalid_token'
    });
    throw new AppError('Webhook Asaas nao autorizado.', 401);
  }

  return { validated: true };
}

export function logWebhookEvent({ provider, event = null, paymentId = null, subscriptionId = null, status = null, outcome = 'received' }) {
  console.info('[webhook:event]', {
    provider,
    event,
    payment_id: paymentId ? String(paymentId) : null,
    subscription_id: subscriptionId ? String(subscriptionId) : null,
    status,
    outcome
  });
}

export function checkPaymentWebhookConfiguration() {
  const mercadoPagoEnabled = hasValue(process.env.MERCADO_PAGO_ACCESS_TOKEN)
    || hasValue(process.env.MERCADO_PAGO_PUBLIC_KEY)
    || hasValue(process.env.MERCADO_PAGO_NOTIFICATION_URL);
  const asaasEnabled = hasValue(process.env.ASAAS_API_KEY)
    || hasValue(process.env.ASAAS_WEBHOOK_TOKEN);

  if (!isProduction()) {
    if (mercadoPagoEnabled && !hasValue(process.env.MERCADO_PAGO_WEBHOOK_SECRET)) {
      warnMissingSecretOnce('mercado_pago', 'MERCADO_PAGO_WEBHOOK_SECRET');
    }
    if (asaasEnabled && !hasValue(process.env.ASAAS_WEBHOOK_TOKEN)) {
      warnMissingSecretOnce('asaas', 'ASAAS_WEBHOOK_TOKEN');
    }
    return;
  }

  if (mercadoPagoEnabled && !hasValue(process.env.MERCADO_PAGO_WEBHOOK_SECRET)) {
    console.error('[startup:webhooks] CRITICO: Mercado Pago habilitado sem MERCADO_PAGO_WEBHOOK_SECRET. Webhook sera recusado em producao.');
  }

  if (asaasEnabled && !hasValue(process.env.ASAAS_WEBHOOK_TOKEN)) {
    console.error('[startup:webhooks] CRITICO: Asaas habilitado sem ASAAS_WEBHOOK_TOKEN. Webhook sera recusado em producao.');
  }
}
