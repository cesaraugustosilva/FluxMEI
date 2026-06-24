import { supabaseAdmin } from '../config/supabase.js';
import { PLANOS } from './assinaturaRules.js';
import { emailService } from './emailService.js';

const APP_URL = `${(process.env.FRONTEND_URL || 'https://fluxmei.com.br').replace(/\/$/, '')}/app/`;

function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return '--';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function planLabel(planId) {
  return PLANOS[planId]?.nome || (planId === 'gratuito' ? 'Teste gratis' : 'Plano FluxMEI');
}

function methodLabel(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('pix')) return 'Pix';
  if (normalized.includes('boleto') || normalized.includes('bank_slip')) return 'Boleto';
  if (normalized.includes('cartao') || normalized.includes('credit')) return 'Cartao';
  return value || '--';
}

function getPaymentMethod(payment = {}, assinatura = {}) {
  const raw = assinatura.provider_raw || {};
  return raw?.attempt?.method || raw?.attempt?.billingType || payment.billingType || payment.method || payment.payment_method_id || null;
}

async function getUserEmail(userId) {
  if (!userId) return null;
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error) {
    console.error('[notification]', { type: 'user_email_lookup', outcome: 'failed' });
    return null;
  }
  return data?.user?.email || null;
}

async function insertNotificationEvent({ userId, type, eventKey, provider, metadata }) {
  const { data, error } = await supabaseAdmin
    .from('notification_events')
    .insert({
      user_id: userId,
      type,
      event_key: eventKey,
      provider: provider || 'email',
      metadata: metadata || {}
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return { duplicate: true };
    console.error('[notification]', { type, outcome: 'dedupe_failed' });
    return { error };
  }

  return { event: data };
}

async function markNotificationSent(id, result) {
  if (!id) return;
  await supabaseAdmin
    .from('notification_events')
    .update({
      status: result?.sent ? 'sent' : (result?.skipped ? 'skipped' : 'failed'),
      sent_at: result?.sent ? new Date().toISOString() : null,
      metadata: {
        provider_message_id: result?.id || null,
        skip_reason: result?.reason || null,
        error: result?.error || null
      }
    })
    .eq('id', id);
}

function template(type, context = {}) {
  const plan = planLabel(context.plano);
  const value = formatBRL(context.valor);
  const method = methodLabel(context.metodo);
  const date = formatDate(context.data);
  const due = formatDate(context.data_vencimento);

  const templates = {
    payment_confirmed: {
      subject: 'Pagamento confirmado - FluxMEI',
      title: 'Pagamento confirmado',
      body: [`Plano: ${plan}.`, `Valor: ${value}. Metodo: ${method}. Data: ${date}.`, 'Seu acesso ao FluxMEI foi liberado com sucesso.'],
      ctaLabel: 'Acessar FluxMEI'
    },
    subscription_created: {
      subject: 'Bem-vindo ao FluxMEI Pro',
      title: 'Bem-vindo ao FluxMEI Pro',
      body: [`Sua assinatura ${plan} esta ativa.`, 'Agora voce pode usar todos os recursos do FluxMEI Pro.'],
      ctaLabel: 'Acessar FluxMEI'
    },
    subscription_expires_7_days: {
      subject: 'Sua assinatura vence em breve',
      title: 'Sua assinatura vence em breve',
      body: [`Seu plano ${plan} vence em ${context.dias} dias, em ${due}.`, 'Renove para evitar interrupcoes no acesso.'],
      ctaLabel: 'Renovar agora'
    },
    subscription_expires_3_days: {
      subject: 'Últimos dias para renovar sua assinatura',
      title: 'Ultimos dias para renovar sua assinatura',
      body: [`Seu plano ${plan} vence em ${context.dias} dias, em ${due}.`, 'Regularize a renovacao para continuar usando o FluxMEI sem pausa.'],
      ctaLabel: 'Renovar agora'
    },
    subscription_expired: {
      subject: 'Seu acesso foi pausado',
      title: 'Seu acesso foi pausado',
      body: ['Seu periodo de acesso terminou.', 'Escolha um plano para reativar o FluxMEI.'],
      ctaLabel: 'Escolher plano'
    },
    payment_pending: {
      subject: 'Estamos aguardando a confirmação do seu pagamento',
      title: 'Pagamento aguardando confirmacao',
      body: [`Plano: ${plan}.`, `Valor: ${value}. Metodo: ${method}. Data: ${date}.`, 'Assim que o pagamento for confirmado, seu acesso sera liberado automaticamente.'],
      ctaLabel: 'Acessar FluxMEI'
    },
    cancellation_scheduled: {
      subject: 'Recebemos sua solicitação de cancelamento',
      title: 'Cancelamento agendado',
      body: [`Sua assinatura sera encerrada em ${due}.`, 'Voce continuara com acesso ate o fim do periodo ja pago.'],
      ctaLabel: 'Ver assinatura'
    },
    subscription_reactivated: {
      subject: 'Assinatura reativada com sucesso',
      title: 'Assinatura reativada com sucesso',
      body: [`Sua assinatura ${plan} foi reativada.`, 'O FluxMEI continua liberado para sua conta.'],
      ctaLabel: 'Acessar FluxMEI'
    }
  };

  return templates[type];
}

export async function notifyByEmail({ userId, type, eventKey, context = {} }) {
  const tpl = template(type, context);
  if (!tpl || !userId || !eventKey) return { skipped: true, reason: 'invalid_notification' };

  const dedupe = await insertNotificationEvent({
    userId,
    type,
    eventKey,
    provider: 'email',
    metadata: { type, event_key: eventKey }
  });
  if (dedupe.duplicate) return { skipped: true, duplicate: true };
  if (dedupe.error) return { skipped: true, reason: 'dedupe_failed' };

  const to = context.email || await getUserEmail(userId);
  const html = emailService.buildHtml({
    title: tpl.title,
    preheader: tpl.subject,
    body: tpl.body,
    ctaLabel: tpl.ctaLabel,
    ctaUrl: context.ctaUrl || APP_URL
  });
  const text = [tpl.title, ...tpl.body, context.ctaUrl || APP_URL].join('\n\n');
  const result = await emailService.sendEmail({ to, subject: tpl.subject, html, text });
  await markNotificationSent(dedupe.event?.id, result);
  return result;
}

export async function notifyPaymentConfirmed({ assinatura, payment }) {
  const paymentId = payment?.id || assinatura?.provider_payment_id || assinatura?.id;
  return notifyByEmail({
    userId: assinatura?.user_id,
    type: 'payment_confirmed',
    eventKey: `${assinatura?.payment_provider || 'provider'}:${paymentId}`,
    context: {
      plano: assinatura?.plano,
      valor: assinatura?.valor,
      metodo: getPaymentMethod(payment, assinatura),
      data: assinatura?.paid_at || new Date().toISOString()
    }
  });
}

export async function notifySubscriptionCreated({ assinatura }) {
  return notifyByEmail({
    userId: assinatura?.user_id,
    type: 'subscription_created',
    eventKey: `${assinatura?.id}:${assinatura?.plano}`,
    context: {
      plano: assinatura?.plano,
      valor: assinatura?.valor
    }
  });
}

export async function notifyPaymentPending({ assinatura, payment, method }) {
  const paymentId = payment?.id || assinatura?.provider_payment_id || assinatura?.id;
  return notifyByEmail({
    userId: assinatura?.user_id,
    type: 'payment_pending',
    eventKey: `${assinatura?.payment_provider || 'provider'}:${paymentId}`,
    context: {
      plano: assinatura?.plano,
      valor: assinatura?.valor,
      metodo: method || getPaymentMethod(payment, assinatura),
      data: assinatura?.created_at || new Date().toISOString()
    }
  });
}

export async function notifyCancellationScheduled({ assinatura }) {
  return notifyByEmail({
    userId: assinatura?.user_id,
    type: 'cancellation_scheduled',
    eventKey: `${assinatura?.id}:${assinatura?.cancelled_at || assinatura?.data_vencimento}`,
    context: {
      plano: assinatura?.plano,
      data_vencimento: assinatura?.data_vencimento
    }
  });
}

export async function notifySubscriptionReactivated({ assinatura }) {
  return notifyByEmail({
    userId: assinatura?.user_id,
    type: 'subscription_reactivated',
    eventKey: `${assinatura?.id}:${assinatura?.reactivated_at || 'reactivated'}`,
    context: {
      plano: assinatura?.plano,
      data_vencimento: assinatura?.data_vencimento
    }
  });
}

export async function notifySubscriptionLifecycle(status, userId) {
  const dias = Number(status?.dias_restantes || 0);
  const estado = status?.estado || status?.status;
  if (estado === 'ativo' && dias === 7) {
    return notifyByEmail({
      userId,
      type: 'subscription_expires_7_days',
      eventKey: `${status?.plano}:${status?.data_vencimento}:7`,
      context: { plano: status?.plano, dias, data_vencimento: status?.data_vencimento }
    });
  }
  if (estado === 'ativo' && dias === 3) {
    return notifyByEmail({
      userId,
      type: 'subscription_expires_3_days',
      eventKey: `${status?.plano}:${status?.data_vencimento}:3`,
      context: { plano: status?.plano, dias, data_vencimento: status?.data_vencimento }
    });
  }
  if (['expirado', 'vencido', 'bloqueado'].includes(estado)) {
    return notifyByEmail({
      userId,
      type: 'subscription_expired',
      eventKey: `${status?.plano}:${status?.data_vencimento}:expired`,
      context: { plano: status?.plano, data_vencimento: status?.data_vencimento }
    });
  }
  return { skipped: true, reason: 'no_lifecycle_event' };
}

export async function safelyNotify(fn, ...args) {
  try {
    return await fn(...args);
  } catch (error) {
    console.error('[notification]', { outcome: 'failed', message: error?.message || 'notification_failed' });
    return { sent: false, error: 'notification_failed' };
  }
}

export const notificationService = {
  notifyByEmail,
  notifyPaymentConfirmed,
  notifySubscriptionCreated,
  notifyPaymentPending,
  notifyCancellationScheduled,
  notifySubscriptionReactivated,
  notifySubscriptionLifecycle,
  safelyNotify
};
