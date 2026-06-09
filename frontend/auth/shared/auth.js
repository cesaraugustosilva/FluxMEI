'use strict';

const AUTH_MESSAGES = {
  required: 'Preencha este campo.',
  email: 'Informe um email válido.',
  passwordMin: 'A senha precisa ter pelo menos 8 caracteres.',
  confirmPassword: 'As senhas precisam ser iguais.',
  terms: 'Você precisa aceitar os Termos de Uso.',
  loginError: 'Email ou senha inválidos.',
  registerSuccess: 'Conta criada com sucesso.',
  resetSuccess: 'Enviamos um link para seu email.'
};

function normalizeApiUrl(url) {
  return String(url || '').replace(/\/$/, '');
}

function resolveApiUrls() {
  const apiUrl = normalizeApiUrl(window.FLUXMEI_CONFIG?.API_URL);
  if (!apiUrl) throw new Error('FLUXMEI_CONFIG.API_URL nao configurada.');
  return [apiUrl];
}

const API_URLS = resolveApiUrls();
const TOKEN_KEY = 'fluxmei_access_token';
const USER_KEY = 'fluxmei_user';
const INTENT_KEY = 'fluxmei_intent';
const PLAN_KEY = 'fluxmei_subscribe_plan';
const SUBSCRIBE_INTENT = 'subscribe';
const DEFAULT_SUBSCRIBE_PLAN = 'pro_mensal';

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function apiRequest(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  let url = '';

  for (const apiUrl of API_URLS) {
    url = `${apiUrl}${path}`;
    try {
      response = await fetch(url, {
        ...options,
        headers
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
    clearSession();
    throw new Error('Sua sessão expirou. Faça login novamente.');
  }

  if (!response.ok) {
    if (!data?.error && text?.trim()) throw new Error(text.trim());
    if (!data?.error) throw new Error(`Erro ${response.status} ao chamar ${url}.`);
    throw new Error(data?.error || 'Não foi possível concluir a solicitação.');
  }

  return data;
}

function saveSession(authData) {
  const token = authData?.session?.access_token;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  if (authData?.user) localStorage.setItem(USER_KEY, JSON.stringify(authData.user));
}

function saveTokenFromUrl() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  const token = hash.get('access_token') || query.get('access_token');

  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    window.history.replaceState(null, document.title, window.location.pathname);
  }

  return token || localStorage.getItem(TOKEN_KEY);
}

function getField(form, name) {
  return form.elements[name];
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value).trim());
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function setFieldError(field, message) {
  const wrapper = field.closest('.field');
  const error = wrapper ? wrapper.querySelector('.field-error') : null;

  if (wrapper) {
    wrapper.classList.toggle('has-error', Boolean(message));
    wrapper.classList.toggle('is-valid', !message && Boolean(field.value.trim()));
  }

  if (error) {
    error.textContent = message || '';
  }
}

function setTermsError(form, message) {
  const error = form.querySelector('.terms-error');
  if (error) {
    error.textContent = message || '';
  }
}

function showAlert(form, message, type = 'error') {
  const alert = form.querySelector('[data-form-alert]');
  if (!alert) return;

  alert.textContent = message;
  alert.className = `alert show ${type}`;
}

function clearAlert(form) {
  const alert = form.querySelector('[data-form-alert]');
  if (!alert) return;

  alert.textContent = '';
  alert.className = 'alert';
}

function setLoading(form, loading) {
  const button = form.querySelector('.submit-btn');
  if (!button) return;

  button.disabled = loading;
  button.classList.toggle('is-loading', loading);
  button.textContent = loading ? button.dataset.loadingText : button.dataset.defaultText;
}

function validateRequired(field, customMessage = AUTH_MESSAGES.required) {
  const invalid = !String(field.value || '').trim();
  setFieldError(field, invalid ? customMessage : '');
  return !invalid;
}

function validateEmailField(field) {
  if (!validateRequired(field)) return false;

  const valid = isEmail(field.value);
  setFieldError(field, valid ? '' : AUTH_MESSAGES.email);
  return valid;
}

function validatePasswordField(field, requireMinLength = false) {
  if (!validateRequired(field)) return false;

  if (requireMinLength && field.value.length < 8) {
    setFieldError(field, AUTH_MESSAGES.passwordMin);
    return false;
  }

  setFieldError(field, '');
  return true;
}

function validateLogin(form) {
  const emailValid = validateEmailField(getField(form, 'email'));
  const passwordValid = validatePasswordField(getField(form, 'password'));
  return emailValid && passwordValid;
}

function validateRegister(form) {
  const fullNameValid = validateRequired(getField(form, 'fullName'));
  const emailValid = validateEmailField(getField(form, 'email'));
  const whatsappValid = validateRequired(getField(form, 'whatsapp'), 'Informe seu WhatsApp.');
  const businessTypeValid = validateRequired(getField(form, 'businessType'), 'Digite o tipo de negócio.');
  const passwordValid = validatePasswordField(getField(form, 'password'), true);
  const confirmPassword = getField(form, 'confirmPassword');
  const terms = getField(form, 'terms');

  let confirmValid = validateRequired(confirmPassword);
  if (confirmValid && confirmPassword.value !== getField(form, 'password').value) {
    setFieldError(confirmPassword, AUTH_MESSAGES.confirmPassword);
    confirmValid = false;
  }

  if (confirmValid) {
    setFieldError(confirmPassword, '');
  }

  const termsValid = Boolean(terms.checked);
  setTermsError(form, termsValid ? '' : AUTH_MESSAGES.terms);

  return fullNameValid && emailValid && whatsappValid && businessTypeValid && passwordValid && confirmValid && termsValid;
}

function validateReset(form) {
  return validateEmailField(getField(form, 'email'));
}

function validateNewPassword(form) {
  const passwordValid = validatePasswordField(getField(form, 'password'), true);
  const confirmPassword = getField(form, 'confirmPassword');

  let confirmValid = validateRequired(confirmPassword);
  if (confirmValid && confirmPassword.value !== getField(form, 'password').value) {
    setFieldError(confirmPassword, AUTH_MESSAGES.confirmPassword);
    confirmValid = false;
  }

  if (confirmValid) setFieldError(confirmPassword, '');
  return passwordValid && confirmValid;
}

function updateSubmitState(form) {
  const button = form.querySelector('.submit-btn');
  if (!button || button.classList.contains('is-loading')) return;

  const type = form.dataset.authForm;
  const fields = Array.from(form.querySelectorAll('input[required], select[required]'));
  const hasEmptyRequired = fields.some((field) => {
    if (field.type === 'checkbox') return !field.checked;
    return !String(field.value || '').trim();
  });

  const password = getField(form, 'password');
  const confirmPassword = getField(form, 'confirmPassword');
  const checksPasswordConfirmation = type === 'register' || type === 'new-password';
  const hasPasswordMismatch = checksPasswordConfirmation && password && confirmPassword && confirmPassword.value && password.value !== confirmPassword.value;
  const hasShortPassword = checksPasswordConfirmation && password && password.value && password.value.length < 8;

  button.disabled = hasEmptyRequired || hasPasswordMismatch || hasShortPassword;
}

function maskWhatsapp(input) {
  const digits = onlyDigits(input.value).slice(0, 11);
  const ddd = digits.slice(0, 2);
  const first = digits.length > 10 ? digits.slice(2, 7) : digits.slice(2, 6);
  const second = digits.length > 10 ? digits.slice(7, 11) : digits.slice(6, 10);

  if (digits.length <= 2) {
    input.value = ddd ? `(${ddd}` : '';
  } else if (!second) {
    input.value = `(${ddd}) ${first}`;
  } else {
    input.value = `(${ddd}) ${first}-${second}`;
  }
}

async function login(payload) {
  const data = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: payload.email,
      password: payload.password
    })
  });

  saveSession(data);
  return data;
}

async function register(payload) {
  const body = {
    nome: payload.fullName,
    nome_negocio: payload.businessName,
    email: payload.email,
    whatsapp: payload.whatsapp,
    tipo_negocio: payload.businessType,
    password: payload.password
  };

  if (hasSubscribeIntent()) {
    body.subscription_intent = SUBSCRIBE_INTENT;
    body.plano = getSubscribePlan();
  }

  return apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

async function resetPassword(email) {
  return apiRequest('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
}

async function updatePassword(password) {
  return apiRequest('/auth/update-password', {
    method: 'POST',
    body: JSON.stringify({ password })
  });
}

async function logout() {
  try {
    await apiRequest('/auth/logout', { method: 'POST' });
  } finally {
    clearSession();
  }
  return true;
}

function captureIntentFromUrl() {
  const query = new URLSearchParams(window.location.search);
  if (query.get('intent') !== SUBSCRIBE_INTENT) return;

  const plan = query.get('plan') || DEFAULT_SUBSCRIBE_PLAN;
  localStorage.setItem(INTENT_KEY, SUBSCRIBE_INTENT);
  localStorage.setItem(PLAN_KEY, plan);
}

function hasSubscribeIntent() {
  return localStorage.getItem(INTENT_KEY) === SUBSCRIBE_INTENT;
}

function getSubscribePlan() {
  return localStorage.getItem(PLAN_KEY) || DEFAULT_SUBSCRIBE_PLAN;
}

function getSubscribePlanLabel() {
  return getSubscribePlan() === 'pro_anual' ? 'Plano Pro Anual' : 'Plano Pro Mensal';
}

function getPaymentIntentUrl() {
  const url = new URL('../../app/payment/index.html', window.location.href);
  url.searchParams.set('intent', SUBSCRIBE_INTENT);
  url.searchParams.set('plan', getSubscribePlan());
  return url.href;
}

function getLoginIntentUrl() {
  const url = new URL('../login/index.html', window.location.href);
  url.searchParams.set('intent', SUBSCRIBE_INTENT);
  url.searchParams.set('plan', getSubscribePlan());
  return url.href;
}

function redirectAfterAuth(defaultUrl) {
  window.location.href = hasSubscribeIntent() ? getPaymentIntentUrl() : defaultUrl;
}

function decorateIntentLinks() {
  if (!hasSubscribeIntent()) return;

  document.querySelectorAll('a[href*="../login/index.html"], a[href*="../cadastro/index.html"]').forEach((link) => {
    const url = new URL(link.getAttribute('href'), window.location.href);
    url.searchParams.set('intent', SUBSCRIBE_INTENT);
    url.searchParams.set('plan', getSubscribePlan());
    link.href = url.href;
  });
}

function applySubscribeIntentCopy() {
  if (!hasSubscribeIntent()) return;

  const planLabel = getSubscribePlanLabel();
  const eyebrow = document.querySelector('[data-register-eyebrow]');
  const title = document.querySelector('[data-register-title]');
  const subtitle = document.querySelector('[data-register-subtitle]');
  const submit = document.querySelector('[data-register-submit]');
  const registerLink = document.querySelector('[data-register-link]');

  if (eyebrow) eyebrow.textContent = 'Assinatura direta';
  if (title) title.textContent = `Criar conta para assinar o ${planLabel}`;
  if (subtitle) subtitle.textContent = 'Depois do cadastro/login, você será levado ao checkout do Mercado Pago.';

  if (submit) {
    submit.dataset.defaultText = 'Continuar para pagamento';
    submit.textContent = 'Continuar para pagamento';
  }

  if (registerLink) registerLink.textContent = 'Criar conta para assinar';
}

async function handleLogin(form) {
  if (!validateLogin(form)) return;

  const payload = {
    email: getField(form, 'email').value.trim(),
    password: getField(form, 'password').value,
    remember: getField(form, 'remember').checked
  };

  setLoading(form, true);
  clearAlert(form);

  try {
    await login(payload);
    showAlert(form, 'Login realizado com sucesso.', 'success');
    redirectAfterAuth('../../app/index.html');
  } catch (error) {
    showAlert(form, error.message || AUTH_MESSAGES.loginError, 'error');
  } finally {
    setLoading(form, false);
    updateSubmitState(form);
  }
}

async function handleRegister(form) {
  if (!validateRegister(form)) return;

  const payload = {
    fullName: getField(form, 'fullName').value.trim(),
    businessName: getField(form, 'businessName').value.trim(),
    email: getField(form, 'email').value.trim(),
    whatsapp: getField(form, 'whatsapp').value.trim(),
    businessType: getField(form, 'businessType').value.trim(),
    password: getField(form, 'password').value
  };

  setLoading(form, true);
  clearAlert(form);

  try {
    const data = await register(payload);

    if (hasSubscribeIntent() && !data.email_confirmation_required) {
      showAlert(form, 'Conta criada. Abrindo checkout...', 'success');
      await login({ email: payload.email, password: payload.password });
      redirectAfterAuth('../../app/index.html');
      return;
    }

    showAlert(
      form,
      data.email_confirmation_required
        ? 'Conta criada. Confirme seu email antes de entrar.'
        : AUTH_MESSAGES.registerSuccess,
      'success'
    );
    form.reset();
    form.querySelectorAll('.field').forEach((field) => field.classList.remove('has-error', 'is-valid'));
    setTermsError(form, '');
    window.setTimeout(() => {
      window.location.href = hasSubscribeIntent() ? getLoginIntentUrl() : '../login/index.html';
    }, 900);
  } catch (error) {
    showAlert(form, error.message || 'Não foi possível criar sua conta agora.', 'error');
  } finally {
    setLoading(form, false);
    updateSubmitState(form);
  }
}

async function handleReset(form) {
  if (!validateReset(form)) return;

  const email = getField(form, 'email').value.trim();

  setLoading(form, true);
  clearAlert(form);

  try {
    await resetPassword(email);
    showAlert(form, AUTH_MESSAGES.resetSuccess, 'success');
  } catch (error) {
    showAlert(form, error.message || 'Não foi possível enviar o link agora.', 'error');
  } finally {
    setLoading(form, false);
    updateSubmitState(form);
  }
}

async function handleNewPassword(form) {
  if (!validateNewPassword(form)) return;

  if (!saveTokenFromUrl()) {
    showAlert(form, 'Link de recuperaÃ§Ã£o invÃ¡lido ou expirado.', 'error');
    return;
  }

  setLoading(form, true);
  clearAlert(form);

  try {
    await updatePassword(getField(form, 'password').value);
    showAlert(form, 'Senha atualizada com sucesso.', 'success');
    window.setTimeout(() => {
      window.location.href = '../login/index.html';
    }, 900);
  } catch (error) {
    showAlert(form, error.message || 'NÃ£o foi possÃ­vel atualizar a senha agora.', 'error');
  } finally {
    setLoading(form, false);
    updateSubmitState(form);
  }
}

function bindPasswordToggles(root = document) {
  root.querySelectorAll('[data-toggle-password]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = button.parentElement.querySelector('input');
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      button.setAttribute('aria-label', isPassword ? 'Ocultar senha' : 'Mostrar senha');
    });
  });
}

function bindRealtimeValidation(form) {
  form.querySelectorAll('input, select').forEach((field) => {
    field.addEventListener('input', () => {
      clearAlert(form);

      if (field.name === 'whatsapp') {
        maskWhatsapp(field);
      }

      if (field.name === 'email' && field.value.trim()) {
        validateEmailField(field);
      } else if (field.required && field.type !== 'checkbox' && field.value.trim()) {
        if (field.name === 'password' && ['register', 'new-password'].includes(form.dataset.authForm)) {
          validatePasswordField(field, true);
        } else {
          setFieldError(field, '');
        }
      }

      if (field.name === 'confirmPassword' && field.value) {
        const password = getField(form, 'password');
        setFieldError(field, field.value === password.value ? '' : AUTH_MESSAGES.confirmPassword);
      }

      if (field.name === 'terms') {
        setTermsError(form, field.checked ? '' : AUTH_MESSAGES.terms);
      }

      updateSubmitState(form);
    });

    field.addEventListener('blur', () => {
      if (field.required && field.type !== 'checkbox') {
        if (field.name === 'email') validateEmailField(field);
        else if (field.name === 'password' && ['register', 'new-password'].includes(form.dataset.authForm)) validatePasswordField(field, true);
        else if (field.value.trim()) setFieldError(field, '');
      }

      updateSubmitState(form);
    });
  });
}

function bindForms() {
  document.querySelectorAll('[data-auth-form]').forEach((form) => {
    bindRealtimeValidation(form);
    updateSubmitState(form);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      clearAlert(form);

      const type = form.dataset.authForm;
      if (type === 'login') handleLogin(form);
      if (type === 'register') handleRegister(form);
      if (type === 'reset') handleReset(form);
      if (type === 'new-password') handleNewPassword(form);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  captureIntentFromUrl();
  if (document.querySelector('[data-auth-form="new-password"]')) saveTokenFromUrl();
  bindPasswordToggles();
  bindForms();
  decorateIntentLinks();
  applySubscribeIntentCopy();
});

window.FluxMEIAuth = {
  login,
  register,
  resetPassword,
  updatePassword,
  logout,
  apiRequest
};
