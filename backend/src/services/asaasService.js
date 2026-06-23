import { AppError } from '../middlewares/errorMiddleware.js';

const DEFAULT_BASE_URL = 'https://api.asaas.com/v3';

function getConfig() {
  const apiKey = process.env.ASAAS_API_KEY;
  const baseUrl = (process.env.ASAAS_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');

  if (!apiKey) throw new AppError('ASAAS_API_KEY nao configurada.', 500);
  return { apiKey, baseUrl };
}

const SENSITIVE_KEY_PATTERN = /(token|secret|authorization|password|senha|api_key|apikey|access_token|creditcard|credit_card|card|cvv|number|holder|cpfcnpj|cpf|cnpj|email|phone|mobilephone)/i;

function sanitizeForLog(value, key = '') {
  if (SENSITIVE_KEY_PATTERN.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => sanitizeForLog(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [entryKey, sanitizeForLog(entryValue, entryKey)])
    );
  }
  return value;
}

async function request(path, options = {}) {
  const { apiKey, baseUrl } = getConfig();
  let response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        accept: 'application/json',
        access_token: apiKey,
        'User-Agent': 'FluxMEI/1.0.0',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
  } catch (error) {
    throw new AppError('Nao foi possivel conectar ao Asaas.', 502, error.message);
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const details = Array.isArray(data?.errors)
      ? data.errors.map((item) => item.description || item.message).filter(Boolean).join(' ')
      : '';
    const message = data?.message || data?.error || details || data || 'Erro ao comunicar com o Asaas.';
    throw new AppError(String(message), response.status, sanitizeForLog(data));
  }

  return data;
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function cleanObject(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, item]) => item !== undefined && item !== null && item !== '')
  );
}

function asQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, value);
  });
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeBillingType(method = 'pix') {
  const value = String(method || '').toLowerCase();
  if (value === 'boleto') return 'BOLETO';
  if (value === 'cartao' || value === 'card' || value === 'credit_card') return 'CREDIT_CARD';
  if (value === 'undefined') return 'UNDEFINED';
  return 'PIX';
}

async function buscarClientes(params = {}) {
  return request(`/customers${asQuery(params)}`, { method: 'GET' });
}

async function criarCliente(payload) {
  return request('/customers', {
    method: 'POST',
    body: JSON.stringify(cleanObject(payload))
  });
}

async function criarOuBuscarCliente({ user, profile, existingCustomerId }) {
  if (existingCustomerId) return { id: existingCustomerId, reused: true };

  const name = profile?.nome || user.user_metadata?.nome || user.email;
  const cpfCnpj = onlyDigits(profile?.cpf || profile?.cnpj);
  const mobilePhone = onlyDigits(profile?.whatsapp || profile?.telefone || user.user_metadata?.whatsapp);

  if (cpfCnpj) {
    const foundByDocument = await buscarClientes({ cpfCnpj });
    const first = foundByDocument?.data?.[0];
    if (first?.id) return first;
  }

  return criarCliente({
    name,
    email: user.email,
    cpfCnpj: cpfCnpj || undefined,
    mobilePhone: mobilePhone || undefined,
    externalReference: user.id
  });
}

async function criarCobranca({ customerId, plan, method, externalReference, dueDate }) {
  const billingType = normalizeBillingType(method);
  return request('/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer: customerId,
      billingType,
      value: plan.value,
      dueDate: dueDate || (billingType === 'PIX' ? todayIso() : addDaysIso(3)),
      description: plan.description,
      externalReference
    })
  });
}

async function obterPixQrCode(paymentId) {
  return request(`/payments/${encodeURIComponent(paymentId)}/pixQrCode`, { method: 'GET' });
}

async function consultarPagamento(paymentId) {
  return request(`/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' });
}

export const asaasService = {
  criarOuBuscarCliente,
  criarCobranca,
  consultarPagamento,
  obterPixQrCode,
  normalizeBillingType,
  onlyDigits,
  __test: {
    sanitizeForLog,
    asQuery
  }
};
