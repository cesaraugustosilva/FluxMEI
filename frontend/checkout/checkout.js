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

const PAYMENT_STATUS = {
  approved: {
    type: 'success',
    icon: 'OK',
    title: 'Pagamento aprovado',
    text: 'Pagamento aprovado! Estamos liberando seu acesso.'
  },
  active: {
    type: 'success',
    icon: 'OK',
    title: 'Assinatura ativa',
    text: 'Seu acesso Pro foi liberado. Voce ja pode voltar ao app.'
  },
  pending: {
    type: 'pending',
    icon: '!',
    title: 'Pagamento pendente',
    text: 'Assim que o processador confirmar o pagamento, sua assinatura sera ativada automaticamente.'
  },
  in_process: {
    type: 'pending',
    icon: '!',
    title: 'Pagamento em analise',
    text: 'O processador esta analisando o pagamento. Voce pode permanecer nesta tela ou voltar ao app.'
  },
  failure: {
    type: 'error',
    icon: '!',
    title: 'Pagamento nao concluido',
    text: 'O pagamento nao foi aprovado. Revise os dados ou tente outra forma de pagamento.'
  },
  rejected: {
    type: 'error',
    icon: '!',
    title: 'Pagamento recusado',
    text: 'Confira os dados informados ou escolha outra forma de pagamento.'
  }
};

let selectedPlan = FALLBACK_PLANS.pro_mensal;
let paymentBrickController = null;
let statusPoller = null;

function normalizeApiUrl(url) {
  return String(url || '').replace(/\/$/, '');
}

function resolveApiUrls() {
  const apiUrl = normalizeApiUrl(window.FLUXMEI_CONFIG?.API_URL);
  if (!apiUrl) throw new Error('FLUXMEI_CONFIG.API_URL nao configurada.');

  const urls = [apiUrl];
  const sameOriginApi = normalizeApiUrl(`${window.location.origin}/api`);
  const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);

  if (isLocalHost && !urls.includes(sameOriginApi)) {
    urls.push(sameOriginApi);
  }

  return urls;
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
  const config = PAYMENT_STATUS[statusKey] || PAYMENT_STATUS.pending;
  const panel = document.getElementById('statusPanel');

  document.getElementById('statusIcon').textContent = config.icon;
  document.getElementById('statusTitle').textContent = config.title;
  document.getElementById('statusText').textContent = overrideText || config.text;
  panel.className = `status-panel ${config.type}`;
  panel.hidden = false;
}

function setBrickLoading(isLoading, message = 'Carregando meios de pagamento...') {
  const loading = document.getElementById('brickLoading');
  loading.classList.toggle('is-hidden', !isLoading);
  const title = loading.querySelector('strong');
  if (title) title.textContent = message;
}

function setBrickVisible(isVisible) {
  document.getElementById('paymentBrick_container').classList.toggle('is-hidden', !isVisible);
  document.querySelector('.brick-shell')?.classList.toggle('is-hidden', !isVisible);
}

async function request(path, options = {}, { auth = true } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const token = getToken();
  if (auth && !token) throw new Error('LOGIN_REQUIRED');
  if (token) headers.Authorization = `Bearer ${token}`;

  let response = null;
  let url = '';
  const apiUrls = resolveApiUrls();

  for (const apiUrl of apiUrls) {
    try {
      url = `${apiUrl}${path}`;
      response = await fetch(url, {
        ...options,
        headers
      });
      break;
    } catch {
      response = null;
    }
  }

  if (!response) {
    throw new Error(`Nao foi possivel conectar a API. Verifique se o backend esta online e tente novamente. Ultima URL: ${url}`);
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

async function loadPublicKey() {
  const configuredKey = window.FLUXMEI_CONFIG?.MERCADO_PAGO_PUBLIC_KEY;
  if (configuredKey) return configuredKey;

  const data = await request('/pagamentos/mercado-pago/public-config', {}, { auth: false });
  if (!data?.public_key) throw new Error('Public key do Mercado Pago nao configurada.');
  return data.public_key;
}

function renderPlan(plan) {
  document.getElementById('planName').textContent = plan.nome;
  document.getElementById('planPrice').textContent = formatBRL(plan.preco);
  document.getElementById('planCycle').textContent = getPlanCycle(plan);
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
  setBrickVisible(false);
  setBrickLoading(true, 'Login necessario');
  document.getElementById('userName').textContent = 'Login necessario';
  document.getElementById('userEmail').textContent = 'Entre ou crie sua conta para continuar a assinatura.';
  showStatus('pending', 'Voce precisa estar logado para finalizar a assinatura. Sua escolha de plano foi preservada.');

  const back = document.querySelector('.back-button');
  back.textContent = 'Criar conta';
  back.href = getRegisterUrl(planId);

  window.setTimeout(() => {
    window.location.href = getLoginUrl(planId);
  }, 1200);
}

async function pollSubscriptionActivation(maxAttempts = 12) {
  if (statusPoller) window.clearInterval(statusPoller);

  let attempts = 0;
  statusPoller = window.setInterval(async () => {
    attempts += 1;
    try {
      const status = await request('/assinaturas/status');
      if (status?.estado === 'ativo') {
        window.clearInterval(statusPoller);
        statusPoller = null;
        clearSubscribeIntent();
        showStatus('active');
        showAlert('Assinatura ativada com sucesso.', 'success');
      }
    } catch {
      // Keep the current payment message visible while polling.
    }

    if (attempts >= maxAttempts && statusPoller) {
      window.clearInterval(statusPoller);
      statusPoller = null;
    }
  }, 4000);
}

function getStatusKeyFromPayment(payment) {
  const status = String(payment.payment_status || '').toLowerCase();
  if (status === 'approved' || status === 'received' || status === 'confirmed' || status === 'received_in_cash') return 'approved';
  if (['pending', 'authorized', 'awaiting_risk_analysis'].includes(status)) return 'pending';
  if (status === 'in_process') return 'in_process';
  if (['rejected', 'cancelled', 'canceled', 'refunded', 'charged_back', 'overdue', 'refund_requested', 'chargeback_requested'].includes(status)) return 'failure';
  return 'pending';
}

async function submitBrickPayment(formData) {
  clearAlert();
  setBrickLoading(true, 'Enviando pagamento...');

  const data = await request('/pagamentos/mercado-pago/processar-brick', {
    method: 'POST',
    body: JSON.stringify({
      plano: selectedPlan.id,
      payment: formData
    })
  });

  const statusKey = getStatusKeyFromPayment(data);
  showStatus(statusKey);

  if (statusKey === 'approved') {
    showAlert('Pagamento aprovado pelo Mercado Pago. Aguardando confirmacao do webhook para liberar a assinatura.', 'success');
    pollSubscriptionActivation();
  } else if (statusKey === 'pending' || statusKey === 'in_process') {
    showAlert('Pagamento recebido pelo Mercado Pago e aguardando confirmacao.', 'success');
    pollSubscriptionActivation();
  } else {
    showAlert('O pagamento nao foi aprovado. Voce pode tentar novamente no formulario ao lado.');
  }

  setBrickLoading(false);
  return data;
}

async function renderPaymentBrick(publicKey) {
  if (!window.MercadoPago) {
    throw new Error('SDK do Mercado Pago nao carregado.');
  }

  if (paymentBrickController?.unmount) {
    await paymentBrickController.unmount();
  }

  const mercadoPago = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
  const bricksBuilder = mercadoPago.bricks();

  paymentBrickController = await bricksBuilder.create('payment', 'paymentBrick_container', {
    initialization: {
      amount: selectedPlan.preco
    },
    customization: {
      paymentMethods: {
        bankTransfer: 'all',
        creditCard: 'all',
        debitCard: 'all',
        prepaidCard: 'all',
        ticket: 'all'
      },
      visual: {
        style: {
          theme: 'dark'
        }
      }
    },
    callbacks: {
      onReady: () => {
        setBrickLoading(false);
        setBrickVisible(true);
      },
      onSubmit: ({ formData }) => {
        return new Promise((resolve, reject) => {
          submitBrickPayment(formData)
            .then(() => resolve())
            .catch((error) => {
              setBrickLoading(false);
              showAlert(error.message || 'Nao foi possivel processar o pagamento.');
              reject(error);
            });
        });
      },
      onError: () => {
        setBrickLoading(false);
        setBrickVisible(false);
        showAlert('O Mercado Pago nao conseguiu carregar o formulario. Atualize a pagina e tente novamente.');
      }
    }
  });
}

async function ensureMercadoPagoBrick() {
  if (paymentBrickController) {
    setBrickLoading(false);
    setBrickVisible(true);
    return;
  }

  const publicKey = await loadPublicKey();
  await renderPaymentBrick(publicKey);
}

async function initCheckout() {
  setBrickVisible(false);
  setBrickLoading(true, 'Carregando Mercado Pago...');

  const planId = getSelectedPlanId();
  saveSubscribeIntent(planId);
  selectedPlan = await loadPlan(planId);
  renderPlan(selectedPlan);

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
      setBrickVisible(false);
      setBrickLoading(false);
      showStatus('active', 'Sua assinatura ja esta ativa. Voce pode voltar ao app.');
      return;
    }

    await ensureMercadoPagoBrick();
  } catch (error) {
    if (error.message === 'LOGIN_REQUIRED') {
      handleLoginRequired(planId);
      return;
    }
    setBrickLoading(false);
    setBrickVisible(false);
    showAlert(error.message || 'Nao foi possivel carregar o checkout.');
  }
}

window.addEventListener('beforeunload', () => {
  if (paymentBrickController?.unmount) paymentBrickController.unmount();
  if (statusPoller) window.clearInterval(statusPoller);
});

document.addEventListener('DOMContentLoaded', initCheckout);
