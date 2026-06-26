'use strict';

const TOKEN_KEY = 'fluxmei_access_token';

const state = {
  metrics: null,
  users: [],
  subscriptions: [],
  payments: [],
  coupons: [],
  auditLogs: []
};

function normalizeApiUrl(url) {
  return String(url || '').replace(/\/$/, '');
}

function getApiUrl() {
  const apiUrl = normalizeApiUrl(window.FLUXMEI_CONFIG?.API_URL);
  if (!apiUrl) throw new Error('FLUXMEI_CONFIG.API_URL nao configurada.');
  return apiUrl;
}

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

function getAdminLoginUrl() {
  const url = new URL('/auth/login.html', window.location.origin);
  url.searchParams.set('redirect', '/admin/');
  return url.href;
}

function clearAuthStorage() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('fluxmei_user');
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem('fluxmei_user');
}

async function apiRequest(path, options = {}) {
  const token = getToken();
  if (!token) {
    window.location.href = getAdminLoginUrl();
    throw new Error('Faca login para continuar.');
  }

  const response = await fetch(`${getApiUrl()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  const data = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : null;

  if (response.status === 401) {
    clearAuthStorage();
    window.location.href = getAdminLoginUrl();
    throw new Error('Sessao expirada.');
  }

  if (response.status === 403) {
    showState('Acesso restrito a administradores FluxMEI.', 'error');
    throw new Error('Acesso restrito.');
  }

  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Erro ${response.status}`);
  }

  return data;
}

async function fetchAdminBlob(path) {
  const token = getToken();
  if (!token) {
    window.location.href = getAdminLoginUrl();
    throw new Error('Faca login para continuar.');
  }

  const response = await fetch(`${getApiUrl()}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (response.status === 401) {
    clearAuthStorage();
    window.location.href = getAdminLoginUrl();
    throw new Error('Sessao expirada.');
  }

  if (response.status === 403) {
    showState('Acesso restrito a administradores FluxMEI.', 'error');
    throw new Error('Acesso restrito.');
  }

  if (!response.ok) {
    const data = response.headers.get('content-type')?.includes('application/json')
      ? await response.json()
      : null;
    throw new Error(data?.message || data?.error || `Erro ${response.status}`);
  }

  return response.blob();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return '--';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  if (!year || !month || !day) return '--';
  return `${day}/${month}/${year}`;
}

function todayDownloadDate() {
  return new Date().toISOString().slice(0, 10);
}

function planLabel(planId) {
  if (planId === 'pro_anual') return 'Pro Anual';
  if (planId === 'pro_mensal') return 'Pro Mensal';
  if (planId === 'gratuito') return 'Trial';
  return planId || '--';
}

function statusMeta(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (['ativo', 'received', 'confirmed', 'paid', 'pago', 'concluida', 'settled'].includes(normalized)) {
    return { label: normalized === 'ativo' ? 'Ativo' : 'Pago', className: normalized === 'ativo' ? 'active' : 'paid' };
  }
  if (['teste_gratis'].includes(normalized)) return { label: 'Trial', className: 'info' };
  if (['pending', 'awaiting_risk_analysis', 'pendente', 'ativa', 'waiting', 'new', 'processing', 'em_processamento'].includes(normalized)) {
    return { label: 'Pendente', className: 'pending' };
  }
  if (['overdue', 'expired', 'vencido'].includes(normalized)) return { label: 'Vencido', className: 'overdue' };
  if (['refunded', 'estornado'].includes(normalized)) return { label: 'Estornado', className: 'warning' };
  if (['canceled', 'cancelled', 'deleted', 'cancelado', 'bloqueado'].includes(normalized)) return { label: 'Cancelado', className: 'canceled' };
  return { label: status || '--', className: 'info' };
}

function methodMeta(method) {
  const normalized = String(method || '').trim().toLowerCase();
  if (normalized === 'pix') return { label: 'Pix', icon: 'PIX' };
  if (normalized === 'boleto' || normalized === 'bank_slip') return { label: 'Boleto', icon: 'BOL' };
  if (normalized === 'cartao' || normalized === 'credit_card' || normalized === 'card') return { label: 'Cartao', icon: 'CAR' };
  return { label: method || '--', icon: 'PAY' };
}

function showState(message, type = '') {
  const root = document.getElementById('adminState');
  if (!root) return;
  root.hidden = !message;
  root.className = `admin-state ${type}`.trim();
  root.textContent = message || '';
}

function setMetric(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderMetrics() {
  const metrics = state.metrics || {};
  setMetric('metricUsers', metrics.usuarios_cadastrados ?? 0);
  setMetric('metricTrials', metrics.trials_ativos ?? 0);
  setMetric('metricActiveSubscriptions', metrics.assinaturas_ativas ?? 0);
  setMetric('metricCanceledSubscriptions', metrics.assinaturas_canceladas ?? 0);
  setMetric('metricPendingPayments', metrics.pagamentos_pendentes ?? 0);
  setMetric('metricPendingReferrals', metrics.indicacoes_pendentes ?? 0);
  setMetric('metricConvertedReferrals', metrics.indicacoes_convertidas ?? 0);
  setMetric('metricRewardedReferrals', metrics.indicacoes_recompensadas ?? 0);
  setMetric('metricOnboardingCompleted', metrics.onboarding_concluidos ?? 0);
  setMetric('metricOnboardingPending', metrics.onboarding_pendentes ?? 0);
  setMetric('metricAiConsultations', metrics.total_consultas_ia ?? 0);
  setMetric('metricAiUsers', metrics.usuarios_ia ?? 0);
  setMetric('metricAiTopQuestion', metrics.perguntas_frequentes_ia?.[0]?.question || '--');
  setMetric('metricTotalRevenue', formatBRL(metrics.receita_total || 0));
  setMetric('metricMrr', formatBRL(metrics.mrr || 0));
  setMetric('metricArr', formatBRL(metrics.arr || 0));
}

function renderUsers() {
  const body = document.getElementById('usersTableBody');
  const query = String(document.getElementById('userSearch')?.value || '').trim().toLowerCase();
  if (!body) return;

  const users = state.users.filter((user) => {
    const haystack = `${user.nome || ''} ${user.email || ''}`.toLowerCase();
    return !query || haystack.includes(query);
  });

  if (!users.length) {
    body.innerHTML = '<tr><td colspan="5" class="cell-muted">Nenhum usuario encontrado.</td></tr>';
    return;
  }

  body.innerHTML = users.map((user) => {
    const meta = statusMeta(user.status);
    return `
      <tr>
        <td><strong>${esc(user.nome)}</strong></td>
        <td class="cell-muted">${esc(user.email || '--')}</td>
        <td>${esc(planLabel(user.plano))}</td>
        <td><span class="badge ${esc(meta.className)}">${esc(meta.label)}</span></td>
        <td>${formatDate(user.created_at)}</td>
      </tr>
    `;
  }).join('');
}

function renderSubscriptions() {
  const body = document.getElementById('subscriptionsTableBody');
  if (!body) return;

  if (!state.subscriptions.length) {
    body.innerHTML = '<tr><td colspan="5" class="cell-muted">Nenhuma assinatura encontrada.</td></tr>';
    return;
  }

  body.innerHTML = state.subscriptions.map((subscription) => {
    const meta = statusMeta(subscription.status);
    return `
      <tr>
        <td>
          <div class="user-cell">
            <strong>${esc(subscription.user_name)}</strong>
            <span class="cell-muted">${esc(subscription.user_email || '--')}</span>
          </div>
        </td>
        <td>${esc(planLabel(subscription.plano))}</td>
        <td><span class="badge ${esc(meta.className)}">${esc(meta.label)}</span></td>
        <td>${formatDate(subscription.data_vencimento)}</td>
        <td><span class="badge ${subscription.cancel_at_period_end ? 'warning' : 'active'}">${subscription.cancel_at_period_end ? 'Sim' : 'Nao'}</span></td>
      </tr>
    `;
  }).join('');
}

function renderPayments() {
  const body = document.getElementById('paymentsTableBody');
  const filter = String(document.getElementById('paymentMethodFilter')?.value || '').trim().toLowerCase();
  if (!body) return;

  const payments = state.payments.filter((payment) => !filter || String(payment.method || '').toLowerCase() === filter);

  if (!payments.length) {
    body.innerHTML = '<tr><td colspan="5" class="cell-muted">Nenhum pagamento encontrado.</td></tr>';
    return;
  }

  body.innerHTML = payments.map((payment) => {
    const method = methodMeta(payment.method);
    const status = statusMeta(payment.status);
    return `
      <tr>
        <td>
          <div class="user-cell">
            <strong>${esc(payment.user_name)}</strong>
            <span class="cell-muted">${esc(payment.user_email || '--')}</span>
          </div>
        </td>
        <td>
          <span class="method-pill"><span class="method-icon">${esc(method.icon)}</span>${esc(method.label)}</span>
        </td>
        <td>${formatBRL(payment.valor)}</td>
        <td><span class="badge ${esc(status.className)}">${esc(status.label)}</span></td>
        <td>${formatDate(payment.date)}</td>
      </tr>
    `;
  }).join('');
}

function renderCoupons() {
  const body = document.getElementById('couponsTableBody');
  if (!body) return;

  if (!state.coupons.length) {
    body.innerHTML = '<tr><td colspan="7" class="cell-muted">Nenhum cupom cadastrado.</td></tr>';
    return;
  }

  body.innerHTML = state.coupons.map((coupon) => {
    const type = coupon.discount_type === 'FIXED' ? 'Valor fixo' : 'Percentual';
    const value = coupon.discount_type === 'FIXED' ? formatBRL(coupon.discount_value) : `${Number(coupon.discount_value)}%`;
    const validity = coupon.valid_until ? formatDate(coupon.valid_until) : 'Sem validade';
    return `
      <tr>
        <td><strong>${esc(coupon.code)}</strong><br><span class="cell-muted">${esc(coupon.description || '--')}</span></td>
        <td>${esc(type)}</td>
        <td>${esc(value)}</td>
        <td>${Number(coupon.current_uses || 0)}${coupon.max_uses ? ` / ${Number(coupon.max_uses)}` : ''}</td>
        <td>${esc(validity)}</td>
        <td><span class="badge ${coupon.active ? 'active' : 'canceled'}">${coupon.active ? 'Ativo' : 'Inativo'}</span></td>
        <td><button class="badge info" type="button" data-coupon-toggle="${esc(coupon.id)}">${coupon.active ? 'Desativar' : 'Ativar'}</button></td>
      </tr>
    `;
  }).join('');
}

function summarizeMetadata(metadata = {}) {
  const entries = Object.entries(metadata || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .slice(0, 4);
  if (!entries.length) return '--';
  return entries
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join(' | ');
}

function isCriticalAuditAction(action) {
  const normalized = String(action || '').toLowerCase();
  return [
    'payment.',
    'webhook.',
    'assinatura.',
    'subscription.',
    'admin.access_denied',
    'admin.backup.generated',
    'coupon.',
    'referral.rewarded'
  ].some((prefix) => normalized.startsWith(prefix) || normalized === prefix);
}

function renderAuditLogs() {
  const body = document.getElementById('auditTableBody');
  if (!body) return;

  if (!state.auditLogs.length) {
    body.innerHTML = '<tr><td colspan="5" class="cell-muted">Nenhum evento de auditoria encontrado.</td></tr>';
    return;
  }

  body.innerHTML = state.auditLogs.map((log) => `
    <tr>
      <td>${formatDate(log.created_at)}</td>
      <td>
        <div class="user-cell">
          <strong>${esc(log.user_name || 'Sistema')}</strong>
          <span class="cell-muted">${esc(log.user_email || log.user_id || '--')}</span>
        </div>
      </td>
      <td><span class="badge info">${esc(log.action)}</span></td>
      <td>${esc(log.entity_type || '--')}${log.entity_id ? `<br><span class="cell-muted">${esc(log.entity_id)}</span>` : ''}</td>
      <td class="cell-muted">${esc(summarizeMetadata(log.metadata))}</td>
    </tr>
  `).join('');
}

function renderSecurity() {
  setMetric('securityTotalUsers', state.users.length);
  setMetric('securityTotalSubscriptions', state.subscriptions.length);
  setMetric('securityTotalPayments', state.payments.length);

  const lastBackup = state.auditLogs.find((log) => log.action === 'admin.backup.generated');
  setMetric('securityLastBackup', lastBackup ? formatDate(lastBackup.created_at) : 'Nenhum');

  const body = document.getElementById('securityCriticalEventsBody');
  if (!body) return;

  const events = state.auditLogs
    .filter((log) => isCriticalAuditAction(log.action))
    .slice(0, 8);

  if (!events.length) {
    body.innerHTML = '<tr><td colspan="4" class="cell-muted">Nenhum evento critico recente.</td></tr>';
    return;
  }

  body.innerHTML = events.map((log) => `
    <tr>
      <td>${formatDate(log.created_at)}</td>
      <td>
        <div class="user-cell">
          <strong>${esc(log.user_name || 'Sistema')}</strong>
          <span class="cell-muted">${esc(log.user_email || log.user_id || '--')}</span>
        </div>
      </td>
      <td><span class="badge warning">${esc(log.action)}</span></td>
      <td class="cell-muted">${esc(summarizeMetadata(log.metadata))}</td>
    </tr>
  `).join('');
}

function renderAll() {
  renderMetrics();
  renderUsers();
  renderSubscriptions();
  renderPayments();
  renderCoupons();
  renderAuditLogs();
  renderSecurity();
}

async function loadAdminData() {
  showState('Carregando dados administrativos...');
  const [dashboard, users, subscriptions, payments, coupons, auditLogs] = await Promise.all([
    apiRequest('/admin/dashboard'),
    apiRequest('/admin/users'),
    apiRequest('/admin/subscriptions'),
    apiRequest('/admin/payments'),
    apiRequest('/admin/coupons'),
    apiRequest('/admin/audit-logs')
  ]);

  state.metrics = dashboard.metrics || {};
  state.users = Array.isArray(users.users) ? users.users : [];
  state.subscriptions = Array.isArray(subscriptions.subscriptions) ? subscriptions.subscriptions : [];
  state.payments = Array.isArray(payments.payments) ? payments.payments : [];
  state.coupons = Array.isArray(coupons.coupons) ? coupons.coupons : [];
  state.auditLogs = Array.isArray(auditLogs.logs) ? auditLogs.logs : [];
  showState('');
  renderAll();
}

function setupEvents() {
  document.getElementById('userSearch')?.addEventListener('input', renderUsers);
  document.getElementById('paymentMethodFilter')?.addEventListener('change', renderPayments);
  document.getElementById('couponForm')?.addEventListener('submit', createCouponFromForm);
  document.getElementById('couponsTableBody')?.addEventListener('click', toggleCouponStatus);
  document.getElementById('backupDownloadButton')?.addEventListener('click', downloadAdminBackup);

  document.querySelectorAll('[data-admin-nav]').forEach((link) => {
    link.addEventListener('click', () => {
      document.querySelectorAll('[data-admin-nav]').forEach((item) => item.classList.remove('active'));
      link.classList.add('active');
    });
  });
}

async function downloadAdminBackup(event) {
  const button = event.currentTarget;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Gerando backup...';
  showState('Gerando backup seguro para download...');

  try {
    const blob = await fetchAdminBlob('/admin/backup');
    downloadBlob(blob, `fluxmei-backup-${todayDownloadDate()}.json`);
    showState('Backup gerado com sucesso.');
    await loadAdminData();
  } catch (error) {
    showState(error.message || 'Nao foi possivel gerar o backup.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function createCouponFromForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const validUntil = document.getElementById('couponValidUntil')?.value || '';
  const payload = {
    code: document.getElementById('couponCode')?.value || '',
    discount_type: document.getElementById('couponType')?.value || 'PERCENTAGE',
    discount_value: Number(document.getElementById('couponValue')?.value || 0),
    max_uses: document.getElementById('couponMaxUses')?.value ? Number(document.getElementById('couponMaxUses').value) : null,
    valid_until: validUntil ? `${validUntil}T23:59:59.000Z` : null,
    active: true
  };

  try {
    await apiRequest('/admin/coupons', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    form.reset();
    await loadAdminData();
  } catch (error) {
    showState(error.message || 'Nao foi possivel criar o cupom.', 'error');
  }
}

async function toggleCouponStatus(event) {
  const button = event.target.closest('[data-coupon-toggle]');
  if (!button) return;
  const coupon = state.coupons.find((item) => item.id === button.dataset.couponToggle);
  if (!coupon) return;

  try {
    await apiRequest(`/admin/coupons/${encodeURIComponent(coupon.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ ...coupon, active: !coupon.active })
    });
    await loadAdminData();
  } catch (error) {
    showState(error.message || 'Nao foi possivel atualizar o cupom.', 'error');
  }
}

async function init() {
  setupEvents();
  try {
    await loadAdminData();
  } catch (error) {
    if (error.message !== 'Acesso restrito.') {
      showState(error.message || 'Nao foi possivel carregar o painel administrativo.', 'error');
    }
  }
}

document.addEventListener('DOMContentLoaded', init);
