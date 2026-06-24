import crypto from 'node:crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { PLANOS, assinaturaService } from '../services/assinaturaService.js';
import { asaasService } from '../services/asaasService.js';
import { efiBankService } from '../services/efiBankService.js';
import {
  ASAAS_PAID_STATUSES,
  EFI_BANK_PAID_STATUSES,
  PAYMENT_PLANS,
  buildAsaasPaymentAttempt,
  buildAsaasProviderRaw,
  buildAsaasSubscriptionUpdates,
  buildEfiBankPaymentAttempt,
  buildEfiBankProviderRaw,
  buildEfiBankSubscriptionUpdates,
  buildPendingPaymentAttemptUpdates,
  getRecentAsaasPendingAttempt,
  getRecentEfiBankPendingAttempt
} from '../services/paymentStatusRules.js';
import { logWebhookEvent, validateAsaasWebhook, validateEfiWebhook } from '../services/webhookSecurityService.js';
import { sanitizeText } from '../utils/validation.js';

const PENDING_PAYMENT_MESSAGE = 'Voce ja possui um pagamento pendente. Conclua ou aguarde a expiracao antes de gerar outro.';
const PROCESSING_PAYMENT_MESSAGE = 'Ja existe uma tentativa de pagamento em processamento. Aguarde alguns instantes e tente novamente.';
const EFI_BANK_LOCK_TTL_SECONDS = 120;
const ASAAS_LOCK_TTL_SECONDS = 120;
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
const ASAAS_CARD_TOP_LEVEL_FIELDS = ['plano', 'valor', 'payment', 'card', 'cartao'];
const ASAAS_CARD_PAYMENT_FIELDS = [
  'holderName',
  'holder_name',
  'nomeCartao',
  'number',
  'cardNumber',
  'numero',
  'expiryMonth',
  'expiryYear',
  'expirationMonth',
  'expirationYear',
  'expiry',
  'validade',
  'ccv',
  'cvv',
  'cpfCnpj',
  'cpf_cnpj',
  'documento',
  'cpf',
  'cnpj',
  'name',
  'nome',
  'email',
  'phone',
  'telefone',
  'mobilePhone',
  'celular',
  'postalCode',
  'cep',
  'addressNumber',
  'numeroEndereco',
  'addressComplement',
  'complemento',
  'installments',
  'parcelas'
];

function sanitizeLogId(value) {
  if (!value) return null;
  const text = String(value);
  if (text.length <= 16) return text;
  return `${text.slice(0, 8)}...${text.slice(-6)}`;
}

function validatePlanId(value, fallback = null) {
  const plano = sanitizeText(value || fallback, { field: 'Plano', required: true, max: 80 });
  const plan = PAYMENT_PLANS[plano];
  if (!plan || !PLANOS[plano]) throw new AppError('Plano invalido.');
  return { plano, plan };
}

function validatePaymentId(value) {
  return sanitizeText(value, { field: 'payment_id', required: true, max: 120, rejectDangerous: true });
}

function normalizeHistoryPaymentMethod(assinatura = {}) {
  const raw = assinatura.provider_raw || {};
  const method = raw?.attempt?.method
    || raw?.attempt?.payment_method_id
    || raw?.payment?.payment_method_id
    || raw?.payment?.payment_type_id
    || raw?.payment?.billingType
    || raw?.payment?.payment_method
    || null;
  const normalized = String(method || '').trim().toLowerCase();
  if (normalized === 'pix') return 'pix';
  if (normalized === 'boleto' || normalized === 'bank_slip') return 'boleto';
  if (normalized === 'credit_card' || normalized === 'cartao' || normalized === 'card') return 'cartao';
  return normalized || null;
}

function normalizeHistoryPayment(assinatura = {}) {
  const raw = assinatura.provider_raw || {};
  return {
    id: assinatura.provider_payment_id || raw?.attempt?.payment_id || assinatura.id,
    created_at: assinatura.created_at || null,
    paid_at: assinatura.paid_at || null,
    plano: raw?.attempt?.plano_original || assinatura.plano || null,
    payment_method: normalizeHistoryPaymentMethod(assinatura),
    provider: assinatura.payment_provider || null,
    status: assinatura.provider_status || raw?.payment?.status || assinatura.status || null,
    valor: raw?.attempt?.valor_original ?? assinatura.valor ?? null,
    link: assinatura.checkout_url || raw?.payment?.invoice_url || raw?.payment?.bank_slip_url || null
  };
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

function validateAsaasCustomerDocument(body = {}, profile = null) {
  const document = sanitizeDocument(
    body.cpfCnpj || body.cpf_cnpj || body.documento || body.cpf || body.cnpj || profile?.cpf || profile?.cnpj
  );
  if (!document) throw new AppError('Informe seu CPF ou CNPJ para gerar a cobrança.', 400);
  return document;
}

function sanitizeInstallments(value) {
  const number = Number(value ?? 1);
  if (!Number.isInteger(number) || number < 1 || number > 12) {
    throw new AppError('Parcelas invalidas.');
  }
  return number;
}

function isValidLuhn(value) {
  const digits = String(value || '').replace(/\D/g, '');
  let sum = 0;
  let shouldDouble = false;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return digits.length >= 13 && digits.length <= 19 && sum % 10 === 0;
}

function sanitizeEmail(value, field = 'E-mail') {
  const email = sanitizeText(value, { field, required: true, max: 254, rejectDangerous: true });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(`${field} invalido.`);
  return email;
}

function sanitizeRequiredDigits(value, { field, lengths }) {
  const text = sanitizeText(value, { field, required: true, max: 32, rejectDangerous: true });
  const digits = text.replace(/\D/g, '');
  if (!lengths.includes(digits.length)) throw new AppError(`${field} invalido.`);
  return digits;
}

function sanitizeCardExpiry(payment = {}) {
  const expiry = String(payment.expiry || payment.validade || '').replace(/\D/g, '');
  const month = sanitizeRequiredDigits(payment.expiryMonth || payment.expirationMonth || expiry.slice(0, 2), {
    field: 'Mes de validade',
    lengths: [1, 2]
  }).padStart(2, '0');
  let year = sanitizeRequiredDigits(payment.expiryYear || payment.expirationYear || expiry.slice(2), {
    field: 'Ano de validade',
    lengths: [2, 4]
  });
  if (year.length === 2) year = `20${year}`;

  const numericMonth = Number(month);
  const numericYear = Number(year);
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;

  if (numericMonth < 1 || numericMonth > 12) throw new AppError('Mes de validade invalido.');
  if (numericYear < currentYear || (numericYear === currentYear && numericMonth < currentMonth)) {
    throw new AppError('Cartao vencido.');
  }

  return { expiryMonth: month, expiryYear: year };
}

function validateAsaasCardPayload(body = {}, plan) {
  assertAllowedFields(body, ASAAS_CARD_TOP_LEVEL_FIELDS, 'body');
  const payment = body.payment || body.card || body.cartao;
  assertAllowedFields(payment, ASAAS_CARD_PAYMENT_FIELDS, body.payment ? 'payment' : body.card ? 'card' : 'cartao');

  if (body.valor !== undefined && Math.round(Number(body.valor) * 100) !== Math.round(Number(plan.value) * 100)) {
    throw new AppError('Valor informado nao corresponde ao plano selecionado.');
  }

  const number = sanitizeRequiredDigits(payment.number || payment.cardNumber || payment.numero, {
    field: 'Numero do cartao',
    lengths: [13, 14, 15, 16, 17, 18, 19]
  });
  if (!isValidLuhn(number)) throw new AppError('Numero do cartao invalido.');

  const { expiryMonth, expiryYear } = sanitizeCardExpiry(payment);
  const holderName = sanitizeText(payment.holderName || payment.holder_name || payment.nomeCartao, {
    field: 'Nome impresso no cartao',
    required: true,
    max: 120,
    rejectDangerous: true
  });
  const ccv = sanitizeRequiredDigits(payment.ccv || payment.cvv, { field: 'CVV', lengths: [3, 4] });
  const cpfCnpj = sanitizeDocument(payment.cpfCnpj || payment.cpf_cnpj || payment.documento || payment.cpf || payment.cnpj);
  if (!cpfCnpj) throw new AppError('CPF/CNPJ do titular invalido.');

  const phone = sanitizeRequiredDigits(payment.phone || payment.telefone, { field: 'Telefone do titular', lengths: [10, 11] });
  const mobilePhone = payment.mobilePhone || payment.celular
    ? sanitizeRequiredDigits(payment.mobilePhone || payment.celular, { field: 'Celular do titular', lengths: [10, 11] })
    : null;
  const postalCode = sanitizeRequiredDigits(payment.postalCode || payment.cep, { field: 'CEP', lengths: [8] });
  const addressNumber = sanitizeText(payment.addressNumber || payment.numeroEndereco, {
    field: 'Numero do endereco',
    required: true,
    max: 20,
    rejectDangerous: true
  });

  return {
    card: {
      holderName,
      number,
      expiryMonth,
      expiryYear,
      ccv
    },
    holderInfo: {
      name: sanitizeText(payment.name || payment.nome || holderName, {
        field: 'Nome do titular',
        required: true,
        max: 120,
        rejectDangerous: true
      }),
      email: sanitizeEmail(payment.email),
      cpfCnpj,
      postalCode,
      addressNumber,
      addressComplement: sanitizeText(payment.addressComplement || payment.complemento, {
        field: 'Complemento',
        required: false,
        max: 80,
        rejectDangerous: true
      }),
      phone,
      mobilePhone
    },
    installments: sanitizeInstallments(payment.installments || payment.parcelas)
  };
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

async function findSubscriptionByProviderPayment(provider, paymentId) {
  if (!provider || !paymentId) return null;

  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .select('*')
    .eq('payment_provider', provider)
    .eq('provider_payment_id', String(paymentId))
    .maybeSingle();

  if (error) throw new AppError('Erro ao buscar assinatura por pagamento.', 500, error.message);
  return data || null;
}

async function findSubscriptionByProviderSubscription(provider, subscriptionId) {
  if (!provider || !subscriptionId) return null;

  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .select('*')
    .eq('payment_provider', provider)
    .eq('provider_subscription_id', String(subscriptionId))
    .maybeSingle();

  if (error) throw new AppError('Erro ao buscar assinatura por assinatura do processador.', 500, error.message);
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

async function acquireAsaasAttemptLock(userId, plan) {
  const { data, error } = await supabaseAdmin.rpc('acquire_payment_attempt_lock', {
    p_user_id: userId,
    p_provider: 'asaas',
    p_plano: plan.id,
    p_ttl_seconds: ASAAS_LOCK_TTL_SECONDS
  });

  if (error) throw new AppError('Erro ao reservar tentativa de pagamento.', 500, error.message);
  const lock = Array.isArray(data) ? data[0] : data;
  return {
    acquired: Boolean(lock?.acquired),
    lockId: lock?.lock_id || null,
    expiresAt: lock?.expires_at || null
  };
}

async function releaseAsaasAttemptLock(lockId) {
  if (!lockId) return false;
  const { data, error } = await supabaseAdmin.rpc('release_payment_attempt_lock', {
    p_lock_id: lockId
  });
  if (error) throw new AppError('Erro ao liberar tentativa de pagamento.', 500, error.message);
  return Boolean(data);
}

async function handleAsaasLockDenied(userId, plan) {
  const assinatura = await getLatestSubscription(userId);
  const pendingAttempt = getRecentAsaasPendingAttempt(assinatura, plan);
  if (pendingAttempt?.method === 'pix') {
    const reusablePix = pendingAsaasPixResponsePayload(pendingAttempt);
    if (reusablePix) return reusablePix;
  }

  throw new AppError(PROCESSING_PAYMENT_MESSAGE, 409);
}

async function revalidateAsaasAttemptAfterLock(userId, plan, { allowReusablePix = false } = {}) {
  const assinatura = await ensureUserSubscription(userId, plan.id);
  const pendingAttempt = getRecentAsaasPendingAttempt(assinatura, plan);
  if (!pendingAttempt) return { assinatura, reusable: null };

  if (allowReusablePix && pendingAttempt.method === 'pix') {
    const reusable = pendingAsaasPixResponsePayload(pendingAttempt);
    if (reusable) return { assinatura, reusable };
  }

  throw new AppError(PENDING_PAYMENT_MESSAGE, 409);
}

function assertNoRecentPendingAsaasAttempt(assinatura, plan, { allowReusablePix = false } = {}) {
  const pendingAttempt = getRecentAsaasPendingAttempt(assinatura, plan);
  if (!pendingAttempt) return null;

  if (allowReusablePix && pendingAttempt.method === 'pix') {
    const reusablePix = pendingAsaasPixResponsePayload(pendingAttempt);
    if (reusablePix) return reusablePix;
  }

  throw new AppError(PENDING_PAYMENT_MESSAGE, 409);
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
  if (payment?.value !== undefined) return Number(payment.value);
  if (payment?.valor?.original !== undefined) return Number(payment.valor.original);
  if (payment?.total !== undefined) return Number(payment.total) / 100;
  return null;
}

function normalizeAsaasPixData(qrCode) {
  if (!qrCode) return { qr_code: null, qr_code_base64: null };
  return {
    qr_code: qrCode.payload || qrCode.qr_code || null,
    qr_code_base64: qrCode.encodedImage || qrCode.encoded_image || qrCode.qr_code_base64 || null
  };
}

function getAsaasPaymentMethod(payment, fallback = null) {
  return String(payment?.billingType || payment?.payment_method_id || fallback || '').toLowerCase();
}

function getAsaasPaymentPlan(payment) {
  const reference = String(payment?.externalReference || '');
  if (reference.includes(':')) return reference.split(':')[2] || null;
  return payment?.metadata?.plano || null;
}

function asaasPaymentResponsePayload(payment, fallbackPaymentMethodId = null, pixQrCode = null) {
  const method = getAsaasPaymentMethod(payment, fallbackPaymentMethodId);
  const pix = normalizeAsaasPixData(pixQrCode);

  return {
    payment_id: payment?.id ? String(payment.id) : null,
    payment_status: payment?.status || null,
    status: payment?.status || null,
    payment_method_id: method,
    payment_type_id: method,
    valor: getPaymentAmount(payment),
    plano: getAsaasPaymentPlan(payment),
    invoice_url: payment?.invoiceUrl || null,
    bank_slip_url: payment?.bankSlipUrl || payment?.invoiceUrl || null,
    digitable_line: payment?.identificationField || payment?.digitableLine || null,
    due_date: payment?.dueDate || null,
    pix,
    qr_code: pix.qr_code,
    qr_code_base64: pix.qr_code_base64,
    copia_e_cola: pix.qr_code
  };
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

function pendingAsaasPixResponsePayload(pendingAttempt) {
  const payment = pendingAttempt?.payment || null;
  const pixQrCode = pendingAttempt?.pixQrCode || null;
  if (!payment) return null;

  const payload = asaasPaymentResponsePayload(payment, 'pix', pixQrCode);
  if (!payload.qr_code) return null;

  return {
    success: true,
    provider: 'asaas',
    reused: true,
    ...payload,
    expires_at: pendingAttempt.expires_at,
    message: 'Pix pendente encontrado. Utilize o pagamento ja gerado.'
  };
}

async function registerAsaasPaymentAttempt(assinatura, plan, customer, payment, { method = null, pixQrCode = null } = {}) {
  const attempt = buildAsaasPaymentAttempt({
    plan,
    payment,
    method
  });

  const updates = buildPendingPaymentAttemptUpdates({
    assinatura,
    providerUpdates: {
      plano: plan.id,
      valor: plan.value,
      tipo_cobranca: plan.tipo_cobranca,
      payment_provider: 'asaas',
      provider_payment_id: payment?.id ? String(payment.id) : null,
      provider_customer_id: customer?.id || assinatura.provider_customer_id || null,
      provider_subscription_id: payment?.subscription || assinatura.provider_subscription_id || null,
      provider_status: payment?.status || 'PENDING',
      provider_raw: buildAsaasProviderRaw({ payment: payment || null, attempt, pixQrCode }),
      checkout_url: payment?.invoiceUrl || payment?.bankSlipUrl || null,
      renovacao_automatica: false
    }
  });

  return updateAssinaturaById(assinatura.id, updates);
}

function logAsaasPaymentCreated({ method, payment, plan, assinatura }) {
  console.info('[asaas:payment]', {
    action: `create_${method}`,
    provider: 'asaas',
    method,
    payment_id: sanitizeLogId(payment?.id),
    status: payment?.status || null,
    plan: plan?.id || null,
    assinatura_id: assinatura?.id || null,
    outcome: 'created'
  });
}

function getRequestIp(req) {
  const forwardedFor = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwardedFor || req.ip || req.socket?.remoteAddress || '127.0.0.1';
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

function logEfiPaymentCreated({ method, payment, plan, assinatura, idempotencyKey }) {
  console.info('[efi:payment]', {
    action: `create_${method}`,
    provider: 'efi',
    method,
    payment_id: sanitizeLogId(getPaymentId(payment)),
    txid: sanitizeLogId(payment?.txid),
    charge_id: sanitizeLogId(payment?.charge_id || payment?.chargeId),
    status: payment?.status || null,
    plan: plan?.id || null,
    assinatura_id: assinatura?.id || null,
    idempotency_key: sanitizeLogId(idempotencyKey),
    outcome: 'created'
  });
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
    logEfiPaymentCreated({ method, payment, plan, assinatura: updatedAssinatura, idempotencyKey });
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

async function criarPagamentoAsaas(req, res, method) {
  const { plano, plan } = validatePlanId(req.body?.plano);
  if (!req.user?.email) throw new AppError('Usuario autenticado sem e-mail cadastrado.', 400);
  const cardPayload = method === 'cartao' ? validateAsaasCardPayload(req.body || {}, plan) : null;

  const profile = await getProfile(req.user.id);
  const cpfCnpj = cardPayload?.holderInfo?.cpfCnpj || validateAsaasCustomerDocument(req.body, profile);
  const assinatura = await ensureUserSubscription(req.user.id, plano);
  const reusable = assertNoRecentPendingAsaasAttempt(assinatura, plan, { allowReusablePix: method === 'pix' });
  if (reusable) return res.status(200).json(reusable);

  let attemptLock = null;
  let paymentCreated = false;
  let shouldReleaseLock = false;

  try {
    attemptLock = await acquireAsaasAttemptLock(req.user.id, plan);
    if (!attemptLock.acquired) {
      const lockedReusable = await handleAsaasLockDenied(req.user.id, plan);
      if (lockedReusable) return res.status(200).json(lockedReusable);
    }
    shouldReleaseLock = true;

    const { assinatura: lockedAssinatura, reusable: lockedReusable } = await revalidateAsaasAttemptAfterLock(req.user.id, plan, {
      allowReusablePix: method === 'pix'
    });
    if (lockedReusable) return res.status(200).json(lockedReusable);

    const customer = await asaasService.criarOuBuscarCliente({
      user: req.user,
      profile,
      cpfCnpj,
      existingCustomerId: lockedAssinatura.payment_provider === 'asaas' ? lockedAssinatura.provider_customer_id : null
    });
    const payment = method === 'cartao'
      ? await asaasService.criarCobrancaCartao({
        customerId: customer.id,
        plan,
        externalReference: `${req.user.id}:${lockedAssinatura.id}:${plan.id}`,
        card: cardPayload.card,
        holderInfo: cardPayload.holderInfo,
        installments: cardPayload.installments,
        remoteIp: getRequestIp(req)
      })
      : await asaasService.criarCobranca({
        customerId: customer.id,
        plan,
        method,
        externalReference: `${req.user.id}:${lockedAssinatura.id}:${plan.id}`
      });
    paymentCreated = true;
    shouldReleaseLock = false;

    let pixQrCode = null;
    if (method === 'pix' && payment?.id) {
      pixQrCode = await asaasService.obterPixQrCode(payment.id);
    }

    let updatedAssinatura = await registerAsaasPaymentAttempt(lockedAssinatura, plan, customer, payment, {
      method,
      pixQrCode
    });
    if (method === 'cartao' && ASAAS_PAID_STATUSES.includes(String(payment?.status || '').trim().toLowerCase())) {
      updatedAssinatura = await aplicarPagamentoAsaasNaAssinatura(payment, updatedAssinatura);
    }
    logAsaasPaymentCreated({ method, payment, plan, assinatura: updatedAssinatura });
    shouldReleaseLock = true;

    return res.status(201).json({
      success: true,
      provider: 'asaas',
      ...asaasPaymentResponsePayload(payment, method, pixQrCode),
      assinatura: updatedAssinatura,
      message: method === 'pix'
        ? 'Pix gerado com sucesso'
        : method === 'cartao'
          ? 'Pagamento com cartao enviado ao Asaas'
          : 'Boleto gerado com sucesso'
    });
  } catch (error) {
    if (attemptLock?.acquired && attemptLock.lockId && !paymentCreated) {
      await releaseAsaasAttemptLock(attemptLock.lockId);
      shouldReleaseLock = false;
    }
    throw error;
  } finally {
    if (attemptLock?.acquired && attemptLock.lockId && shouldReleaseLock) {
      await releaseAsaasAttemptLock(attemptLock.lockId);
    }
  }
}

export async function criarPixAsaas(req, res) {
  return criarPagamentoAsaas(req, res, 'pix');
}

export async function criarBoletoAsaas(req, res) {
  return criarPagamentoAsaas(req, res, 'boleto');
}

export async function criarCartaoAsaas(req, res) {
  return criarPagamentoAsaas(req, res, 'cartao');
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

async function aplicarPagamentoAsaasNaAssinatura(payment, assinatura, event = null) {
  const updates = buildAsaasSubscriptionUpdates(payment, assinatura, new Date(), event);
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

export async function statusPagamentoAsaas(req, res) {
  const paymentId = validatePaymentId(req.params.paymentId);
  const payment = await asaasService.consultarPagamento(paymentId);
  const currentPaymentId = payment?.id || paymentId;
  const assinatura = await findSubscriptionByProviderPayment('asaas', currentPaymentId);

  if (!assinatura || assinatura.user_id !== req.user.id) {
    throw new AppError('Pagamento nao encontrado para este usuario.', 404);
  }

  let pixQrCode = null;
  if (asaasService.normalizeBillingType(payment.billingType) === 'PIX' && ['PENDING', 'AWAITING_RISK_ANALYSIS'].includes(String(payment.status || '').toUpperCase())) {
    pixQrCode = await asaasService.obterPixQrCode(payment.id);
  }

  res.json({
    success: true,
    provider: 'asaas',
    ...asaasPaymentResponsePayload(payment, payment.billingType, pixQrCode),
    assinatura,
    message: 'Status consultado. A assinatura sera alterada somente apos webhook valido do Asaas.'
  });
}

export async function statusPagamentoEfi(req, res) {
  const paymentId = validatePaymentId(req.params.paymentId);
  const payment = await efiBankService.consultarPagamento(paymentId);
  const currentPaymentId = getPaymentId(payment) || paymentId;
  const assinatura = await findSubscriptionByProviderPayment('efi', currentPaymentId);

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

export async function historicoPagamentos(req, res) {
  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .select('id,created_at,paid_at,plano,valor,status,payment_provider,provider_payment_id,provider_status,provider_raw,checkout_url')
    .eq('user_id', req.user.id)
    .not('provider_payment_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) throw new AppError('Erro ao consultar historico de pagamentos.', 500, error.message);

  res.json({
    success: true,
    payments: (data || []).map(normalizeHistoryPayment)
  });
}

function getNestedFirst(value, paths) {
  for (const path of paths) {
    const found = path.reduce((current, key) => current?.[key], value);
    if (found) return found;
  }
  return null;
}

function getEfiWebhookInfo(req) {
  const pixTxid = req.body?.txid
    || req.body?.pix?.[0]?.txid
    || req.body?.data?.txid
    || req.query?.txid
    || null;
  if (pixTxid) {
    return {
      event: req.body?.evento || req.body?.event || req.body?.type || 'pix',
      method: 'pix',
      lookupType: 'txid',
      lookupId: pixTxid,
      txid: pixTxid
    };
  }

  const notification = req.body?.notification
    || req.body?.notification_token
    || req.body?.notificacao
    || req.query?.notification
    || req.query?.notification_token
    || null;
  if (notification) {
    return {
      event: req.body?.evento || req.body?.event || req.body?.type || 'notification',
      method: 'cobranca',
      lookupType: 'notification',
      lookupId: notification,
      notification: sanitizeLogId(notification)
    };
  }

  const chargeId = req.body?.charge_id
    || req.body?.chargeId
    || req.body?.id
    || req.query?.charge_id
    || req.query?.id
    || getNestedFirst(req.body, [
      ['data', 'charge_id'],
      ['data', 'id'],
      ['identifiers', 'charge_id'],
      ['data', 'identifiers', 'charge_id']
    ]);

  return {
    event: req.body?.evento || req.body?.event || req.body?.type || 'payment',
    method: 'cobranca',
    lookupType: chargeId ? 'charge_id' : null,
    lookupId: chargeId || null,
    charge_id: chargeId || null
  };
}

async function consultarPagamentoPorWebhook(info) {
  if (info.lookupType === 'notification') return efiBankService.consultarNotificacao(info.lookupId);
  return efiBankService.consultarPagamento(info.lookupId);
}

export async function webhookEfi(req, res) {
  validateEfiWebhook(req);

  const info = getEfiWebhookInfo(req);
  console.info('[webhook:efi]', {
    event: info.event,
    method: info.method,
    lookup_type: info.lookupType,
    payment_id: sanitizeLogId(info.lookupId),
    txid: sanitizeLogId(info.txid),
    charge_id: sanitizeLogId(info.charge_id),
    outcome: info.lookupId ? 'received' : 'ignored_no_payment_id'
  });

  if (!info.lookupId) {
    logWebhookEvent({ provider: 'efi', event: info.event, outcome: 'ignored_no_payment_id' });
    return res.json({ received: true, ignored: true });
  }

  const payment = await consultarPagamentoPorWebhook(info);
  const consultedPaymentId = getPaymentId(payment) || info.lookupId;
  console.info('[webhook:efi]', {
    event: info.event,
    method: payment?.payment_method_id || payment?.method || info.method,
    lookup_type: info.lookupType,
    payment_id: sanitizeLogId(consultedPaymentId),
    status: payment?.status || null,
    outcome: 'consulted'
  });
  logWebhookEvent({ provider: 'efi', event: info.event, paymentId: consultedPaymentId, status: payment?.status, outcome: 'processing' });

  const currentPaymentId = getPaymentId(payment) || info.lookupId;
  let assinatura = await findSubscriptionByProviderPayment('efi', currentPaymentId);
  if (!assinatura) {
    assinatura = await findSubscriptionById(getPaymentSubscriptionId(payment));
  }

  if (!assinatura) {
    console.info('[webhook:efi]', {
      event: info.event,
      payment_id: sanitizeLogId(currentPaymentId),
      status: payment?.status || null,
      outcome: 'ignored_no_subscription'
    });
    logWebhookEvent({ provider: 'efi', event: info.event, paymentId: currentPaymentId, status: payment?.status, outcome: 'ignored_no_subscription' });
    return res.json({ received: true, ignored: true });
  }

  const updatedAssinatura = await aplicarPagamentoEfiNaAssinatura(payment, assinatura);
  const activated = updatedAssinatura.status === 'ativo' && updatedAssinatura.bloqueado === false;
  const outcome = updatedAssinatura.outcome
    || (updatedAssinatura.already_processed ? 'duplicate_ignored' : activated ? 'subscription_activated' : 'not_activated');
  const reason = updatedAssinatura.outcome || (activated ? null : `payment_status_${String(payment?.status || 'unknown').toLowerCase()}`);

  logWebhookEvent({
    provider: 'efi',
    event: info.event,
    paymentId: currentPaymentId,
    status: payment?.status,
    outcome
  });
  console.info('[webhook:efi]', {
    event: info.event,
    method: payment?.payment_method_id || payment?.method || info.method,
    payment_id: sanitizeLogId(currentPaymentId),
    assinatura_id: assinatura.id,
    status: payment?.status || null,
    assinatura_status: updatedAssinatura.status || assinatura.status || null,
    bloqueado: updatedAssinatura.bloqueado ?? assinatura.bloqueado ?? null,
    outcome,
    reason
  });

  return res.json({ received: true, event: info.event });
}

export async function webhookAsaas(req, res) {
  validateAsaasWebhook(req);

  const event = req.body?.event || null;
  const webhookPayment = req.body?.payment || null;
  const paymentId = webhookPayment?.id || req.body?.id || null;

  console.info('[webhook:asaas]', {
    event,
    payment_id: sanitizeLogId(paymentId),
    outcome: paymentId ? 'received' : 'ignored_no_payment_id'
  });

  if (!paymentId) {
    logWebhookEvent({ provider: 'asaas', event, outcome: 'ignored_no_payment_id' });
    return res.json({ received: true, ignored: true });
  }

  const payment = await asaasService.consultarPagamento(paymentId);
  console.info('[webhook:asaas]', {
    event,
    payment_id: sanitizeLogId(payment?.id || paymentId),
    status: payment?.status || null,
    outcome: 'consulted'
  });
  logWebhookEvent({ provider: 'asaas', event, paymentId: payment?.id || paymentId, subscriptionId: payment?.subscription || null, status: payment?.status, outcome: 'processing' });

  let assinatura = await findSubscriptionByProviderPayment('asaas', payment?.id || paymentId);
  if (!assinatura && payment?.subscription) {
    assinatura = await findSubscriptionByProviderSubscription('asaas', payment.subscription);
  }
  if (!assinatura && payment?.externalReference) {
    const reference = String(payment.externalReference);
    const assinaturaId = reference.includes(':') ? reference.split(':')[1] : reference;
    assinatura = await findSubscriptionById(assinaturaId);
  }

  if (!assinatura) {
    console.info('[webhook:asaas]', {
      event,
      payment_id: sanitizeLogId(payment?.id || paymentId),
      status: payment?.status || null,
      outcome: 'ignored_no_subscription'
    });
    logWebhookEvent({ provider: 'asaas', event, paymentId: payment?.id || paymentId, subscriptionId: payment?.subscription || null, status: payment?.status, outcome: 'ignored_no_subscription' });
    return res.json({ received: true, ignored: true });
  }

  const updatedAssinatura = await aplicarPagamentoAsaasNaAssinatura(payment, assinatura, event);
  const activated = updatedAssinatura.status === 'ativo' && updatedAssinatura.bloqueado === false;
  const outcome = updatedAssinatura.outcome
    || (updatedAssinatura.already_processed ? 'duplicate_ignored' : activated ? 'subscription_activated' : 'not_activated');
  const reason = updatedAssinatura.outcome || (activated ? null : `payment_status_${String(payment?.status || 'unknown').toLowerCase()}`);

  logWebhookEvent({
    provider: 'asaas',
    event,
    paymentId: payment?.id || paymentId,
    subscriptionId: payment?.subscription || assinatura.provider_subscription_id || null,
    status: payment?.status,
    outcome
  });
  console.info('[webhook:asaas]', {
    event,
    payment_id: sanitizeLogId(payment?.id || paymentId),
    assinatura_id: assinatura.id,
    status: payment?.status || null,
    assinatura_status: updatedAssinatura.status || assinatura.status || null,
    bloqueado: updatedAssinatura.bloqueado ?? assinatura.bloqueado ?? null,
    outcome,
    reason
  });

  return res.json({ received: true, event });
}
