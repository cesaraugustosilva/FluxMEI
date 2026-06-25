import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { PLANOS } from '../services/assinaturaRules.js';

const PAID_STATUSES = new Set(['received', 'confirmed', 'received_in_cash', 'paid', 'pago', 'concluida', 'settled']);
const PENDING_STATUSES = new Set(['pending', 'awaiting_risk_analysis', 'pendente', 'ativa', 'waiting', 'new', 'processing', 'em_processamento']);

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
    .select('id,nome,nome_negocio,created_at,is_admin')
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

async function fetchReferralMetricsRows() {
  const { data, error } = await supabaseAdmin
    .from('referrals')
    .select('status')
    .order('created_at', { ascending: false });

  if (error) throw new AppError('Erro ao consultar indicacoes.', 500, error.message);
  return data || [];
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

function buildMetrics(users, subscriptions, referrals = []) {
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
  const [{ users, subscriptions }, referrals] = await Promise.all([
    getAdminData(),
    fetchReferralMetricsRows()
  ]);

  res.json({
    success: true,
    metrics: buildMetrics(users, subscriptions, referrals)
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
