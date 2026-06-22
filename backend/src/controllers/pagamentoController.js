import crypto from 'node:crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { PLANOS, assinaturaService } from '../services/assinaturaService.js';
import { efiBankService } from '../services/efiBankService.js';
import {
  EFI_BANK_PAID_STATUSES,
  PAYMENT_PLANS,
  buildEfiBankPaymentAttempt,
  buildEfiBankProviderRaw,
  buildEfiBankSubscriptionUpdates,
  buildPendingPaymentAttemptUpdates,
  getRecentEfiBankPendingAttempt
} from '../services/paymentStatusRules.js';
import { logWebhookEvent, validateEfiWebhook } from '../services/webhookSecurityService.js';
import { sanitizeText } from '../utils/validation.js';

const PENDING_PAYMENT_MESSAGE = 'Voce ja possui um pagamento pendente. Conclua ou aguarde a expiracao antes de gerar outro.';
const PROCESSING_PAYMENT_MESSAGE = 'Ja existe uma tentativa de pagamento em processamento. Aguarde alguns instantes e tente novamente.';
const EFI_BANK_LOCK_TTL_SECONDS = 120;
const FORBIDDEN_CARD_FIELDS = new Set([
  'card_number',
  'cardnumber',
  'number',
  'numero',
  'cvv',
  'cvc',
  'expiration',
  'expiration_month',
  'expiration_year',
  'expirationmonth',
  'expirationyear',
  'validade',
  'security_code',
  'securitycode',
  'codigo_seguranca',
  'raw_card',
  'rawcard'
]);
const CARD_TOP_LEVEL_FIELDS = ['plano', 'payment', 'card', 'valor', 'parcelas', 'installments', 'nome', 'email', 'cpf', 'cnpj', 'documento'];
const CARD_PAYMENT_FIELDS = ['payment_token', 'paymentToken', 'token', 'installments', 'parcelas', 'nome', 'holder_name', 'holderName', 'email', 'cpf', 'cnpj', 'documento'];

function validatePlanId(value, fallback = null) {
  const plano = sanitizeText(value || fallback, { field: 'Plano', required: true, max: 80 });
  const plan = PAYMENT_PLANS[plano];
  if (!plan || !PLANOS[plano]) throw new AppError('Plano invalido.');
  return { plano, plan };
}

function validatePaymentId(value) {
  return sanitizeText(value, { field: 'payment_id', required: true, max: 120, rejectDangerous: true });
}

function normalizeFieldName(field) {
  return String(field || '').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
}

function assertNoRawCardData(value, path = 'body') {
  if (!value || typeof value !== 'object') return;

  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = normalizeFieldName(key);
    if (FORBIDDEN_CARD_FIELDS.has(normalizedKey)) {
      throw new AppError(`Campo de cartao nao permitido: ${path}.${key}. Envie apenas payment_token.`, 400);
    }
    assertNoRawCardData(item, `${path}.${key}`);
  }
}

function assertAllowedFields(value, allowed, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(`${path} deve ser um objeto valido.`, 400);
  }

  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unexpected.length) {
    throw new AppError(`Campos inesperados em ${path}: ${unexpected.join(', ')}.`, 400);
  }
}

function sanitizeDocument(value, field = 'CPF/CNPJ') {
  const text = sanitizeText(value, { field, required: false, max: 24, rejectDangerous: true });
  if (!text) return null;
  const digits = text.replace(/\D/g, '');
  if (![11, 14].includes(digits.length)) throw new AppError(`${field} invalido.`);
  return digits;
}

function sanitizeInstallments(value) {
  const number = Number(value ?? 1);
  if (!Number.isInteger(number) || number < 1 || number > 12) {
    throw new AppError('Parcelas invalidas.');
  }
  return number;
}

function validateEfiCardPayload(body = {}, plan) {
  assertNoRawCardData(body);
  assertAllowedFields(body, CARD_TOP_LEVEL_FIELDS, 'body');

  const payment = body.payment || body.card || body;
  assertAllowedFields(payment, CARD_PAYMENT_FIELDS, body.payment ? 'payment' : body.card ? 'card' : 'body');

  if (body.valor !== undefined && Math.round(Number(body.valor) * 100) !== Math.round(Number(plan.value) * 100)) {
    throw new AppError('Valor informado nao corresponde ao plano selecionado.');
  }

  const paymentToken = sanitizeText(payment.payment_token || payment.paymentToken || payment.token, {
    field: 'payment_token',
    required: true,
    max: 180,
    rejectDangerous: true
  });

  return {
    payment_token: paymentToken,
    installments: sanitizeInstallments(payment.installments || payment.parcelas || body.installments || body.parcelas),
    holder_name: sanitizeText(payment.holder_name || payment.holderName || payment.nome || body.nome, {
      field: 'Nome do titular',
      required: false,
      max: 120,
      rejectDangerous: true
    }),
    email: sanitizeText(payment.email || body.email, {
      field: 'E-mail do titular',
      required: false,
      max: 254,
      rejectDangerous: true
    }),
    document: sanitizeDocument(payment.cpf || payment.cnpj || payment.documento || body.cpf || body.cnpj || body.documento)
  };
}

async function getProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new AppError('Erro ao buscar perfil.', 500, error.message);
  return data || null;
}

async function getLatestSubscription(userId) {
  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new AppError('Erro ao consultar assinatura.', 500, error.message);
  return data || null;
}

async function ensureUserSubscription(userId, planId) {
  return await getLatestSubscription(userId) || await assinaturaService.createPendingSubscription(userId, planId);
}

async function findSubscriptionByProviderPayment(paymentId) {
  if (!paymentId) return null;

  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .select('*')
    .eq('payment_provider', 'efi')
    .eq('provider_payment_id', String(paymentId))
    .maybeSingle();

  if (error) throw new AppError('Erro ao buscar assinatura por pagamento.', 500, error.message);
  return data || null;
}

async function findSubscriptionById(assinaturaId) {
  if (!assinaturaId) return null;

  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .select('*')
    .eq('id', assinaturaId)
    .maybeSingle();

  if (error) throw new AppError('Erro ao buscar assinatura EFI.', 500, error.message);
  return data || null;
}

async function updateAssinaturaById(assinaturaId, payload) {
  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .update(payload)
    .eq('id', assinaturaId)
    .select()
    .single();

  if (error) throw new AppError('Erro ao atualizar assinatura.', 500, error.message);
  return data;
}

async function acquireEfiAttemptLock(userId, plan) {
  const { data, error } = await supabaseAdmin.rpc('acquire_payment_attempt_lock', {
    p_user_id: userId,
    p_provider: 'efi',
    p_plano: plan.id,
    p_ttl_seconds: EFI_BANK_LOCK_TTL_SECONDS
  });

  if (error) throw new AppError('Erro ao reservar tentativa de pagamento.', 500, error.message);
  const lock = Array.isArray(data) ? data[0] : data;
  return {
    acquired: Boolean(lock?.acquired),
    lockId: lock?.lock_id || null,
    expiresAt: lock?.expires_at || null
  };
}

async function releaseEfiAttemptLock(lockId) {
  if (!lockId) return false;
  const { data, error } = await supabaseAdmin.rpc('release_payment_attempt_lock', {
    p_lock_id: lockId
  });
  if (error) throw new AppError('Erro ao liberar tentativa de pagamento.', 500, error.message);
  return Boolean(data);
}

async function handleEfiLockDenied(userId, plan) {
  const assinatura = await getLatestSubscription(userId);
  const pendingAttempt = getRecentEfiBankPendingAttempt(assinatura, plan);
  if (pendingAttempt?.method === 'pix') {
    const reusablePix = pendingEfiPixResponsePayload(pendingAttempt);
    if (reusablePix) return reusablePix;
  }

  throw new AppError(PROCESSING_PAYMENT_MESSAGE, 409);
}

async function revalidateEfiAttemptAfterLock(userId, plan, { allowReusablePix = false } = {}) {
  const assinatura = await ensureUserSubscription(userId, plan.id);
  const pendingAttempt = getRecentEfiBankPendingAttempt(assinatura, plan);
  if (!pendingAttempt) return { assinatura, reusable: null };

  if (allowReusablePix && pendingAttempt.method === 'pix') {
    const reusable = pendingEfiPixResponsePayload(pendingAttempt);
    if (reusable) return { assinatura, reusable };
  }

  throw new AppError(PENDING_PAYMENT_MESSAGE, 409);
}

function assertNoRecentPendingEfiAttempt(assinatura, plan, { allowReusablePix = false } = {}) {
  const pendingAttempt = getRecentEfiBankPendingAttempt(assinatura, plan);
  if (!pendingAttempt) return null;

  if (allowReusablePix && pendingAttempt.method === 'pix') {
    const reusablePix = pendingEfiPixResponsePayload(pendingAttempt);
    if (reusablePix) return reusablePix;
  }

  throw new AppError(PENDING_PAYMENT_MESSAGE, 409);
}

function getPaymentId(payment) {
  return payment?.id || payment?.txid || payment?.charge_id || payment?.chargeId || null;
}

function getPaymentPlan(payment) {
  return payment?.metadata?.plano
    || payment?.fluxmei_metadata?.plano
    || payment?.custom_id?.split?.(':')?.[2]
    || null;
}

function getPaymentSubscriptionId(payment) {
  return payment?.metadata?.assinatura_id
    || payment?.fluxmei_metadata?.assinatura_id
    || payment?.custom_id?.split?.(':')?.[1]
    || null;
}

function getPaymentAmount(payment) {
  if (payment?.amount !== undefined) return payment.amount;
  if (payment?.valor?.original !== undefined) return Number(payment.valor.original);
  if (payment?.total !== undefined) return Number(payment.total) / 100;
  return null;
}

function normalizeQrCode(payment, qrcode = null) {
  const qrCode = qrcode?.qrcode || qrcode?.qr_code || payment?.pix?.qr_code || payment?.qr_code || null;
  const qrCodeBase64 = qrcode?.imagemQrcode || qrcode?.imagem_qrcode || qrcode?.qr_code_base64 || payment?.qr_code_base64 || null;

  return {
    qr_code: qrCode,
    qr_code_base64: qrCodeBase64
  };
}

function efiPixResponsePayload(payment, qrcode = null) {
  const paymentId = getPaymentId(payment);
  const pix = normalizeQrCode(payment, qrcode);

  return {
    payment_id: paymentId ? String(paymentId) : null,
    txid: payment?.txid || (paymentId ? String(paymentId) : null),
    payment_status: payment?.status || null,
    status: payment?.status || null,
    payment_method_id: 'pix',
    payment_type_id: 'pix',
    valor: getPaymentAmount(payment),
    plano: getPaymentPlan(payment),
    pix,
    qr_code: pix.qr_code,
    qr_code_base64: pix.qr_code_base64,
    copia_e_cola: pix.qr_code,
    ticket_url: qrcode?.linkVisualizacao || qrcode?.ticket_url || null
  };
}

function efiPaymentResponsePayload(payment, fallbackPaymentMethodId = null, qrcode = null) {
  const method = payment?.payment_method_id || payment?.method || fallbackPaymentMethodId;
  if (method === 'pix') return efiPixResponsePayload(payment, qrcode);

  return {
    payment_id: getPaymentId(payment) ? String(getPaymentId(payment)) : null,
    charge_id: payment?.charge_id || payment?.id ? String(payment.charge_id || payment.id) : null,
    payment_status: payment?.status || null,
    status: payment?.status || null,
    payment_method_id: method,
    payment_type_id: payment?.method || fallbackPaymentMethodId,
    valor: getPaymentAmount(payment),
    plano: getPaymentPlan(payment),
    invoice_url: payment?.link || payment?.payment_url || payment?.billet_link || null,
    bank_slip_url: payment?.billet_link || payment?.pdf?.charge || payment?.link || null,
    digitable_line: payment?.barcode || payment?.linha_digitavel || payment?.payment?.banking_billet?.barcode || null,
    due_date: payment?.expire_at || payment?.payment?.banking_billet?.expire_at || null
  };
}

function pendingEfiPixResponsePayload(pendingAttempt) {
  const payment = pendingAttempt?.payment || null;
  const qrcode = pendingAttempt?.qrcode || null;
  if (!payment) return null;

  const payload = efiPixResponsePayload(payment, qrcode);
  if (!payload.qr_code) return null;

  return {
    success: true,
    provider: 'efi',
    reused: true,
    ...payload,
    expires_at: pendingAttempt.expires_at,
    message: 'Pix pendente encontrado. Utilize o pagamento ja gerado.'
  };
}

async function registerEfiPaymentAttempt(assinatura, plan, payment, { idempotencyKey = null, method = null, qrcode = null } = {}) {
  const attempt = buildEfiBankPaymentAttempt({
    plan,
    payment,
    idempotencyKey,
    method
  });

  const paymentId = getPaymentId(payment);
  const updates = buildPendingPaymentAttemptUpdates({
    assinatura,
    providerUpdates: {
      plano: plan.id,
      valor: plan.value,
      tipo_cobranca: plan.tipo_cobranca,
      payment_provider: 'efi',
      provider_payment_id: paymentId ? String(paymentId) : null,
      provider_status: payment?.status || 'created',
      provider_raw: buildEfiBankProviderRaw({ payment: payment || null, attempt, qrcode }),
      checkout_url: payment?.link || payment?.payment_url || payment?.billet_link || null,
      renovacao_automatica: false
    }
  });

  return updateAssinaturaById(assinatura.id, updates);
}

function isEfiPaidStatus(status) {
  return EFI_BANK_PAID_STATUSES.includes(String(status || '').trim().toLowerCase());
}

async function criarPagamentoEfi(req, res, method) {
  const { plano, plan } = validatePlanId(req.body?.plano);
  if (!req.user?.email) throw new AppError('Usuario autenticado sem e-mail cadastrado.', 400);
  const cardPayload = method === 'cartao' ? validateEfiCardPayload(req.body || {}, plan) : null;

  const profile = await getProfile(req.user.id);
  const assinatura = await ensureUserSubscription(req.user.id, plano);
  const reusable = assertNoRecentPendingEfiAttempt(assinatura, plan, { allowReusablePix: method === 'pix' });
  if (reusable) return res.status(200).json(reusable);

  let attemptLock = null;
  let paymentCreated = false;
  let shouldReleaseLock = false;

  try {
    attemptLock = await acquireEfiAttemptLock(req.user.id, plan);
    if (!attemptLock.acquired) {
      const lockedReusable = await handleEfiLockDenied(req.user.id, plan);
      if (lockedReusable) return res.status(200).json(lockedReusable);
    }
    shouldReleaseLock = true;

    const { assinatura: lockedAssinatura, reusable: lockedReusable } = await revalidateEfiAttemptAfterLock(req.user.id, plan, {
      allowReusablePix: method === 'pix'
    });
    if (lockedReusable) return res.status(200).json(lockedReusable);

    const idempotencyKey = crypto.randomUUID();
    let payment;
    let qrcode = null;

    if (method === 'pix') {
      const result = await efiBankService.criarPix({ plan, user: req.user, profile, assinatura: lockedAssinatura, idempotencyKey });
      payment = result.payment;
      qrcode = result.qrcode || null;
    } else if (method === 'boleto') {
      payment = await efiBankService.criarBoleto({ plan, user: req.user, profile, assinatura: lockedAssinatura, idempotencyKey });
    } else {
      payment = await efiBankService.criarCartao({
        plan,
        user: req.user,
        profile,
        assinatura: lockedAssinatura,
        card: cardPayload,
        idempotencyKey
      });
    }

    paymentCreated = true;
    shouldReleaseLock = false;

    let updatedAssinatura = await registerEfiPaymentAttempt(lockedAssinatura, plan, payment, {
      idempotencyKey,
      method,
      qrcode
    });

    if (method === 'cartao' && isEfiPaidStatus(payment?.status)) {
      updatedAssinatura = await aplicarPagamentoEfiNaAssinatura(payment, updatedAssinatura);
    }
    shouldReleaseLock = true;

    const messages = {
      pix: 'Pix gerado com sucesso',
      boleto: 'Boleto gerado com sucesso',
      cartao: 'Pagamento enviado a EFI Bank'
    };

    return res.status(201).json({
      success: true,
      provider: 'efi',
      ...efiPaymentResponsePayload(payment, method, qrcode),
      assinatura: updatedAssinatura,
      message: messages[method]
    });
  } catch (error) {
    if (attemptLock?.acquired && attemptLock.lockId && !paymentCreated) {
      await releaseEfiAttemptLock(attemptLock.lockId);
      shouldReleaseLock = false;
    }
    throw error;
  } finally {
    if (attemptLock?.acquired && attemptLock.lockId && shouldReleaseLock) {
      await releaseEfiAttemptLock(attemptLock.lockId);
    }
  }
}

export async function criarPixEfi(req, res) {
  return criarPagamentoEfi(req, res, 'pix');
}

export async function criarBoletoEfi(req, res) {
  return criarPagamentoEfi(req, res, 'boleto');
}

export async function criarCartaoEfi(req, res) {
  return criarPagamentoEfi(req, res, 'cartao');
}

async function aplicarPagamentoEfiNaAssinatura(payment, assinatura) {
  const updates = buildEfiBankSubscriptionUpdates(payment, assinatura);
  if (updates.already_processed || updates.ignored) {
    return {
      ...assinatura,
      payment_provider: updates.payment_provider,
      already_processed: Boolean(updates.already_processed),
      ignored: Boolean(updates.ignored),
      outcome: updates.outcome
    };
  }

  return updateAssinaturaById(assinatura.id, updates);
}

export async function statusPagamentoEfi(req, res) {
  const paymentId = validatePaymentId(req.params.paymentId);
  const payment = await efiBankService.consultarPagamento(paymentId);
  const currentPaymentId = getPaymentId(payment) || paymentId;
  const assinatura = await findSubscriptionByProviderPayment(currentPaymentId);

  if (!assinatura || assinatura.user_id !== req.user.id) {
    throw new AppError('Pagamento nao encontrado para este usuario.', 404);
  }

  res.json({
    success: true,
    provider: 'efi',
    ...efiPaymentResponsePayload(payment, payment.payment_method_id || payment.method),
    assinatura,
    message: 'Status consultado. A assinatura sera alterada somente apos webhook valido da EFI Bank.'
  });
}

function getEfiWebhookPaymentId(req) {
  return req.body?.txid
    || req.body?.pix?.[0]?.txid
    || req.body?.data?.txid
    || req.body?.data?.id
    || req.body?.charge_id
    || req.body?.chargeId
    || req.body?.id
    || req.query?.txid
    || req.query?.id
    || null;
}

export async function webhookEfi(req, res) {
  validateEfiWebhook(req);

  const paymentId = getEfiWebhookPaymentId(req);
  const event = req.body?.evento || req.body?.event || req.body?.type || (req.body?.pix ? 'pix' : 'payment');
  console.info('[webhook:efi]', { event, payment_id: paymentId || null, outcome: paymentId ? 'received' : 'ignored_no_payment_id' });

  if (!paymentId) {
    logWebhookEvent({ provider: 'efi', event, outcome: 'ignored' });
    return res.json({ received: true, ignored: true });
  }

  const payment = await efiBankService.consultarPagamento(paymentId);
  console.info('[webhook:efi]', { event, payment_id: paymentId, status: payment?.status || null, outcome: 'consulted' });
  logWebhookEvent({ provider: 'efi', event, paymentId, status: payment?.status, outcome: 'processing' });

  const currentPaymentId = getPaymentId(payment) || paymentId;
  let assinatura = await findSubscriptionByProviderPayment(currentPaymentId);
  if (!assinatura) {
    assinatura = await findSubscriptionById(getPaymentSubscriptionId(payment));
  }

  if (!assinatura) {
    logWebhookEvent({ provider: 'efi', event, paymentId, status: payment?.status, outcome: 'ignored_no_subscription' });
    return res.json({ received: true, ignored: true });
  }

  const updatedAssinatura = await aplicarPagamentoEfiNaAssinatura(payment, assinatura);
  const outcome = updatedAssinatura.outcome || (updatedAssinatura.already_processed ? 'duplicate_ignored' : 'applied');

  logWebhookEvent({
    provider: 'efi',
    event,
    paymentId,
    status: payment?.status,
    outcome
  });
  console.info('[webhook:efi]', {
    event,
    payment_id: paymentId,
    status: payment?.status || null,
    outcome
  });

  return res.json({ received: true, event });
}
