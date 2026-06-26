import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { sanitizeAuditMetadata, safelyRecordAuditLog } from '../services/auditLogService.js';
import { PLANOS } from '../services/assinaturaRules.js';

const PAID_STATUSES = new Set(['received', 'confirmed', 'received_in_cash', 'paid', 'pago', 'concluida', 'settled']);
const PENDING_STATUSES = new Set(['pending', 'awaiting_risk_analysis', 'pendente', 'ativa', 'waiting', 'new', 'processing', 'em_processamento']);
const BACKUP_SENSITIVE_KEYS = new Set([
  'provider_raw',
  'cpf',
  'cnpj',
  'cpfcnpj',
  'cpf_cnpj',
  'documento',
  'card',
  'creditcard',
  'credit_card',
  'cardnumber',
  'number',
  'numero',
  'cvv',
  'ccv',
  'cvc',
  'token',
  'secret',
  'password',
  'senha',
  'api_key',
  'apikey',
  'authorization',
  'access_token',
  'refresh_token'
]);

function lower(value) {
  return String(value || '').trim().toLowerCase();
}

function isPaidStatus(status) {
  return PAID_STATUSES.has(lower(status));
}

function isPendingStatus(status) {
  return PENDING_STATUSES.has(lower(status));
}

function normalizePaymentMethod(assinatura = {}) {
  const raw = assinatura.provider_raw || {};
  const method = raw?.attempt?.method
    || raw?.attempt?.payment_method_id
    || raw?.payment?.payment_method_id
    || raw?.payment?.payment_type_id
    || raw?.payment?.billingType
    || raw?.payment?.payment_method
    || null;
  const normalized = lower(method);

  if (normalized === 'pix') return 'pix';
  if (normalized === 'boleto' || normalized === 'bank_slip') return 'boleto';
  if (normalized === 'credit_card' || normalized === 'cartao' || normalized === 'card') return 'cartao';
  return normalized || null;
}

function normalizeProvider(assinatura = {}) {
  return lower(assinatura.payment_provider) || null;
}

function getPlanPrice(planId, fallback = 0) {
  return Number(PLANOS[planId]?.preco ?? fallback ?? 0);
}

function getPlanBillingType(planId, fallback = '') {
  return PLANOS[planId]?.tipo_cobranca || fallback || null;
}

function getPaymentStatus(assinatura = {}) {
  return assinatura.provider_status || assinatura.status || null;
}

function getPaymentValue(assinatura = {}) {
  const raw = assinatura.provider_raw || {};
  return Number(raw?.attempt?.valor_original ?? assinatura.valor ?? getPlanPrice(assinatura.plano, 0));
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function todayFileDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeBackupKey(key) {
  return String(key || '').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
}

function sanitizeBackupScalar(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/\b\d{13,19}\b/g, '[redacted-card]')
    .replace(/\b\d{11}\b/g, '[redacted-document]')
    .replace(/\b\d{14}\b/g, '[redacted-document]');
}

function sanitizeBackupValue(value, depth = 0) {
  if (value == null) return null;
  if (depth > 5) return '[truncated]';
  if (['string', 'number', 'boolean'].includes(typeof value)) return sanitizeBackupScalar(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => sanitizeBackupValue(item, depth + 1));

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !BACKUP_SENSITIVE_KEYS.has(normalizeBackupKey(key)))
        .map(([key, item]) => [key, sanitizeBackupValue(item, depth + 1)])
    );
  }

  return null;
}

function sanitizeBackupRows(rows = []) {
  return (rows || []).map((row) => sanitizeBackupValue(row));
}

function normalizeName(profile, authUser) {
  return profile?.nome
    || profile?.nome_negocio
    || authUser?.user_metadata?.nome
    || authUser?.email?.split('@')[0]
    || 'Usuario FluxMEI';
}

async function listAllAuthUsers() {
  const users = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw new AppError('Erro ao consultar usuarios.', 500, error.message);

    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }

  return users;
}

async function fetchProfiles() {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id,nome,nome_negocio,created_at,is_admin,onboarding_completed,onboarding_step')
    .order('created_at', { ascending: false });

  if (error) throw new AppError('Erro ao consultar perfis.', 500, error.message);
  return data || [];
}

async function fetchSubscriptions() {
  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .select('id,user_id,plano,status,valor,tipo_cobranca,data_inicio,data_vencimento,created_at,paid_at,bloqueado,payment_provider,provider_payment_id,provider_status,provider_raw,cancel_at_period_end,cancelled_at')
    .order('created_at', { ascending: false });

  if (error) throw new AppError('Erro ao consultar assinaturas.', 500, error.message);
  return data || [];
}

async function fetchAuditLogs() {
  const { data, error } = await supabaseAdmin
    .from('audit_logs')
    .select('id,user_id,actor_user_id,action,entity_type,entity_id,metadata,ip_address,user_agent,created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw new AppError('Erro ao consultar auditoria.', 500, error.message);
  return data || [];
}

async function fetchBackupRows(table, select, { order = 'created_at', limit = null, optional = false } = {}) {
  let query = supabaseAdmin
    .from(table)
    .select(select);

  if (order) query = query.order(order, { ascending: false });
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) {
    if (optional) return [];
    throw new AppError(`Erro ao consultar ${table} para backup.`, 500, error.message);
  }
  return data || [];
}

async function fetchReferralMetricsRows() {
  const { data, error } = await supabaseAdmin
    .from('referrals')
    .select('status')
    .order('created_at', { ascending: false });

  if (error) throw new AppError('Erro ao consultar indicacoes.', 500, error.message);
  return data || [];
}

async function fetchAiMetricsRows() {
  try {
    const { data, error } = await supabaseAdmin
      .from('ai_messages')
      .select('user_id,role,content,created_at')
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

function buildDirectories(users, profiles, subscriptions) {
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const usersById = new Map(users.map((user) => [user.id, user]));
  const latestSubscriptionByUser = new Map();

  for (const assinatura of subscriptions) {
    if (!latestSubscriptionByUser.has(assinatura.user_id)) {
      latestSubscriptionByUser.set(assinatura.user_id, assinatura);
    }
  }

  return { profilesById, usersById, latestSubscriptionByUser };
}

function serializeUser(user, profile, assinatura) {
  return {
    id: user.id,
    nome: normalizeName(profile, user),
    email: user.email || null,
    plano: assinatura?.plano || 'gratuito',
    status: assinatura?.status || 'sem_assinatura',
    created_at: profile?.created_at || user.created_at || null
  };
}

function serializeSubscription(assinatura, user, profile) {
  return {
    id: assinatura.id,
    user_id: assinatura.user_id,
    user_name: normalizeName(profile, user),
    user_email: user?.email || null,
    plano: assinatura.plano || null,
    status: assinatura.status || null,
    data_vencimento: assinatura.data_vencimento || null,
    cancel_at_period_end: Boolean(assinatura.cancel_at_period_end),
    cancelled_at: assinatura.cancelled_at || null
  };
}

function serializePayment(assinatura, user, profile) {
  return {
    id: assinatura.provider_payment_id || assinatura.id,
    subscription_id: assinatura.id,
    user_id: assinatura.user_id,
    user_name: normalizeName(profile, user),
    user_email: user?.email || null,
    method: normalizePaymentMethod(assinatura),
    valor: getPaymentValue(assinatura),
    status: getPaymentStatus(assinatura),
    date: assinatura.paid_at || assinatura.created_at || null,
    provider: normalizeProvider(assinatura),
    plano: assinatura.plano || null
  };
}

function serializeBackupProfile(profile = {}) {
  return sanitizeBackupValue({
    id: profile.id,
    nome: profile.nome || null,
    nome_negocio: profile.nome_negocio || null,
    ramo: profile.ramo || null,
    tipo_negocio: profile.tipo_negocio || null,
    is_admin: Boolean(profile.is_admin),
    referral_code: profile.referral_code || null,
    onboarding_completed: Boolean(profile.onboarding_completed),
    onboarding_step: Number(profile.onboarding_step || 0),
    created_at: profile.created_at || null,
    updated_at: profile.updated_at || null
  });
}

function serializeBackupSubscription(assinatura = {}) {
  return sanitizeBackupValue({
    id: assinatura.id,
    user_id: assinatura.user_id,
    plano: assinatura.plano || null,
    status: assinatura.status || null,
    valor: roundMoney(assinatura.valor),
    tipo_cobranca: assinatura.tipo_cobranca || null,
    data_inicio: assinatura.data_inicio || null,
    data_vencimento: assinatura.data_vencimento || null,
    data_trial_fim: assinatura.data_trial_fim || null,
    bloqueado: Boolean(assinatura.bloqueado),
    payment_provider: assinatura.payment_provider || null,
    provider_payment_id: assinatura.provider_payment_id || null,
    provider_status: assinatura.provider_status || null,
    paid_at: assinatura.paid_at || null,
    checkout_url: assinatura.checkout_url || null,
    cancel_at_period_end: Boolean(assinatura.cancel_at_period_end),
    cancelled_at: assinatura.cancelled_at || null,
    reactivated_at: assinatura.reactivated_at || null,
    created_at: assinatura.created_at || null,
    updated_at: assinatura.updated_at || null
  });
}

function serializeBackupMovement(movement = {}) {
  return sanitizeBackupValue({
    id: movement.id,
    user_id: movement.user_id,
    tipo: movement.tipo || null,
    descricao: movement.descricao || null,
    valor: roundMoney(movement.valor),
    categoria: movement.categoria || null,
    forma_pagamento: movement.forma_pagamento || null,
    observacao: movement.observacao || null,
    data: movement.data || null,
    created_at: movement.created_at || null,
    updated_at: movement.updated_at || null
  });
}

function serializeBackupAuditLog(log = {}) {
  return sanitizeBackupValue({
    id: log.id,
    user_id: log.user_id || null,
    actor_user_id: log.actor_user_id || null,
    action: log.action,
    entity_type: log.entity_type || null,
    entity_id: log.entity_id || null,
    metadata: sanitizeAuditMetadata(log.metadata || {}),
    created_at: log.created_at
  });
}

function serializeAuditLog(log, usersById, profilesById) {
  const user = usersById.get(log.user_id) || usersById.get(log.actor_user_id);
  const profile = profilesById.get(log.user_id) || profilesById.get(log.actor_user_id);

  return {
    id: log.id,
    user_id: log.user_id || null,
    actor_user_id: log.actor_user_id || null,
    user_name: user || profile ? normalizeName(profile, user) : null,
    user_email: user?.email || null,
    action: log.action,
    entity_type: log.entity_type || null,
    entity_id: log.entity_id || null,
    metadata: log.metadata || {},
    ip_address: log.ip_address || null,
    user_agent: log.user_agent || null,
    created_at: log.created_at
  };
}

function buildFrequentAiQuestions(aiMessages = []) {
  const counts = new Map();
  for (const message of aiMessages) {
    const question = String(message.content || '').trim().slice(0, 120);
    if (!question) continue;
    counts.set(question, (counts.get(question) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([question, count]) => ({ question, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function buildMetrics(users, subscriptions, referrals = [], profiles = [], aiMessages = []) {
  const paidPayments = subscriptions.filter((assinatura) => assinatura.provider_payment_id && isPaidStatus(getPaymentStatus(assinatura)));
  const activeSubscriptions = subscriptions.filter((assinatura) => assinatura.status === 'ativo' && !assinatura.bloqueado);
  const monthlyActive = activeSubscriptions.filter((assinatura) => getPlanBillingType(assinatura.plano, assinatura.tipo_cobranca) === 'mensal' && assinatura.plano !== 'gratuito');
  const annualActive = activeSubscriptions.filter((assinatura) => getPlanBillingType(assinatura.plano, assinatura.tipo_cobranca) === 'anual');
  const mrr = monthlyActive.reduce((sum, assinatura) => sum + getPlanPrice(assinatura.plano, assinatura.valor), 0);
  const annualRevenueProjection = annualActive.reduce((sum, assinatura) => sum + getPlanPrice(assinatura.plano, assinatura.valor), 0);

  return {
    usuarios_cadastrados: users.length,
    trials_ativos: subscriptions.filter((assinatura) => assinatura.status === 'teste_gratis' && !assinatura.bloqueado).length,
    assinaturas_ativas: activeSubscriptions.length,
    assinaturas_canceladas: subscriptions.filter((assinatura) => assinatura.status === 'cancelado' || assinatura.cancel_at_period_end).length,
    pagamentos_pendentes: subscriptions.filter((assinatura) => assinatura.provider_payment_id && isPendingStatus(getPaymentStatus(assinatura))).length,
    indicacoes_pendentes: referrals.filter((referral) => referral.status === 'pending').length,
    indicacoes_convertidas: referrals.filter((referral) => referral.status === 'converted').length,
    indicacoes_recompensadas: referrals.filter((referral) => referral.status === 'rewarded').length,
    onboarding_concluidos: profiles.filter((profile) => profile.onboarding_completed === true).length,
    onboarding_pendentes: profiles.filter((profile) => profile.onboarding_completed !== true).length,
    total_consultas_ia: aiMessages.length,
    usuarios_ia: new Set(aiMessages.map((message) => message.user_id).filter(Boolean)).size,
    perguntas_frequentes_ia: buildFrequentAiQuestions(aiMessages),
    receita_total: roundMoney(paidPayments.reduce((sum, assinatura) => sum + getPaymentValue(assinatura), 0)),
    mrr: roundMoney(mrr),
    arr: roundMoney((mrr * 12) + annualRevenueProjection)
  };
}

async function getAdminData() {
  const [users, profiles, subscriptions] = await Promise.all([
    listAllAuthUsers(),
    fetchProfiles(),
    fetchSubscriptions()
  ]);

  return {
    users,
    profiles,
    subscriptions,
    directories: buildDirectories(users, profiles, subscriptions)
  };
}

export async function adminDashboard(req, res) {
  const [{ users, subscriptions, profiles }, referrals, aiMessages] = await Promise.all([
    getAdminData(),
    fetchReferralMetricsRows(),
    fetchAiMetricsRows()
  ]);

  res.json({
    success: true,
    metrics: buildMetrics(users, subscriptions, referrals, profiles, aiMessages)
  });
}

export async function adminUsers(req, res) {
  const { users, directories } = await getAdminData();
  const { profilesById, latestSubscriptionByUser } = directories;

  res.json({
    success: true,
    users: users.map((user) => serializeUser(user, profilesById.get(user.id), latestSubscriptionByUser.get(user.id)))
  });
}

export async function adminSubscriptions(req, res) {
  const { subscriptions, directories } = await getAdminData();
  const { profilesById, usersById } = directories;

  res.json({
    success: true,
    subscriptions: subscriptions.map((assinatura) => serializeSubscription(
      assinatura,
      usersById.get(assinatura.user_id),
      profilesById.get(assinatura.user_id)
    ))
  });
}

export async function adminPayments(req, res) {
  const { subscriptions, directories } = await getAdminData();
  const { profilesById, usersById } = directories;

  const payments = subscriptions
    .filter((assinatura) => assinatura.provider_payment_id)
    .map((assinatura) => serializePayment(
      assinatura,
      usersById.get(assinatura.user_id),
      profilesById.get(assinatura.user_id)
    ));

  res.json({
    success: true,
    payments
  });
}

export async function adminAuditLogs(req, res) {
  const [users, profiles, logs] = await Promise.all([
    listAllAuthUsers(),
    fetchProfiles(),
    fetchAuditLogs()
  ]);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));

  res.json({
    success: true,
    logs: logs.map((log) => serializeAuditLog(log, usersById, profilesById))
  });
}

export async function adminBackup(req, res) {
  const [
    profiles,
    subscriptions,
    movements,
    goals,
    coupons,
    referrals,
    auditLogs
  ] = await Promise.all([
    fetchBackupRows('profiles', 'id,nome,nome_negocio,ramo,tipo_negocio,is_admin,referral_code,onboarding_completed,onboarding_step,created_at,updated_at'),
    fetchBackupRows('assinaturas', 'id,user_id,plano,status,valor,tipo_cobranca,data_inicio,data_vencimento,data_trial_fim,bloqueado,payment_provider,provider_payment_id,provider_status,paid_at,checkout_url,cancel_at_period_end,cancelled_at,reactivated_at,created_at,updated_at'),
    fetchBackupRows('movimentacoes', 'id,user_id,tipo,descricao,valor,categoria,forma_pagamento,observacao,data,created_at,updated_at'),
    fetchBackupRows('metas', '*', { optional: true }),
    fetchBackupRows('coupons', 'id,code,description,discount_type,discount_value,max_uses,current_uses,active,valid_from,valid_until,created_at'),
    fetchBackupRows('referrals', 'id,referrer_user_id,referred_user_id,referral_code,status,reward_days,rewarded_at,created_at'),
    fetchBackupRows('audit_logs', 'id,user_id,actor_user_id,action,entity_type,entity_id,metadata,created_at', { limit: 100 })
  ]);

  const payments = subscriptions
    .filter((assinatura) => assinatura.provider_payment_id)
    .map((assinatura) => sanitizeBackupValue({
      id: assinatura.provider_payment_id,
      subscription_id: assinatura.id,
      user_id: assinatura.user_id,
      plano: assinatura.plano || null,
      method: normalizePaymentMethod(assinatura),
      valor: getPaymentValue(assinatura),
      status: getPaymentStatus(assinatura),
      provider: normalizeProvider(assinatura),
      paid_at: assinatura.paid_at || null,
      created_at: assinatura.created_at || null
    }));

  const backup = {
    success: true,
    generated_at: new Date().toISOString(),
    generated_by: req.user?.id || null,
    version: 1,
    data: {
      profiles: profiles.map(serializeBackupProfile),
      assinaturas: subscriptions.map(serializeBackupSubscription),
      pagamentos: payments,
      movimentacoes: movements.map(serializeBackupMovement),
      metas: sanitizeBackupRows(goals),
      cupons: sanitizeBackupRows(coupons),
      referrals: sanitizeBackupRows(referrals),
      audit_logs: auditLogs.map(serializeBackupAuditLog)
    }
  };

  await safelyRecordAuditLog({
    req,
    userId: req.user?.id,
    actorUserId: req.user?.id,
    action: 'admin.backup.generated',
    entityType: 'admin_backup',
    entityId: todayFileDate(),
    metadata: {
      profiles: backup.data.profiles.length,
      assinaturas: backup.data.assinaturas.length,
      pagamentos: backup.data.pagamentos.length,
      movimentacoes: backup.data.movimentacoes.length,
      cupons: backup.data.cupons.length,
      referrals: backup.data.referrals.length,
      audit_logs: backup.data.audit_logs.length
    }
  });

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="fluxmei-backup-${todayFileDate()}.json"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(JSON.stringify(backup, null, 2));
}

export const adminBackupTestUtils = {
  sanitizeBackupValue,
  serializeBackupProfile,
  serializeBackupSubscription,
  serializeBackupMovement,
  serializeBackupAuditLog
};
