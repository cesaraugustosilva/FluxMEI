'use strict';

const TOKEN_KEY = 'fluxmei_access_token';
const INTENT_KEY = 'fluxmei_intent';
const PLAN_KEY = 'fluxmei_subscribe_plan';
const SUBSCRIBE_INTENT = 'subscribe';
const DEFAULT_PLAN = 'pro_mensal';

const FALLBACK_PLANS = {
  pro_mensal: {
    id: 'pro_mensal',
    nome: 'Plano FluxMEI Mensal',
    preco: 49.9,
    tipo_cobranca: 'mensal'
  },
  pro_anual: {
    id: 'pro_anual',
    nome: 'Plano FluxMEI Anual',
    preco: 478.8,
    tipo_cobranca: 'anual'
  }
};

const RETURN_MESSAGES = {
  success: {
    type: 'success',
    icon: '✓',
    title: 'Pagamento recebido',
    text: 'Estamos confirmando sua assinatura. Se o Mercado Pago ja aprovou, seu acesso sera liberado em instantes.'
  },
  approved: {
    type: 'success',
    icon: '✓',
    title: 'Pagamento aprovado',
    text: 'Seu acesso Pro esta sendo liberado automaticamente.'
  },
  pending: {
    type: 'pending',
    icon: '!',
    title: 'Pagamento pendente',
    text: 'Assim que o Mercado Pago confirmar o pagamento, sua assinatura sera ativada.'
  },
  in_process: {
    type: 'pending',
    icon: '!',
    title: 'Pagamento em analise',
    text: 'O Mercado Pago esta analisando o pagamento. Voce pode voltar ao app enquanto aguarda.'
  },
  failure: {
    type: 'error',
    icon: '!',
    title: 'Pagamento nao concluido',
    text: 'Voce pode revisar o plano e tentar novamente quando quiser.'
  },
  rejected: {
    type: 'error',
    icon: '!',
    title: 'Pagamento recusado',
    text: 'Confira os dados no Mercado Pago ou tente outra forma de pagamento.'
  }
};

function normalizeApiUrl(url) {
  return String(url || '').replace(/\/$/, '');
}

function resolveApiUrl() {
  const apiUrl = normalizeApiUrl(window.FLUXMEI_CONFIG?.API_URL);
  if (!apiUrl) throw new Error('FLUXMEI_CONFIG.API_URL nao configurada.');
  return apiUrl;
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getSelectedPlanId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('plan') || localStorage.getItem(PLAN_KEY) || DEFAULT_PLAN;
}

function saveSubscribeIntent(planId = DEFAULT_PLAN) {
  localStorage.setItem(INTENT_KEY, SUBSCRIBE_INTENT);
  localStorage.setItem(PLAN_KEY, planId);
}

function clearSubscribeIntent() {
  localStorage.removeItem(INTENT_KEY);
  localStorage.removeItem(PLAN_KEY);
}

function getLoginUrl(planId = getSelectedPlanId()) {
  const url = new URL('/auth/login/index.html', window.location.origin);
  url.searchParams.set('intent', SUBSCRIBE_INTENT);
  url.searchParams.set('plan', planId);
  return url.href;
}

function getRegisterUrl(planId = getSelectedPlanId()) {
  const url = new URL('/auth/cadastro/index.html', window.location.origin);
  url.searchParams.set('intent', SUBSCRIBE_INTENT);
  url.searchParams.set('plan', planId);
  return url.href;
}

function formatBRL(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function getPlanCycle(plan) {
  return plan.tipo_cobranca === 'anual' ? 'por ano' : 'por mes';
}

function normalizePlan(plan) {
  const fallback = FALLBACK_PLANS[plan?.id] || FALLBACK_PLANS.pro_mensal;
  return {
    ...fallback,
    ...plan,
    nome: plan?.nome || fallback.nome,
    preco: Number(plan?.preco ?? fallback.preco),
    tipo_cobranca: plan?.tipo_cobranca || fallback.tipo_cobranca
  };
}

function setLoading(isLoading) {
  const button = document.getElementById('payButton');
  button.disabled = isLoading;
  button.textContent = isLoading ? 'Criando checkout...' : 'Pagar com Mercado Pago';
}

function showAlert(message, type = 'error') {
  const alert = document.getElementById('checkoutAlert');
  alert.textContent = message;
  alert.className = `checkout-alert show ${type}`;
}

function clearAlert() {
  const alert = document.getElementById('checkoutAlert');
  alert.textContent = '';
  alert.className = 'checkout-alert';
}

function showStatus(statusKey, overrideText) {
  const config = RETURN_MESSAGES[statusKey];
  if (!config) return;

  const panel = document.getElementById('statusPanel');
  document.getElementById('statusIcon').textContent = config.icon;
  document.getElementById('statusTitle').textContent = config.title;
  document.getElementById('statusText').textContent = overrideText || config.text;
  panel.className = `status-panel ${config.type}`;
  panel.hidden = false;
}

async function request(path, options = {}, { auth = true } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const token = getToken();
  if (auth && !token) {
    throw new Error('LOGIN_REQUIRED');
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  let url = '';
  const apiUrl = resolveApiUrl();

  try {
    url = `${apiUrl}${path}`;
    response = await fetch(url, {
      ...options,
      headers
    });
  } catch {
    throw new Error('Nao foi possivel conectar a API. Verifique sua conexao e tente novamente.');
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : null;
  const text = isJson ? '' : await response.text();

  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    throw new Error('LOGIN_REQUIRED');
  }

  if (!response.ok) {
    throw new Error(data?.error || text?.trim() || `Erro ${response.status} ao chamar ${url}.`);
  }

  return data;
}

async function loadPlan(planId) {
  try {
    const plans = await request('/assinaturas/planos', {}, { auth: false });
    const selected = Array.isArray(plans) ? plans.find((plan) => plan.id === planId) : null;
    return normalizePlan(selected || FALLBACK_PLANS[planId] || FALLBACK_PLANS.pro_mensal);
  } catch {
    return normalizePlan(FALLBACK_PLANS[planId] || FALLBACK_PLANS.pro_mensal);
  }
}

function renderPlan(plan) {
  document.getElementById('planName').textContent = plan.nome;
  document.getElementById('planPrice').textContent = formatBRL(plan.preco);
  document.getElementById('planCycle').textContent = getPlanCycle(plan);
  document.getElementById('summaryPlan').textContent = plan.nome.replace('Plano ', '');
}

function renderUser(data) {
  const profile = data?.profile || {};
  const user = data?.user || {};
  const name = profile.nome || user.user_metadata?.nome || 'Usuario FluxMEI';
  const email = user.email || 'Email nao informado';

  document.getElementById('userName').textContent = name;
  document.getElementById('userEmail').textContent = email;
  document.getElementById('userAvatar').textContent = name.charAt(0).toUpperCase();
}

function handleLoginRequired(planId) {
  saveSubscribeIntent(planId);
  document.getElementById('userName').textContent = 'Login necessario';
  document.getElementById('userEmail').textContent = 'Entre ou crie sua conta para continuar a assinatura.';
  showStatus('pending', 'Voce precisa estar logado para finalizar a assinatura. Sua escolha de plano foi preservada.');

  const button = document.getElementById('payButton');
  button.textContent = 'Entrar para continuar';
  button.disabled = false;
  button.dataset.action = 'login';
  if (!button.dataset.redirecting) {
    button.dataset.redirecting = 'true';
    window.setTimeout(() => {
      window.location.href = getLoginUrl(planId);
    }, 1200);
  }

  const back = document.querySelector('.back-button');
  back.textContent = 'Criar conta';
  back.href = getRegisterUrl(planId);
}

function hasMercadoPagoReturnParams() {
  const params = new URLSearchParams(window.location.search);
  return Boolean(
    params.get('status')
    || params.get('collection_status')
    || params.get('payment_id')
    || params.get('collection_id')
  );
}

async function syncReturnedPayment() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('status') || params.get('collection_status');
  const paymentId = params.get('payment_id') || params.get('collection_id');

  if (status && RETURN_MESSAGES[status]) showStatus(status);
  if (!paymentId) return;

  try {
    const data = await request(`/pagamentos/mercado-pago/sincronizar?payment_id=${encodeURIComponent(paymentId)}`);
    if (data.payment_status === 'approved') {
      showStatus('approved', 'Pagamento aprovado. Seu acesso Pro foi liberado.');
      document.getElementById('payButton').textContent = 'Ir para o app';
      document.getElementById('payButton').dataset.action = 'app';
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (['pending', 'in_process', 'authorized'].includes(data.payment_status)) {
      showStatus('pending', 'Pagamento criado e ainda pendente no Mercado Pago.');
      return;
    }

    showStatus('failure', 'O Mercado Pago retornou o pagamento como nao aprovado.');
  } catch (error) {
    if (error.message === 'LOGIN_REQUIRED') {
      handleLoginRequired(getSelectedPlanId());
      return;
    }
    showAlert(error.message || 'Nao foi possivel sincronizar o pagamento.');
  }
}

async function createCheckout(planId) {
  clearAlert();
  setLoading(true);

  try {
    const data = await request('/pagamentos/mercado-pago/criar-checkout', {
      method: 'POST',
      body: JSON.stringify({ plano: planId })
    });

    if (!data.checkout_url) {
      throw new Error('Mercado Pago nao retornou a URL de pagamento.');
    }

    clearSubscribeIntent();
    showAlert('Checkout criado. Redirecionando para o Mercado Pago...', 'success');
    window.location.href = data.checkout_url;
  } catch (error) {
    if (error.message === 'LOGIN_REQUIRED') {
      handleLoginRequired(planId);
      return;
    }

    showAlert(error.message || 'Nao foi possivel criar o checkout. Tente novamente em instantes.');
  } finally {
    if (getToken()) setLoading(false);
  }
}

async function initCheckout() {
  const planId = getSelectedPlanId();
  saveSubscribeIntent(planId);
  renderPlan(await loadPlan(planId));

  document.getElementById('payButton').addEventListener('click', () => {
    const action = document.getElementById('payButton').dataset.action;
    if (action === 'login') {
      window.location.href = getLoginUrl(planId);
      return;
    }
    if (action === 'app') {
      window.location.href = '/app/';
      return;
    }
    createCheckout(planId);
  });

  if (!getToken()) {
    handleLoginRequired(planId);
    return;
  }

  try {
    const [me, subscriptionStatus] = await Promise.all([
      request('/auth/me'),
      request('/assinaturas/status')
    ]);
    renderUser(me);

    if (subscriptionStatus?.estado === 'ativo') {
      showStatus('approved', 'Sua assinatura ja esta ativa. Voce pode voltar ao app.');
      document.getElementById('payButton').textContent = 'Ir para o app';
      document.getElementById('payButton').dataset.action = 'app';
    }
  } catch (error) {
    if (error.message === 'LOGIN_REQUIRED') {
      handleLoginRequired(planId);
      return;
    }
    showAlert(error.message || 'Nao foi possivel carregar seus dados.');
  }

  if (hasMercadoPagoReturnParams()) {
    await syncReturnedPayment();
  }
}

document.addEventListener('DOMContentLoaded', initCheckout);
