'use strict';

const TOKEN_KEY = 'fluxmei_access_token';
const INTENT_KEY = 'fluxmei_intent';
const PLAN_KEY = 'fluxmei_subscribe_plan';
const SUBSCRIBE_INTENT = 'subscribe';
const DEFAULT_PLAN = 'pro_mensal';

function normalizeApiUrl(url) {
  return String(url || '').replace(/\/$/, '');
}

function resolveApiUrls() {
  const apiUrl = normalizeApiUrl(window.FLUXMEI_CONFIG?.API_URL);
  if (!apiUrl) throw new Error('FLUXMEI_CONFIG.API_URL nao configurada.');
  return [apiUrl];
}

const API_URLS = resolveApiUrls();

function clearSessionAndRedirect() {
  localStorage.removeItem(TOKEN_KEY);
  const url = new URL('../../auth/login/index.html', window.location.href);
  if (hasSubscribeIntent()) {
    url.searchParams.set('intent', SUBSCRIBE_INTENT);
    url.searchParams.set('plan', getSubscribePlan());
  }
  window.location.href = url.href;
}

function showAlert(message, type = 'error') {
  const alert = document.getElementById('paymentAlert');
  alert.textContent = message;
  alert.className = `payment-alert show ${type}`;
}

function getReturnMessage(status) {
  const messages = {
    success: ['Pagamento recebido. Estamos confirmando sua assinatura...', 'success'],
    approved: ['Pagamento aprovado. Estamos liberando seu acesso...', 'success'],
    pending: ['Pagamento pendente. Assim que o Mercado Pago confirmar, o acesso sera liberado.', 'success'],
    in_process: ['Pagamento em analise. Vamos atualizar seu acesso quando for aprovado.', 'success'],
    failure: ['Pagamento nao concluido. Voce pode tentar novamente quando quiser.', 'error'],
    rejected: ['Pagamento recusado. Confira os dados e tente novamente.', 'error']
  };

  return messages[status] || null;
}

function captureIntentFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('intent') !== SUBSCRIBE_INTENT) return;

  localStorage.setItem(INTENT_KEY, SUBSCRIBE_INTENT);
  localStorage.setItem(PLAN_KEY, params.get('plan') || DEFAULT_PLAN);
}

function hasSubscribeIntent() {
  return localStorage.getItem(INTENT_KEY) === SUBSCRIBE_INTENT;
}

function getSubscribePlan() {
  return localStorage.getItem(PLAN_KEY) || DEFAULT_PLAN;
}

function clearSubscribeIntent() {
  localStorage.removeItem(INTENT_KEY);
  localStorage.removeItem(PLAN_KEY);
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

async function apiRequest(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    clearSessionAndRedirect();
    throw new Error('Faça login para continuar.');
  }

  let response;
  let url = '';

  for (const apiUrl of API_URLS) {
    url = `${apiUrl}${path}`;
    try {
      response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(options.headers || {})
        }
      });
      if (response.status === 404 && apiUrl !== API_URLS[API_URLS.length - 1]) continue;
      localStorage.setItem('fluxmei_api_url', apiUrl);
      break;
    } catch {
      response = null;
    }
  }

  if (!response) {
    throw new Error('Nao foi possivel conectar a API. Verifique a configuracao FLUXMEI_API_URL.');
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : null;
  const text = isJson ? '' : await response.text();

  if (response.status === 401) {
    clearSessionAndRedirect();
    throw new Error('Sua sessão expirou. Faça login novamente.');
  }

  if (!response.ok) {
    throw new Error(data?.error || text?.trim() || `Erro ${response.status} ao chamar ${url}.`);
  }

  return data;
}

async function subscribe(plan, button) {
  if (!button) return;

  const originalText = button.dataset.defaultText || button.textContent;
  button.dataset.defaultText = originalText;
  button.disabled = true;
  button.textContent = 'Criando pagamento...';

  try {
    const data = await apiRequest('/pagamentos/mercado-pago/criar-checkout', {
      method: 'POST',
      body: JSON.stringify({ plano: plan })
    });

    showAlert(data.message || 'Pagamento criado com sucesso.', 'success');
    if (data.checkout_url) {
      clearSubscribeIntent();
      window.location.href = data.checkout_url;
    }
  } catch (error) {
    showAlert(error.message || 'Não foi possível criar o pagamento. Tente novamente em instantes.');
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function syncReturnedPayment() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('status') || params.get('collection_status');
  const paymentId = params.get('payment_id') || params.get('collection_id');
  const returnMessage = getReturnMessage(status);

  if (returnMessage) showAlert(returnMessage[0], returnMessage[1]);
  if (!paymentId) return;

  try {
    const data = await apiRequest(`/pagamentos/mercado-pago/sincronizar?payment_id=${encodeURIComponent(paymentId)}`);
    if (data.payment_status === 'approved') {
      showAlert('Pagamento aprovado. Seu acesso Pro foi liberado.', 'success');
      window.history.replaceState({}, document.title, window.location.pathname);
      setTimeout(() => {
        window.location.href = '../index.html';
      }, 1500);
      return;
    }

    if (['pending', 'in_process', 'authorized'].includes(data.payment_status)) {
      showAlert('Pagamento criado e ainda pendente no Mercado Pago.', 'success');
      return;
    }

    showAlert('O Mercado Pago retornou o pagamento como nao aprovado.');
  } catch (error) {
    showAlert(error.message || 'Nao foi possivel sincronizar o pagamento.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  captureIntentFromUrl();
  syncReturnedPayment();

  document.querySelectorAll('[data-plan]').forEach((button) => {
    button.addEventListener('click', () => subscribe(button.dataset.plan, button));
  });

  if (hasSubscribeIntent() && !hasMercadoPagoReturnParams()) {
    const plan = getSubscribePlan();
    const button = document.querySelector(`[data-plan="${plan}"]`) || document.querySelector('[data-plan]');
    subscribe(plan, button);
  }
});
