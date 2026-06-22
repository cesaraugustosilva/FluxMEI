'use strict';

const TOKEN_KEY = 'fluxmei_access_token';
const INTENT_KEY = 'fluxmei_intent';
const PLAN_KEY = 'fluxmei_subscribe_plan';
const INTENT_CREATED_AT_KEY = 'fluxmei_intent_created_at';
const SUBSCRIBE_INTENT = 'subscribe';
const DEFAULT_PLAN = 'pro_mensal';
const ACTIVE_PAYMENT_METHODS = new Set(['pix', 'boleto']);

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
let statusPoller = null;
let currentPaymentId = null;
let currentPaymentMethod = null;
let currentBoletoPayment = null;
let selectedPaymentMethod = 'pix';
let currentUserData = null;

function normalizeApiUrl(url) {
  return String(url || '').replace(/\/$/, '');
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function getEfiPayeeCode() {
  return String(window.FLUXMEI_CONFIG?.EFI_PAYEE_CODE || '').trim();
}

function getEfiTokenEnvironment() {
  const configured = String(window.FLUXMEI_CONFIG?.EFI_ENVIRONMENT || '').trim().toLowerCase();
  if (configured === 'sandbox' || configured === 'homologacao' || configured === 'homologation') return 'sandbox';
  return 'production';
}

function isEfiCardTokenizationConfigured() {
  return Boolean(getEfiPayeeCode() && window.EfiPay?.CreditCard);
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
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

function clearAuthStorage() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('fluxmei_user');
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem('fluxmei_user');
}

function getSelectedPlanId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('plan') || localStorage.getItem(PLAN_KEY) || DEFAULT_PLAN;
}

function saveSubscribeIntent(planId = DEFAULT_PLAN) {
  localStorage.setItem(INTENT_KEY, SUBSCRIBE_INTENT);
  localStorage.setItem(PLAN_KEY, planId);
  localStorage.setItem(INTENT_CREATED_AT_KEY, String(Date.now()));
}

function clearSubscribeIntent() {
  localStorage.removeItem(INTENT_KEY);
  localStorage.removeItem(PLAN_KEY);
  localStorage.removeItem(INTENT_CREATED_AT_KEY);
}

function isSubscribeIntentUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('intent') === SUBSCRIBE_INTENT;
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

function hidePixPanel() {
  const panel = document.getElementById('pixPanel');
  panel.hidden = true;
  document.getElementById('pixQrImage').removeAttribute('src');
  document.getElementById('pixCode').value = '';
  currentPaymentId = null;
  if (currentPaymentMethod === 'pix') currentPaymentMethod = null;
}

function hideBoletoPanel() {
  const panel = document.getElementById('boletoPanel');
  panel.hidden = true;
  document.getElementById('boletoLine').value = '';
  const link = document.getElementById('boletoLink');
  link.href = '#';
  link.hidden = false;
  const dueDate = document.getElementById('boletoDueDate');
  if (dueDate) dueDate.textContent = '';
  currentPaymentId = null;
  currentBoletoPayment = null;
  if (currentPaymentMethod === 'boleto') currentPaymentMethod = null;
}

function setGeneratePixLoading(isLoading) {
  const button = document.getElementById('generatePixButton');
  if (!button) return;
  button.disabled = isLoading;
  button.textContent = isLoading ? 'Gerando Pix...' : 'Gerar Pix';
}

function isPixPayment(payment) {
  const method = String(payment?.payment_method_id || '').toLowerCase();
  const type = String(payment?.payment_type_id || '').toLowerCase();
  return method === 'pix'
    || type === 'pix'
    || payment?.payment_type_id === 'bank_transfer'
    || Boolean(payment?.pix?.qr_code || payment?.pix?.qr_code_base64 || payment?.qr_code);
}

function isBoletoPayment(payment) {
  const method = String(payment?.payment_method_id || payment?.method || '').toLowerCase();
  const type = String(payment?.payment_type_id || '').toLowerCase();
  return method === 'boleto'
    || type === 'boleto'
    || Boolean(payment?.bank_slip_url || payment?.invoice_url || payment?.digitable_line || payment?.linha_digitavel);
}

function normalizePaymentStatus(payment) {
  return String(payment?.payment_status || payment?.status || '').trim().toLowerCase();
}

function isPendingPixStatus(payment) {
  return ['ativa', 'active', 'pending', 'aguardando', 'authorized', 'awaiting_risk_analysis', 'waiting', 'new', 'processing', 'em_processamento'].includes(normalizePaymentStatus(payment));
}

function renderPixPanel(payment) {
  const pix = payment?.pix || payment || {};
  const qrCode = pix.qr_code || payment?.qr_code;
  const qrCodeBase64 = pix.qr_code_base64 || payment?.qr_code_base64;

  if (!isPixPayment(payment) || !isPendingPixStatus(payment)) {
    hidePixPanel();
    return false;
  }

  if (!qrCode) {
    hidePixPanel();
    showAlert('Pix gerado, mas nao recebemos o QR Code. Tente novamente em alguns instantes.');
    return false;
  }

  currentPaymentId = payment.payment_id;
  currentPaymentMethod = 'pix';
  const panel = document.getElementById('pixPanel');
  const image = document.getElementById('pixQrImage');
  const code = document.getElementById('pixCode');

  if (qrCodeBase64) {
    const qrImage = String(qrCodeBase64);
    image.src = qrImage.startsWith('data:')
      ? qrImage
      : `data:image/png;base64,${qrImage}`;
    image.hidden = false;
  } else {
    image.hidden = true;
  }

  code.value = qrCode;
  panel.hidden = false;
  return true;
}

function renderBoletoPanel(payment) {
  const previousPayment = currentBoletoPayment || {};
  const paymentId = payment?.payment_id || previousPayment.payment_id;
  const link = payment?.bank_slip_url || payment?.invoice_url || previousPayment.bank_slip_url || previousPayment.invoice_url;
  const line = payment?.digitable_line || payment?.linha_digitavel || previousPayment.digitable_line || previousPayment.linha_digitavel || '';
  const dueDate = payment?.due_date || payment?.expires_at || previousPayment.due_date || previousPayment.expires_at || '';

  if (!paymentId || (!link && !line)) {
    hideBoletoPanel();
    return false;
  }

  currentPaymentId = paymentId;
  currentPaymentMethod = 'boleto';
  currentBoletoPayment = {
    ...previousPayment,
    ...(payment || {}),
    payment_id: paymentId,
    invoice_url: payment?.invoice_url || previousPayment.invoice_url,
    bank_slip_url: payment?.bank_slip_url || previousPayment.bank_slip_url,
    digitable_line: payment?.digitable_line || previousPayment.digitable_line,
    linha_digitavel: payment?.linha_digitavel || previousPayment.linha_digitavel,
    due_date: payment?.due_date || previousPayment.due_date,
    expires_at: payment?.expires_at || previousPayment.expires_at
  };
  const panel = document.getElementById('boletoPanel');
  const linkElement = document.getElementById('boletoLink');
  const lineElement = document.getElementById('boletoLine');
  const dueDateElement = document.getElementById('boletoDueDate');

  linkElement.href = link || '#';
  linkElement.hidden = !link;
  lineElement.value = line;
  if (dueDateElement) {
    dueDateElement.textContent = dueDate ? `Vencimento: ${dueDate}` : '';
  }
  panel.hidden = false;
  return true;
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

function setPixGenerateVisible(isVisible) {
  const panel = document.getElementById('pixGeneratePanel');
  if (panel) panel.hidden = !isVisible;
}

function setBoletoGenerateVisible(isVisible) {
  const panel = document.getElementById('boletoGeneratePanel');
  if (panel) panel.hidden = !isVisible;
}

function configureCardAvailability() {
  const enabled = isEfiCardTokenizationConfigured();
  const button = document.getElementById('cardMethodButton');
  if (enabled) {
    ACTIVE_PAYMENT_METHODS.add('cartao');
    if (button) button.hidden = false;
  } else {
    ACTIVE_PAYMENT_METHODS.delete('cartao');
    if (button) button.hidden = true;
    if (selectedPaymentMethod === 'cartao') selectedPaymentMethod = 'pix';
  }
  return enabled;
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
    clearAuthStorage();
    throw new Error('LOGIN_REQUIRED');
  }

  if (!response.ok) {
    throw new Error(data?.message || data?.error || text?.trim() || `Erro ${response.status} ao chamar ${url}.`);
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
}

function renderUser(data) {
  currentUserData = data || null;
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

async function checkPaymentStatus(paymentId = currentPaymentId, { silent = false } = {}) {
  if (!paymentId) {
    showAlert('Nao encontramos o identificador do pagamento. Tente gerar novamente.');
    return null;
  }

  const method = currentPaymentMethod || selectedPaymentMethod;
  const button = document.getElementById(method === 'boleto' ? 'verifyBoletoButton' : 'verifyPixButton');
  if (button && !silent) {
    button.disabled = true;
    button.textContent = 'Verificando...';
  }

  try {
    const statusPath = `/pagamentos/efi/status/${encodeURIComponent(paymentId)}`;
    const data = await request(statusPath);
    const statusKey = getStatusKeyFromPayment(data);
    const paymentMethod = isBoletoPayment(data) || method === 'boleto' ? 'boleto' : 'pix';

    if (data.assinatura?.status === 'ativo' || data.assinatura?.estado === 'ativo') {
      hidePixPanel();
      hideBoletoPanel();
      clearSubscribeIntent();
      showStatus('active', 'Pagamento aprovado! Sua assinatura foi ativada.');
      showAlert('Pagamento aprovado! Redirecionando para o painel...', 'success');
      window.setTimeout(() => {
        window.location.href = '/app/';
      }, 1400);
      return data;
    }

    if (statusKey === 'approved') {
      hidePixPanel();
      hideBoletoPanel();
      showStatus('approved', 'Pagamento aprovado. Estamos aguardando a confirmacao final do webhook.');
      showAlert('Pagamento aprovado! Estamos liberando seu acesso.', 'success');
      pollSubscriptionActivation();
      return data;
    }

    if (statusKey === 'pending' || statusKey === 'in_process') {
      if (paymentMethod === 'boleto') {
        const renderedBoleto = renderBoletoPanel(data);
        showStatus('pending', 'Ainda nao identificamos o pagamento do boleto. Aguarde alguns instantes e tente novamente.');
        if (renderedBoleto) {
          showAlert('Ainda nao identificamos o pagamento do boleto. O boleto continua disponivel abaixo.', 'success');
        }
      } else {
        const renderedPix = renderPixPanel(data);
        showStatus('pending', 'Ainda nao identificamos o pagamento. Aguarde alguns instantes e tente novamente.');
        if (renderedPix) {
          showAlert('Ainda nao identificamos o pagamento. Aguarde alguns instantes e tente novamente.', 'success');
        }
      }
      return data;
    }

    hidePixPanel();
    if (paymentMethod === 'boleto') hideBoletoPanel();
    showStatus('failure');
    showAlert(paymentMethod === 'boleto'
      ? 'O boleto foi cancelado ou venceu. Gere um novo boleto e tente novamente.'
      : 'O pagamento foi recusado ou cancelado. Gere um novo pagamento e tente novamente.');
    return data;
  } catch (error) {
    showAlert(error.message || 'Nao foi possivel verificar o pagamento.');
    return null;
  } finally {
    if (button && !silent) {
      button.disabled = false;
      button.textContent = method === 'boleto' ? 'Ja paguei, verificar pagamento' : 'Ja paguei, verificar pagamento';
    }
  }
}

function getStatusKeyFromPayment(payment) {
  const status = normalizePaymentStatus(payment);
  if (['approved', 'received', 'confirmed', 'received_in_cash', 'concluida', 'paid', 'settled'].includes(status)) return 'approved';
  if (['pending', 'authorized', 'awaiting_risk_analysis', 'ativa', 'active', 'aguardando', 'waiting', 'new', 'processing', 'em_processamento'].includes(status)) return 'pending';
  if (status === 'in_process') return 'in_process';
  if (['rejected', 'cancelled', 'canceled', 'expired', 'unpaid', 'refunded', 'charged_back', 'overdue', 'refund_requested', 'chargeback_requested'].includes(status)) return 'failure';
  return 'pending';
}

function setCardLoading(isLoading) {
  const button = document.getElementById('payCardButton');
  if (!button) return;
  button.disabled = isLoading;
  button.textContent = isLoading ? 'Tokenizando...' : 'Pagar com cartao';
}

function setEfiCardVisible(isVisible) {
  const panel = document.getElementById('efiCardPanel');
  if (panel) panel.hidden = !isVisible;
}

function formatCardNumber(value) {
  return onlyDigits(value).slice(0, 19).replace(/(.{4})/g, '$1 ').trim();
}

function formatDocument(value) {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

function formatExpiry(value) {
  const digits = onlyDigits(value).slice(0, 6);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function getCardFormData() {
  const holderName = document.getElementById('cardHolderName').value.trim();
  const holderDocument = onlyDigits(document.getElementById('cardHolderDocument').value);
  const number = onlyDigits(document.getElementById('cardNumber').value);
  const expiry = onlyDigits(document.getElementById('cardExpiry').value);
  const cvv = onlyDigits(document.getElementById('cardCvv').value);
  const installments = Number(document.getElementById('cardInstallments').value || 1);

  if (!holderName) throw new Error('Informe o nome impresso no cartao.');
  if (![11, 14].includes(holderDocument.length)) throw new Error('Informe um CPF ou CNPJ valido.');
  if (number.length < 13 || number.length > 19) throw new Error('Informe um numero de cartao valido.');
  if (expiry.length !== 6) throw new Error('Informe a validade no formato MM/AAAA.');
  const expirationMonth = expiry.slice(0, 2);
  const expirationYear = expiry.slice(2);
  const month = Number(expirationMonth);
  if (month < 1 || month > 12) throw new Error('Mes de validade invalido.');
  if (cvv.length < 3 || cvv.length > 4) throw new Error('Informe um CVV valido.');
  if (!Number.isInteger(installments) || installments < 1 || installments > 12) throw new Error('Parcelas invalidas.');

  return {
    holderName,
    holderDocument,
    number,
    cvv,
    expirationMonth,
    expirationYear,
    installments
  };
}

async function identifyCardBrand(number) {
  const brand = await window.EfiPay.CreditCard
    .setCardNumber(number)
    .verifyCardBrand();

  if (!brand || brand === 'undefined' || brand === 'unsupported') {
    throw new Error('Bandeira do cartao nao suportada pela EFI.');
  }
  return brand;
}

async function generateEfiPaymentToken(cardData, brand) {
  const result = await window.EfiPay.CreditCard
    .setAccount(getEfiPayeeCode())
    .setEnvironment(getEfiTokenEnvironment())
    .setCreditCardData({
      brand,
      number: cardData.number,
      cvv: cardData.cvv,
      expirationMonth: cardData.expirationMonth,
      expirationYear: cardData.expirationYear,
      holderName: cardData.holderName,
      holderDocument: cardData.holderDocument,
      reuse: false
    })
    .getPaymentToken();

  if (!result?.payment_token) {
    throw new Error('A EFI nao retornou o token seguro do cartao.');
  }
  return result;
}

function getCurrentUserEmail() {
  return currentUserData?.user?.email || document.getElementById('userEmail')?.textContent || '';
}

async function submitEfiCardPayment() {
  clearAlert();

  if (!isEfiCardTokenizationConfigured()) {
    showAlert('Pagamento por cartao indisponivel. Tokenizacao EFI nao configurada.');
    return null;
  }

  setCardLoading(true);
  showStatus('pending', 'Tokenizando cartao com seguranca pela EFI.');

  try {
    const cardData = getCardFormData();
    const brand = await identifyCardBrand(cardData.number);
    const tokenized = await generateEfiPaymentToken(cardData, brand);
    showStatus('pending', 'Enviando pagamento para a EFI.');

    const data = await request('/pagamentos/efi/criar-cartao', {
      method: 'POST',
      body: JSON.stringify({
        plano: selectedPlan.id,
        valor: selectedPlan.preco,
        payment: {
          payment_token: tokenized.payment_token,
          installments: cardData.installments,
          holder_name: cardData.holderName,
          email: getCurrentUserEmail(),
          documento: cardData.holderDocument
        }
      })
    });

    const statusKey = getStatusKeyFromPayment(data);
    showStatus(statusKey);

    if (data.assinatura?.status === 'ativo' || data.assinatura?.estado === 'ativo') {
      clearSubscribeIntent();
      showStatus('active', 'Pagamento aprovado! Sua assinatura foi ativada.');
      showAlert('Pagamento aprovado! Redirecionando para o painel...', 'success');
      window.setTimeout(() => {
        window.location.href = '/app/';
      }, 1400);
    } else if (statusKey === 'approved') {
      showAlert('Pagamento aprovado pela EFI Bank. Aguardando confirmacao final.', 'success');
      pollSubscriptionActivation();
    } else if (statusKey === 'pending' || statusKey === 'in_process') {
      showAlert('Pagamento recebido pela EFI Bank e aguardando confirmacao.', 'success');
      pollSubscriptionActivation();
    } else {
      const refusal = data?.refusal?.reason || data?.reason || 'O cartao foi recusado. Revise os dados ou use outro meio de pagamento.';
      showAlert(refusal);
    }

    return data;
  } catch (error) {
    showAlert(error?.error_description || error?.message || 'Nao foi possivel tokenizar ou processar o cartao.');
    return null;
  } finally {
    setCardLoading(false);
  }
}

async function generatePixPayment() {
  clearAlert();
  hidePixPanel();
  setGeneratePixLoading(true);
  showStatus('pending', 'Aguardando pagamento');

  try {
    const data = await request('/pagamentos/efi/criar-pix', {
      method: 'POST',
      body: JSON.stringify({
        plano: selectedPlan.id
      })
    });

    const renderedPix = renderPixPanel(data);
    showStatus('pending', 'Aguardando pagamento');
    if (renderedPix) {
      showAlert('Pix gerado com sucesso', 'success');
    }
    pollSubscriptionActivation();
    return data;
  } catch (error) {
    showAlert(error.message || 'Nao foi possivel gerar o Pix. Tente novamente em alguns instantes.');
    return null;
  } finally {
    setGeneratePixLoading(false);
  }
}

async function generateBoletoPayment() {
  clearAlert();
  hidePixPanel();
  hideBoletoPanel();
  setGeneratePixLoading(true);
  showStatus('pending', 'Aguardando pagamento');

  try {
    const data = await request('/pagamentos/efi/criar-boleto', {
      method: 'POST',
      body: JSON.stringify({
        plano: selectedPlan.id
      })
    });

    renderBoletoPanel(data);
    showStatus('pending', 'Aguardando pagamento do boleto');
    showAlert('Boleto gerado com sucesso', 'success');
    pollSubscriptionActivation();
    return data;
  } catch (error) {
    showAlert(error.message || 'Nao foi possivel gerar o boleto. Tente novamente em alguns instantes.');
    return null;
  } finally {
    setGeneratePixLoading(false);
  }
}

async function selectPaymentMethod(method) {
  if (!ACTIVE_PAYMENT_METHODS.has(method)) {
    selectedPaymentMethod = 'pix';
    method = 'pix';
  }

  selectedPaymentMethod = method;

  document.querySelectorAll('[data-payment-method]').forEach((button) => {
    const isSelected = button.dataset.paymentMethod === method;
    button.classList.toggle('is-selected', isSelected);
    button.setAttribute('aria-pressed', String(isSelected));
  });

  if (method === 'pix') {
    setBrickLoading(false);
    setBrickVisible(false);
    setPixGenerateVisible(true);
    setEfiCardVisible(false);
    setBoletoGenerateVisible(false);
    hideBoletoPanel();
    return;
  }

  setPixGenerateVisible(false);
  hidePixPanel();
  hideBoletoPanel();
  setBrickVisible(false);
  setBrickLoading(false);

  if (method === 'cartao') {
    setEfiCardVisible(true);
    setBoletoGenerateVisible(false);
    return;
  }

  setEfiCardVisible(false);
  setBoletoGenerateVisible(true);
}

function bindCheckoutEvents() {
  document.querySelectorAll('[data-payment-method]').forEach((button) => {
    button.addEventListener('click', () => {
      selectPaymentMethod(button.dataset.paymentMethod);
    });
  });

  document.getElementById('generatePixButton').addEventListener('click', () => {
    generatePixPayment();
  });

  document.getElementById('payCardButton').addEventListener('click', () => {
    submitEfiCardPayment();
  });

  document.getElementById('generateBoletoButton').addEventListener('click', () => {
    generateBoletoPayment();
  });

  document.getElementById('cardNumber').addEventListener('input', (event) => {
    event.target.value = formatCardNumber(event.target.value);
  });

  document.getElementById('cardHolderDocument').addEventListener('input', (event) => {
    event.target.value = formatDocument(event.target.value);
  });

  document.getElementById('cardExpiry').addEventListener('input', (event) => {
    event.target.value = formatExpiry(event.target.value);
  });

  document.getElementById('cardCvv').addEventListener('input', (event) => {
    event.target.value = onlyDigits(event.target.value).slice(0, 4);
  });

  document.getElementById('copyPixButton').addEventListener('click', async () => {
    const code = document.getElementById('pixCode').value;
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
      showAlert('Codigo Pix copiado.', 'success');
    } catch {
      document.getElementById('pixCode').select();
      showAlert('Selecione e copie o codigo Pix manualmente.');
    }
  });

  document.getElementById('verifyPixButton').addEventListener('click', () => {
    checkPaymentStatus();
  });

  document.getElementById('copyBoletoButton').addEventListener('click', async () => {
    const code = document.getElementById('boletoLine').value;
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
      showAlert('Linha digitavel copiada.', 'success');
    } catch {
      document.getElementById('boletoLine').select();
      showAlert('Selecione e copie a linha digitavel manualmente.');
    }
  });

  document.getElementById('verifyBoletoButton').addEventListener('click', () => {
    checkPaymentStatus();
  });
}

async function initCheckout() {
  bindCheckoutEvents();
  configureCardAvailability();
  setBrickVisible(false);
  setBrickLoading(false);
  setPixGenerateVisible(true);
  setEfiCardVisible(false);
  setBoletoGenerateVisible(false);

  const planId = getSelectedPlanId();
  if (isSubscribeIntentUrl()) saveSubscribeIntent(planId);
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
      clearSubscribeIntent();
      setBrickVisible(false);
      setBrickLoading(false);
      setPixGenerateVisible(false);
      setEfiCardVisible(false);
      setBoletoGenerateVisible(false);
      showStatus('active', 'Sua assinatura ja esta ativa. Voce pode voltar ao app.');
      return;
    }

    await selectPaymentMethod(selectedPaymentMethod);
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
  if (statusPoller) window.clearInterval(statusPoller);
});

document.addEventListener('DOMContentLoaded', initCheckout);
