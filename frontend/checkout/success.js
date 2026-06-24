const TOKEN_KEY = 'fluxmei_access_token';
const SUCCESS_SUMMARY_KEY = 'fluxmei_payment_success_summary';

function normalizeApiUrl(url) {
  return String(url || '').replace(/\/$/, '');
}

function getApiUrl() {
  const configured = normalizeApiUrl(window.FLUXMEI_CONFIG?.API_URL);
  if (configured) return configured;
  return normalizeApiUrl(`${window.location.origin}/api`);
}

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

function getLoginUrl() {
  const url = new URL('/auth/login.html', window.location.origin);
  url.searchParams.set('redirect', '/checkout/success.html');
  return url.href;
}

function redirectToLogin() {
  window.location.href = getLoginUrl();
}

async function request(path) {
  const token = getToken();
  if (!token) throw new Error('LOGIN_REQUIRED');

  const response = await fetch(`${getApiUrl()}${path}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`
    }
  });

  if (response.status === 401) throw new Error('LOGIN_REQUIRED');

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || data?.error || 'Nao foi possivel validar sua assinatura.');
  return data;
}

function readStoredSummary() {
  try {
    return JSON.parse(sessionStorage.getItem(SUCCESS_SUMMARY_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function formatPlan(plan) {
  if (plan === 'pro_anual') return 'Plano Pro Anual';
  if (plan === 'pro_mensal') return 'Plano Pro Mensal';
  return 'FluxMEI Pro';
}

function formatMethod(method, provider) {
  const normalized = String(method || '').toLowerCase();
  if (normalized.includes('pix')) return 'Pix';
  if (normalized.includes('boleto')) return 'Boleto';
  if (normalized.includes('cart') || normalized.includes('card') || normalized.includes('credit')) return 'Cartao';
  if (provider) return `Pagamento ${String(provider).toUpperCase()}`;
  return 'Pagamento confirmado';
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toLocaleString('pt-BR');
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function renderSuccess(subscriptionStatus, summary = {}) {
  const isActive = subscriptionStatus?.estado === 'ativo' || subscriptionStatus?.status === 'ativo' || subscriptionStatus?.ativo === true;
  if (!isActive) {
    window.location.href = '/app/#minha-conta';
    return false;
  }

  setText('successPlan', formatPlan(subscriptionStatus?.plano || summary.plan));
  setText('successMethod', formatMethod(summary.method, subscriptionStatus?.payment_provider || summary.provider));
  setText('successDate', formatDate(summary.confirmed_at));
  setText('successStatus', 'Ativo');
  return true;
}

async function initSuccessPage() {
  if (!getToken()) {
    redirectToLogin();
    return;
  }

  try {
    const [me, subscriptionStatus] = await Promise.all([
      request('/auth/me'),
      request('/assinaturas/status')
    ]);
    void me;
    renderSuccess(subscriptionStatus, readStoredSummary());
  } catch (error) {
    if (error.message === 'LOGIN_REQUIRED') {
      redirectToLogin();
      return;
    }
    setText('successPlan', 'Nao foi possivel validar');
    setText('successMethod', 'Tente novamente em instantes');
    setText('successDate', formatDate());
    setText('successStatus', 'Validando');
    setText('successNote', error.message || 'Nao foi possivel validar sua assinatura agora.');
  }
}

document.addEventListener('DOMContentLoaded', initSuccessPage);
