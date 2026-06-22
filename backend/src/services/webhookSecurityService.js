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

export function validateEfiWebhook(req) {
  const expectedSecret = process.env.EFI_WEBHOOK_SECRET;

  if (!hasValue(expectedSecret)) {
    if (isProduction()) {
      console.error('[webhook:efi] configuracao insegura: EFI_WEBHOOK_SECRET ausente em producao.');
      throw new AppError('Webhook EFI indisponivel por configuracao insegura.', 503);
    }

    warnMissingSecretOnce('efi', 'EFI_WEBHOOK_SECRET');
    return { validated: false, reason: 'missing_secret_dev' };
  }

  const authorization = String(req.headers.authorization || '');
  const bearerToken = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7)
    : null;
  const receivedSecret = req.headers['x-efi-webhook-secret']
    || req.headers['efi-webhook-secret']
    || req.headers['x-webhook-secret']
    || bearerToken
    || req.query?.secret
    || req.query?.token
    || req.query?.webhook_secret;

  if (receivedSecret !== expectedSecret) {
    logWebhookEvent({
      provider: 'efi',
      event: req.body?.evento || req.body?.event || req.body?.type || null,
      paymentId: req.body?.txid || req.body?.charge_id || req.body?.id || null,
      status: req.body?.status || null,
      outcome: 'rejected_invalid_token'
    });
    throw new AppError('Webhook EFI nao autorizado.', 401);
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
  const efiEnabled = hasValue(process.env.EFI_CLIENT_ID)
    || hasValue(process.env.EFI_CLIENT_SECRET)
    || hasValue(process.env.EFI_PIX_KEY)
    || hasValue(process.env.EFI_WEBHOOK_SECRET);

  if (!efiEnabled) return;

  if (!isProduction()) {
    if (!hasValue(process.env.EFI_WEBHOOK_SECRET)) {
      warnMissingSecretOnce('efi', 'EFI_WEBHOOK_SECRET');
    }
    return;
  }

  if (!hasValue(process.env.EFI_WEBHOOK_SECRET)) {
    console.error('[startup:webhooks] CRITICO: EFI habilitado sem EFI_WEBHOOK_SECRET. Webhook sera recusado em producao.');
  }
}
