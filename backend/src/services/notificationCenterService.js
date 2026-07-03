import { supabaseAdmin } from '../config/supabase.js';

const TYPES = new Set(['subscription', 'payment', 'import', 'goal', 'ai', 'security', 'system']);
const SEVERITIES = new Set(['info', 'success', 'warning', 'danger']);
const DEFAULT_DEDUPE_WINDOW_MS = 6 * 60 * 60 * 1000;
const APP_ACTIONS = {
  account: '/app/#minha-conta',
  imports: '/app/#movimentacoes',
  goals: '/app/#metas',
  ai: '/app/#fluxia'
};
const SENSITIVE_KEY_PATTERN = /(token|secret|password|senha|card|cartao|cpf|cnpj|document|cvv|cvc|provider_raw)/i;
const DOCUMENT_PATTERN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const CARD_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g;

function truncate(value, max = 280) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function sanitizeString(value) {
  return truncate(value, 500)
    .replace(DOCUMENT_PATTERN, '[documento]')
    .replace(CARD_PATTERN, '[cartao]');
}

export function sanitizeMetadata(value, depth = 0) {
  if (value == null || depth > 4) return {};
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeMetadata(item, depth + 1));
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value !== 'object') return {};

  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SENSITIVE_KEY_PATTERN.test(key))
    .map(([key, item]) => [truncate(key, 60), sanitizeMetadata(item, depth + 1)]));
}

function normalizePayload(payload = {}) {
  const type = TYPES.has(payload.type) ? payload.type : 'system';
  const severity = SEVERITIES.has(payload.severity) ? payload.severity : 'info';
  return {
    type,
    severity,
    title: truncate(payload.title, 120),
    message: truncate(payload.message, 500),
    action_label: payload.action_label ? truncate(payload.action_label, 60) : null,
    action_url: payload.action_url ? truncate(payload.action_url, 180) : null,
    metadata: sanitizeMetadata({
      ...(payload.metadata || {}),
      dedupe_key: payload.dedupe_key || null
    })
  };
}

function dedupeKeyFor(notification) {
  return [
    notification.type,
    notification.title,
    notification.message,
    notification.action_url || ''
  ].join('|').toLowerCase();
}

export async function createNotification(userId, payload = {}) {
  if (!userId) return { skipped: true, reason: 'missing_user' };

  const notification = normalizePayload(payload);
  if (!notification.title || !notification.message) {
    return { skipped: true, reason: 'invalid_notification' };
  }

  const since = new Date(Date.now() - Number(payload.dedupeWindowMs || DEFAULT_DEDUPE_WINDOW_MS)).toISOString();
  const dedupeKey = payload.dedupe_key || dedupeKeyFor(notification);
  const { data: duplicate, error: duplicateError } = await supabaseAdmin
    .from('notifications')
    .select('id,created_at')
    .eq('user_id', userId)
    .eq('type', notification.type)
    .eq('title', notification.title)
    .eq('message', notification.message)
    .gte('created_at', since)
    .limit(1)
    .maybeSingle();

  if (duplicateError) throw duplicateError;
  if (duplicate) return { skipped: true, duplicate: true, notification: duplicate };

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .insert({
      user_id: userId,
      ...notification,
      metadata: { ...notification.metadata, dedupe_key: dedupeKey }
    })
    .select('id,user_id,type,title,message,severity,action_label,action_url,read_at,metadata,created_at')
    .single();

  if (error) throw error;
  return { notification: data };
}

export async function safelyCreateNotification(fn, ...args) {
  try {
    return await fn(...args);
  } catch (error) {
    console.error('[notification-center]', { outcome: 'failed', message: error?.message || 'notification_failed' });
    return { skipped: true, error: 'notification_failed' };
  }
}

export async function listNotifications(userId, { limit = 60 } = {}) {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('id,type,title,message,severity,action_label,action_url,read_at,metadata,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 60, 1), 100));

  if (error) throw error;
  return data || [];
}

export async function getUnreadCount(userId) {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) throw error;
  return (data || []).length;
}

export async function markNotificationRead(id, userId) {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select('id,type,title,message,severity,action_label,action_url,read_at,metadata,created_at')
    .single();

  if (error) throw error;
  return data;
}

export async function markAllNotificationsRead(userId) {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null)
    .select('id');

  if (error) throw error;
  return { updated_count: (data || []).length };
}

export function createPaymentConfirmedNotification({ assinatura = {}, payment = {} } = {}) {
  return createNotification(assinatura.user_id, {
    type: 'payment',
    severity: 'success',
    title: 'Pagamento confirmado',
    message: 'Seu pagamento foi confirmado e o acesso ao FluxMEI esta ativo.',
    action_label: 'Ver assinatura',
    action_url: APP_ACTIONS.account,
    dedupe_key: `payment:confirmed:${payment.id || assinatura.provider_payment_id || assinatura.id}`,
    metadata: {
      assinatura_id: assinatura.id,
      payment_id: payment.id || assinatura.provider_payment_id || null,
      plano: assinatura.plano
    }
  });
}

export function createPaymentPendingNotification({ assinatura = {}, payment = {}, method } = {}) {
  return createNotification(assinatura.user_id, {
    type: 'payment',
    severity: 'warning',
    title: 'Pagamento pendente',
    message: 'Estamos aguardando a confirmacao do seu pagamento.',
    action_label: 'Ver assinatura',
    action_url: APP_ACTIONS.account,
    dedupe_key: `payment:pending:${payment.id || assinatura.provider_payment_id || assinatura.id}`,
    metadata: {
      assinatura_id: assinatura.id,
      payment_id: payment.id || assinatura.provider_payment_id || null,
      plano: assinatura.plano,
      metodo: method || null
    }
  });
}

export function createSubscriptionNotification(userId, status = {}, kind = 'status') {
  const templates = {
    expiring: {
      severity: 'warning',
      title: 'Assinatura vencendo',
      message: `Sua assinatura vence em ${Number(status.dias_restantes || 0)} dias.`
    },
    expired: {
      severity: 'danger',
      title: 'Assinatura vencida',
      message: 'Seu periodo de acesso terminou. Regularize para continuar usando o FluxMEI.'
    },
    cancelled: {
      severity: 'warning',
      title: 'Assinatura cancelada',
      message: 'Sua assinatura foi marcada para cancelamento.'
    },
    reactivated: {
      severity: 'success',
      title: 'Assinatura reativada',
      message: 'Sua assinatura foi reativada com sucesso.'
    },
    status: {
      severity: 'info',
      title: 'Atualizacao da assinatura',
      message: 'Ha uma atualizacao importante sobre sua assinatura.'
    }
  };
  const template = templates[kind] || templates.status;
  return createNotification(userId, {
    type: 'subscription',
    ...template,
    action_label: 'Ver assinatura',
    action_url: APP_ACTIONS.account,
    dedupe_key: `subscription:${kind}:${status.plano || ''}:${status.data_vencimento || ''}`,
    metadata: {
      plano: status.plano,
      data_vencimento: status.data_vencimento,
      dias_restantes: status.dias_restantes
    }
  });
}

export function createImportCompletedNotification(userId, result = {}) {
  return createNotification(userId, {
    type: 'import',
    severity: 'success',
    title: 'Importacao concluida',
    message: `${Number(result.imported_count || 0)} movimentacoes importadas de ${result.bank_name || 'extrato bancario'}.`,
    action_label: 'Revisar importacao',
    action_url: `${APP_ACTIONS.imports}`,
    dedupe_key: `import:completed:${result.import?.id || result.import_id || result.filename || Date.now()}`,
    metadata: {
      import_id: result.import?.id || result.import_id,
      bank_name: result.bank_name,
      imported_count: result.imported_count,
      skipped_count: result.skipped_count
    }
  });
}

export function createImportDuplicateNotification(userId, result = {}) {
  return createNotification(userId, {
    type: 'import',
    severity: 'warning',
    title: 'Duplicatas encontradas',
    message: `${Number(result.skipped_count || 0)} linhas foram ignoradas por possivel duplicidade.`,
    action_label: 'Ver importacao',
    action_url: APP_ACTIONS.imports,
    dedupe_key: `import:duplicates:${result.import?.id || result.import_id || result.filename || Date.now()}`,
    metadata: {
      import_id: result.import?.id || result.import_id,
      skipped_count: result.skipped_count,
      bank_name: result.bank_name
    }
  });
}

export function createGoalNotification(userId, goal = {}, kind = 'near') {
  const completed = kind === 'completed';
  return createNotification(userId, {
    type: 'goal',
    severity: completed ? 'success' : 'info',
    title: completed ? 'Meta concluida' : 'Meta proxima',
    message: completed ? 'Uma meta financeira foi concluida.' : 'Voce esta perto de concluir uma meta financeira.',
    action_label: 'Ver metas',
    action_url: APP_ACTIONS.goals,
    dedupe_key: `goal:${kind}:${goal.id || goal.nome || ''}`,
    metadata: {
      goal_id: goal.id,
      nome: goal.nome,
      progresso: goal.progresso
    }
  });
}

export async function createForecastAlertNotifications(userId, forecast = {}) {
  const results = [];
  const score = Number(forecast.financial_score?.score ?? forecast.financial_score?.value ?? 0);
  if (score > 0 && score < 40) {
    results.push(await createNotification(userId, {
      type: 'ai',
      severity: 'danger',
      title: 'Score financeiro critico',
      message: 'A FluxIA identificou um score financeiro critico neste periodo.',
      action_label: 'Ver previsoes',
      action_url: APP_ACTIONS.ai,
      dedupe_key: `ai:score-critical:${forecast.period?.month || ''}:${forecast.period?.year || ''}`,
      metadata: { score, classification: forecast.financial_score?.classification }
    }));
  }

  const unusual = Array.isArray(forecast.unusual_expenses) ? forecast.unusual_expenses : [];
  if (unusual.length) {
    results.push(await createNotification(userId, {
      type: 'ai',
      severity: 'warning',
      title: 'Gasto incomum detectado',
      message: 'A FluxIA encontrou despesas fora do padrao recente.',
      action_label: 'Ver analise',
      action_url: APP_ACTIONS.ai,
      dedupe_key: `ai:unusual-expenses:${forecast.period?.month || ''}:${forecast.period?.year || ''}`,
      metadata: { count: unusual.length }
    }));
  }

  return results;
}

export const notificationCenterService = {
  createNotification,
  safelyCreateNotification,
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  createPaymentConfirmedNotification,
  createPaymentPendingNotification,
  createSubscriptionNotification,
  createImportCompletedNotification,
  createImportDuplicateNotification,
  createGoalNotification,
  createForecastAlertNotifications
};
