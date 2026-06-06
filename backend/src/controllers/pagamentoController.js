import crypto from 'node:crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { PLANOS, assinaturaService } from '../services/assinaturaService.js';
import { mercadoPagoService } from '../services/mercadoPagoService.js';

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
    success: `${baseUrl}/app/payment/index.html?status=success`,
    failure: `${baseUrl}/app/payment/index.html?status=failure`,
    pending: `${baseUrl}/app/payment/index.html?status=pending`
  };
}

function getNotificationUrl() {
  if (process.env.MERCADO_PAGO_NOTIFICATION_URL) {
    return process.env.MERCADO_PAGO_NOTIFICATION_URL;
  }

  const publicUrl = (process.env.PUBLIC_URL || process.env.APP_PUBLIC_URL || '').replace(/\/$/, '');
  return publicUrl ? `${publicUrl}/api/webhooks/mercado-pago` : null;
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

async function ensureUserSubscription(userId) {
  return await getLatestSubscription(userId) || await assinaturaService.createTrialSubscription(userId);
}

function getCheckoutUrl(preference) {
  if (process.env.MERCADO_PAGO_USE_SANDBOX === 'true') {
    return preference?.sandbox_init_point || preference?.init_point || null;
  }

  return preference?.init_point || preference?.sandbox_init_point || null;
}

export async function criarCheckoutMercadoPago(req, res) {
  const plano = req.body?.plano;
  const plan = PAYMENT_PLANS[plano];
  if (!plan || !PLANOS[plano]) throw new AppError('Plano invalido.');

  const profile = await getProfile(req.user.id);
  const assinatura = await ensureUserSubscription(req.user.id);

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

async function aplicarPagamentoNaAssinatura(payment, assinatura) {
  const planConfig = PAYMENT_PLANS[assinatura.plano] || PAYMENT_PLANS.pro_mensal;
  const status = payment.status;
  const updates = {
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
  const leftBuffer = Buffer.from(left || '', 'hex');
  const rightBuffer = Buffer.from(right || '', 'hex');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function validateMercadoPagoSignature(req, dataId) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!secret) return;

  const signature = req.headers['x-signature'];
  const requestId = req.headers['x-request-id'];
  const { ts, v1 } = getSignatureParts(signature);

  if (!dataId || !requestId || !ts || !v1) {
    throw new AppError('Webhook Mercado Pago sem assinatura valida.', 401);
  }

  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  if (!timingSafeEqualHex(expected, v1)) {
    throw new AppError('Webhook Mercado Pago nao autorizado.', 401);
  }
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
  validateMercadoPagoSignature(req, paymentId);

  if (!paymentId || !isPaymentNotification(req)) {
    return res.json({ received: true, ignored: true });
  }

  const payment = await mercadoPagoService.consultarPagamento(paymentId);
  const assinatura = await findSubscriptionFromPayment(payment);
  if (!assinatura) return res.json({ received: true, ignored: true });

  await aplicarPagamentoNaAssinatura(payment, assinatura);
  res.json({ received: true });
}
