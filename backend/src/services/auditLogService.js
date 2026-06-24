import { supabaseAdmin } from '../config/supabase.js';

const SENSITIVE_KEYS = new Set([
  'authorization',
  'access_token',
  'refresh_token',
  'token',
  'password',
  'senha',
  'secret',
  'api_key',
  'apikey',
  'asaas_api_key',
  'supabase_service_role_key',
  'provider_raw',
  'cpf',
  'cnpj',
  'cpfcnpj',
  'cpf_cnpj',
  'documento',
  'card',
  'creditcard',
  'credit_card',
  'creditcardnumber',
  'cardnumber',
  'number',
  'numero',
  'cvv',
  'ccv',
  'cvc',
  'expiry',
  'expiration',
  'expirationmonth',
  'expirationyear',
  'expirymonth',
  'expiryyear',
  'validade'
]);

function normalizeKey(key) {
  return String(key || '').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
}

function isSensitiveKey(key) {
  return SENSITIVE_KEYS.has(normalizeKey(key));
}

function sanitizeScalar(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/\b\d{13,19}\b/g, '[redacted-card]')
    .replace(/\b\d{11}\b/g, '[redacted-document]')
    .replace(/\b\d{14}\b/g, '[redacted-document]');
}

export function sanitizeAuditMetadata(value, depth = 0) {
  if (value == null) return null;
  if (depth > 5) return '[truncated]';
  if (['string', 'number', 'boolean'].includes(typeof value)) return sanitizeScalar(value);
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => sanitizeAuditMetadata(item, depth + 1));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !isSensitiveKey(key))
        .map(([key, item]) => [key, sanitizeAuditMetadata(item, depth + 1)])
    );
  }

  return null;
}

function getRequestIp(req) {
  const forwardedFor = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwardedFor || req?.ip || req?.socket?.remoteAddress || null;
}

function getUserAgent(req) {
  const userAgent = req?.headers?.['user-agent'];
  return userAgent ? String(userAgent).slice(0, 500) : null;
}

export async function recordAuditLog({
  req = null,
  userId = null,
  actorUserId = null,
  action,
  entityType = null,
  entityId = null,
  metadata = null,
  ipAddress = null,
  userAgent = null
}) {
  if (!action) return null;

  const payload = {
    user_id: userId || null,
    actor_user_id: actorUserId || userId || null,
    action: String(action).slice(0, 120),
    entity_type: entityType ? String(entityType).slice(0, 80) : null,
    entity_id: entityId ? String(entityId).slice(0, 160) : null,
    metadata: sanitizeAuditMetadata(metadata || {}),
    ip_address: ipAddress || getRequestIp(req),
    user_agent: userAgent || getUserAgent(req)
  };

  const { data, error } = await supabaseAdmin
    .from('audit_logs')
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function safelyRecordAuditLog(params) {
  try {
    return await recordAuditLog(params);
  } catch (error) {
    console.warn('[audit]', {
      outcome: 'failed',
      action: params?.action || null,
      message: error?.message || 'unknown_error'
    });
    return null;
  }
}
