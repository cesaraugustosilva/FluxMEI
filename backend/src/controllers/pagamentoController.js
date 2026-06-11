import crypto from 'node:crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { PLANOS, assinaturaService } from '../services/assinaturaService.js';
import { asaasService } from '../services/asaasService.js';
import { mercadoPagoService } from '../services/mercadoPagoService.js';
import { logWebhookEvent, validateAsaasWebhook, validateMercadoPagoWebhook } from '../services/webhookSecurityService.js';

const PAYMENT_PLANS = {
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

function todayPlusDays(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getRequestBaseUrl(req) {
  const host = req.get('host');
  if (!host) return null;
  return `${req.protocol}://${host}`;
}

function getFrontendBaseUrl(req) {
  const configuredUrl = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((url) => url.trim().replace(/\/$/, ''))
    .find(Boolean);

  return configuredUrl || getRequestBaseUrl(req);
}

function getBackUrls(req) {
  const baseUrl = getFrontendBaseUrl(req);
  if (!baseUrl) return null;

  return {
    success: `${baseUrl}/checkout/?status=success`,
    failure: `${baseUrl}/checkout/?status=failure`,
    pending: `${baseUrl}/checkout/?status=pending`
  };
}

function getNotificationUrl() {
  if (process.env.MERCADO_PAGO_NOTIFICATION_URL) {
    return process.env.MERCADO_PAGO_NOTIFICATION_URL;
  }

  const publicUrl = (process.env.PUBLIC_URL || process.env.APP_PUBLIC_URL || '').replace(/\/$/, '');
  return publicUrl ? `${publicUrl}/api/webhooks/mercado-pago` : null;
}

function getMercadoPagoPublicKey() {
  const publicKey = process.env.MERCADO_PAGO_PUBLIC_KEY;
  if (!publicKey) throw new AppError('MERCADO_PAGO_PUBLIC_KEY nao configurada.', 500);
  return publicKey;
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

async function ensureUserSubscription(userId, planId) {
  return await getLatestSubscription(userId) || await assinaturaService.createPendingSubscription(userId, planId);
}

function normalizeAsaasMethod(value = 'pix') {
  const method = String(value || '').toLowerCase();
  if (['boleto', 'pix', 'cartao'].includes(method)) return method;
  if (['card', 'credit_card', 'creditcard'].includes(method)) return 'cartao';
  return 'pix';
}

function getCheckoutUrl(preference) {
  if (process.env.MERCADO_PAGO_USE_SANDBOX === 'true') {
    return preference?.sandbox_init_point || preference?.init_point || null;
  }

  return preference?.init_point || preference?.sandbox_init_point || null;
}

function splitName(fullName = '') {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ')
  };
}

function sanitizeBrickPaymentData(formData = {}) {
  const payer = formData.payer || {};
  const payerIdentification = payer.identification || {};

  return {
    token: formData.token || null,
    payment_method_id: formData.payment_method_id || formData.paymentMethodId || null,
    issuer_id: formData.issuer_id || formData.issuer || null,
    installments: Number(formData.installments || 1),
    payer: {
      email: payer.email || formData.payer_email || formData.email || null,
      identification: {
        type: payerIdentification.type || formData.identificationType || null,
        number: mercadoPagoService.onlyDigits(payerIdentification.number || formData.identificationNumber || formData.number)
      },
      address: payer.address || undefined
    }
  };
}

function buildBrickPaymentPayload({ formData, plan, user, profile, assinatura }) {
  const ownerName = profile?.nome || user.user_metadata?.nome || user.email || '';
  const payerName = splitName(ownerName);
  const documentNumber = mercadoPagoService.onlyDigits(profile?.cpf || profile?.cnpj);
  const brickData = sanitizeBrickPaymentData(formData);

  if (!brickData.payment_method_id) throw new AppError('Meio de pagamento nao informado.');

  const payer = {
    email: user.email,
    first_name: payerName.firstName || undefined,
    last_name: payerName.lastName || undefined,
    identification: {
      type: documentNumber ? (documentNumber.length > 11 ? 'CNPJ' : 'CPF') : brickData.payer.identification.type,
      number: documentNumber || brickData.payer.identification.number
    },
    address: brickData.payer.address
  };

  const payment = {
    transaction_amount: plan.value,
    description: plan.description,
    payment_method_id: brickData.payment_method_id,
    installments: Number.isFinite(brickData.installments) && brickData.installments > 0 ? brickData.installments : 1,
    issuer_id: brickData.issuer_id || undefined,
    payer,
    external_reference: assinatura.id,
    metadata: {
      user_id: user.id,
      assinatura_id: assinatura.id,
      plano: plan.id
    },
    notification_url: getNotificationUrl() || undefined,
    statement_descriptor: 'FLUXMEI'
  };

  if (brickData.token) payment.token = brickData.token;
  if (!payment.payer.identification?.type || !payment.payer.identification?.number) {
    delete payment.payer.identification;
  }
  if (!payment.payer.address) delete payment.payer.address;
  if (!payment.notification_url) delete payment.notification_url;
  if (!payment.issuer_id) delete payment.issuer_id;

  return payment;
}

async function registerBrickPaymentAttempt(assinatura, plan, payment) {
  return updateAssinaturaById(assinatura.id, {
    plano: plan.id,
    status: 'pendente',
    valor: plan.value,
    tipo_cobranca: plan.tipo_cobranca,
    payment_provider: 'mercado_pago',
    provider_payment_id: payment?.id ? String(payment.id) : null,
    provider_status: payment?.status || 'payment_created',
    provider_raw: payment || null,
    mercado_pago_payment_id: payment?.id ? String(payment.id) : null,
    mercado_pago_status: payment?.status || 'payment_created',
    checkout_url: null,
    bloqueado: true,
    renovacao_automatica: false
  });
}

function normalizeAsaasPixData(qrCode) {
  if (!qrCode) return null;
  const payload = qrCode.payload || qrCode.qr_code || null;
  const encodedImage = qrCode.encodedImage || qrCode.encoded_image || qrCode.qr_code_base64 || null;
  const expirationDate = qrCode.expirationDate || qrCode.expiration_date || null;

  if (!payload && !encodedImage && !expirationDate) return null;

  return {
    qr_code: payload,
    qr_code_base64: encodedImage,
    expiration_date: expirationDate
  };
}

function asaasPaymentResponsePayload(payment, pixQrCode = null) {
  return {
    payment_id: payment?.id ? String(payment.id) : null,
    payment_status: payment?.status || null,
    status_detail: payment?.status || null,
    payment_method_id: String(payment?.billingType || '').toLowerCase(),
    payment_type_id: payment?.billingType || null,
    invoice_url: payment?.invoiceUrl || null,
    bank_slip_url: payment?.bankSlipUrl || null,
    due_date: payment?.dueDate || null,
    pix: normalizeAsaasPixData(pixQrCode)
  };
}

async function registerAsaasPaymentAttempt({ assinatura, plan, customer, payment, pixQrCode = null }) {
  return updateAssinaturaById(assinatura.id, {
    plano: plan.id,
    status: 'pendente',
    valor: plan.value,
    tipo_cobranca: plan.tipo_cobranca,
    payment_provider: 'asaas',
    provider_payment_id: payment?.id ? String(payment.id) : null,
    provider_customer_id: customer?.id || assinatura.provider_customer_id || null,
    provider_subscription_id: payment?.subscription || assinatura.provider_subscription_id || null,
    provider_status: payment?.status || 'CREATED',
    provider_raw: {
      payment,
      pixQrCode
    },
    checkout_url: payment?.invoiceUrl || payment?.bankSlipUrl || null,
    bloqueado: true,
    renovacao_automatica: false
  });
}

function isAsaasPaidStatus(status) {
  return ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(String(status || '').toUpperCase());
}

function isAsaasPendingStatus(status) {
  return ['PENDING', 'AWAITING_RISK_ANALYSIS'].includes(String(status || '').toUpperCase());
}

function isAsaasCancelledStatus(status) {
  return ['OVERDUE', 'CANCELLED', 'REFUNDED', 'REFUND_REQUESTED', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL'].includes(String(status || '').toUpperCase());
}

async function aplicarPagamentoAsaasNaAssinatura(payment, assinatura) {
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
    updates.data_inicio = new Date().toISOString().slice(0, 10);
    updates.data_vencimento = todayPlusDays(planConfig.dias);
    updates.renovacao_automatica = Boolean(payment?.subscription);
  } else if (isAsaasPendingStatus(status)) {
    updates.status = 'pendente';
    updates.bloqueado = true;
  } else if (isAsaasCancelledStatus(status)) {
    updates.status = 'cancelado';
    updates.bloqueado = true;
    updates.renovacao_automatica = false;
  }

  return updateAssinaturaById(assinatura.id, updates);
}

function extractPixData(payment) {
  const transactionData = payment?.point_of_interaction?.transaction_data || {};
  const qrCode = transactionData.qr_code || null;
  const qrCodeBase64 = transactionData.qr_code_base64 || null;
  const ticketUrl = transactionData.ticket_url || null;

  if (!qrCode && !qrCodeBase64 && !ticketUrl) return null;

  return {
    qr_code: qrCode,
    qr_code_base64: qrCodeBase64,
    ticket_url: ticketUrl
  };
}

function paymentResponsePayload(payment, fallbackPaymentMethodId = null) {
  const pix = extractPixData(payment);

  return {
    payment_id: payment?.id ? String(payment.id) : null,
    payment_status: payment?.status || null,
    status_detail: payment?.status_detail || null,
    payment_method_id: payment?.payment_method_id || fallbackPaymentMethodId,
    payment_type_id: payment?.payment_type_id || null,
    transaction_details: payment?.transaction_details || null,
    pix
  };
}

export async function mercadoPagoPublicConfig(req, res) {
  res.json({
    public_key: getMercadoPagoPublicKey()
  });
}

export async function criarCheckoutMercadoPago(req, res) {
  const plano = req.body?.plano;
  const plan = PAYMENT_PLANS[plano];
  if (!plan || !PLANOS[plano]) throw new AppError('Plano invalido.');

  const profile = await getProfile(req.user.id);
  const assinatura = await ensureUserSubscription(req.user.id, plano);

  const preference = await mercadoPagoService.criarPreferencia({
    plan,
    user: req.user,
    profile,
    assinatura,
    backUrls: getBackUrls(req),
    notificationUrl: getNotificationUrl()
  });

  const checkoutUrl = getCheckoutUrl(preference);
  if (!checkoutUrl) throw new AppError('Mercado Pago nao retornou URL de checkout.', 502, preference);

  await updateAssinaturaById(assinatura.id, {
    plano,
    status: 'pendente',
    valor: plan.value,
    tipo_cobranca: plan.tipo_cobranca,
    payment_provider: 'mercado_pago',
    provider_payment_id: null,
    provider_status: 'preference_created',
    provider_raw: preference || null,
    mercado_pago_preference_id: preference.id,
    mercado_pago_payment_id: null,
    mercado_pago_status: 'preference_created',
    checkout_url: checkoutUrl,
    bloqueado: true,
    renovacao_automatica: false
  });

  res.status(201).json({
    success: true,
    checkout_url: checkoutUrl,
    preference_id: preference.id,
    message: 'Pagamento criado com sucesso'
  });
}

export async function processarPagamentoBrick(req, res) {
  const plano = req.body?.plano;
  const plan = PAYMENT_PLANS[plano];
  if (!plan || !PLANOS[plano]) throw new AppError('Plano invalido.');

  const profile = await getProfile(req.user.id);
  const assinatura = await ensureUserSubscription(req.user.id, plano);
  const paymentPayload = buildBrickPaymentPayload({
    formData: req.body?.payment || req.body?.formData || {},
    plan,
    user: req.user,
    profile,
    assinatura
  });

  const idempotencyKey = crypto.randomUUID();
  const payment = await mercadoPagoService.criarPagamento({
    payment: paymentPayload,
    idempotencyKey
  });

  await registerBrickPaymentAttempt(assinatura, plan, payment);

  res.status(201).json({
    success: true,
    ...paymentResponsePayload(payment, paymentPayload.payment_method_id),
    message: 'Pagamento enviado ao Mercado Pago'
  });
}

export async function criarCobrancaAsaas(req, res) {
  const plano = req.body?.plano || 'pro_mensal';
  const plan = PAYMENT_PLANS[plano];
  if (!plan || !PLANOS[plano]) throw new AppError('Plano invalido.');

  const method = normalizeAsaasMethod(req.body?.metodo || req.body?.method || req.body?.billingType);
  const profile = await getProfile(req.user.id);
  const assinatura = await ensureUserSubscription(req.user.id, plano);

  const customer = await asaasService.criarOuBuscarCliente({
    user: req.user,
    profile,
    existingCustomerId: assinatura.payment_provider === 'asaas' ? assinatura.provider_customer_id : null
  });

  const payment = await asaasService.criarCobranca({
    customerId: customer.id,
    plan,
    method: method === 'cartao' ? 'undefined' : method,
    externalReference: assinatura.id
  });

  let pixQrCode = null;
  if (asaasService.normalizeBillingType(method) === 'PIX') {
    pixQrCode = await asaasService.obterPixQrCode(payment.id);
  }

  await registerAsaasPaymentAttempt({ assinatura, plan, customer, payment, pixQrCode });

  res.status(201).json({
    success: true,
    provider: 'asaas',
    ...asaasPaymentResponsePayload(payment, pixQrCode),
    message: 'Cobranca criada no Asaas'
  });
}

async function aplicarPagamentoNaAssinatura(payment, assinatura) {
  const planConfig = PAYMENT_PLANS[assinatura.plano] || PAYMENT_PLANS.pro_mensal;
  const status = payment.status;
  const updates = {
    payment_provider: 'mercado_pago',
    provider_payment_id: String(payment.id),
    provider_status: status,
    provider_raw: payment,
    mercado_pago_payment_id: String(payment.id),
    mercado_pago_status: status
  };

  if (status === 'approved') {
    updates.status = 'ativo';
    updates.bloqueado = false;
    updates.data_inicio = new Date().toISOString().slice(0, 10);
    updates.data_vencimento = todayPlusDays(planConfig.dias);
    updates.renovacao_automatica = false;
  } else if (['pending', 'in_process', 'authorized'].includes(status)) {
    updates.status = 'pendente';
    updates.bloqueado = true;
  } else if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(status)) {
    updates.status = 'cancelado';
    updates.bloqueado = true;
    updates.renovacao_automatica = false;
  }

  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .update(updates)
    .eq('id', assinatura.id)
    .select()
    .single();

  if (error) throw new AppError('Erro ao atualizar assinatura pelo pagamento.', 500, error.message);
  return data;
}

export async function sincronizarRetornoMercadoPago(req, res) {
  const paymentId = req.query.payment_id || req.query.collection_id || req.body?.payment_id || req.body?.collection_id;
  if (!paymentId) throw new AppError('payment_id nao informado.');

  const payment = await mercadoPagoService.consultarPagamento(paymentId);
  const assinatura = await findSubscriptionFromPayment(payment);

  if (!assinatura || assinatura.user_id !== req.user.id) {
    throw new AppError('Pagamento nao encontrado para este usuario.', 404);
  }

  const updated = await aplicarPagamentoNaAssinatura(payment, assinatura);

  res.json({
    success: true,
    payment_status: payment.status,
    assinatura: updated
  });
}

export async function statusPagamentoMercadoPago(req, res) {
  const paymentId = req.params.paymentId || req.query.payment_id;
  if (!paymentId) throw new AppError('payment_id nao informado.');

  const payment = await mercadoPagoService.consultarPagamento(paymentId);
  const assinatura = await findSubscriptionFromPayment(payment);

  if (!assinatura || assinatura.user_id !== req.user.id) {
    throw new AppError('Pagamento nao encontrado para este usuario.', 404);
  }

  const updated = await aplicarPagamentoNaAssinatura(payment, assinatura);

  res.json({
    success: true,
    ...paymentResponsePayload(payment),
    assinatura: updated
  });
}

export async function statusPagamentoAsaas(req, res) {
  const paymentId = req.params.paymentId;
  if (!paymentId) throw new AppError('payment_id nao informado.');

  const payment = await asaasService.consultarPagamento(paymentId);
  const assinatura = await findSubscriptionByProviderPayment('asaas', payment.id);

  if (!assinatura || assinatura.user_id !== req.user.id) {
    throw new AppError('Pagamento nao encontrado para este usuario.', 404);
  }

  const updated = await aplicarPagamentoAsaasNaAssinatura(payment, assinatura);
  let pixQrCode = null;
  if (payment.billingType === 'PIX' && isAsaasPendingStatus(payment.status)) {
    pixQrCode = await asaasService.obterPixQrCode(payment.id);
  }

  res.json({
    success: true,
    provider: 'asaas',
    ...asaasPaymentResponsePayload(payment, pixQrCode),
    assinatura: updated
  });
}

async function findSubscriptionFromPayment(payment) {
  const externalReference = payment?.external_reference;
  const paymentId = payment?.id ? String(payment.id) : null;

  if (paymentId) {
    const { data, error } = await supabaseAdmin
      .from('assinaturas')
      .select('*')
      .eq('mercado_pago_payment_id', paymentId)
      .maybeSingle();
    if (error) throw new AppError('Erro ao buscar assinatura.', 500, error.message);
    if (data) return data;
  }

  if (externalReference) {
    const { data, error } = await supabaseAdmin
      .from('assinaturas')
      .select('*')
      .or(`id.eq.${externalReference},user_id.eq.${externalReference}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new AppError('Erro ao buscar assinatura.', 500, error.message);
    if (data) return data;
  }

  return null;
}

function getNotificationPaymentId(req) {
  return req.query?.['data.id']
    || req.query?.id
    || req.body?.data?.id
    || req.body?.id
    || null;
}

function isPaymentNotification(req) {
  const type = req.query?.type || req.body?.type;
  const topic = req.query?.topic || req.body?.topic;
  return !type && !topic ? true : type === 'payment' || topic === 'payment';
}

export async function webhookMercadoPago(req, res) {
  const paymentId = getNotificationPaymentId(req);
  validateMercadoPagoWebhook(req, paymentId);

  if (!paymentId || !isPaymentNotification(req)) {
    logWebhookEvent({ provider: 'mercado_pago', event: req.query?.type || req.body?.type || req.query?.topic || req.body?.topic, paymentId, outcome: 'ignored' });
    return res.json({ received: true, ignored: true });
  }

  const payment = await mercadoPagoService.consultarPagamento(paymentId);
  logWebhookEvent({ provider: 'mercado_pago', event: 'payment', paymentId, status: payment?.status, outcome: 'processing' });
  const assinatura = await findSubscriptionFromPayment(payment);
  if (!assinatura) {
    logWebhookEvent({ provider: 'mercado_pago', event: 'payment', paymentId, status: payment?.status, outcome: 'ignored_no_subscription' });
    return res.json({ received: true, ignored: true });
  }

  await aplicarPagamentoNaAssinatura(payment, assinatura);
  logWebhookEvent({ provider: 'mercado_pago', event: 'payment', paymentId, status: payment?.status, outcome: 'applied' });
  res.json({ received: true });
}

export async function webhookAsaas(req, res) {
  validateAsaasWebhook(req);

  const event = req.body?.event;
  const payment = req.body?.payment;
  if (!payment?.id) {
    logWebhookEvent({ provider: 'asaas', event, outcome: 'ignored' });
    return res.json({ received: true, ignored: true });
  }

  logWebhookEvent({ provider: 'asaas', event, paymentId: payment.id, status: payment.status, outcome: 'processing' });

  let assinatura = await findSubscriptionByProviderPayment('asaas', payment.id);

  if (!assinatura && payment.externalReference) {
    const { data, error } = await supabaseAdmin
      .from('assinaturas')
      .select('*')
      .eq('id', payment.externalReference)
      .maybeSingle();
    if (error) throw new AppError('Erro ao buscar assinatura Asaas.', 500, error.message);
    assinatura = data || null;
  }

  if (!assinatura) {
    logWebhookEvent({ provider: 'asaas', event, paymentId: payment.id, status: payment.status, outcome: 'ignored_no_subscription' });
    return res.json({ received: true, ignored: true });
  }

  await aplicarPagamentoAsaasNaAssinatura(payment, assinatura);
  logWebhookEvent({ provider: 'asaas', event, paymentId: payment.id, status: payment.status, outcome: 'applied' });
  res.json({ received: true, event });
}
