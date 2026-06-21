import fs from 'node:fs';
import https from 'node:https';
import { URL } from 'node:url';
import { AppError } from '../middlewares/errorMiddleware.js';

const PIX_BASE_URLS = {
  sandbox: 'https://pix-h.api.efipay.com.br',
  production: 'https://pix.api.efipay.com.br'
};

const CHARGES_BASE_URLS = {
  sandbox: 'https://cobrancas-h.api.efipay.com.br',
  production: 'https://cobrancas.api.efipay.com.br'
};

let tokenCache = null;

function getEnvironment() {
  return process.env.EFI_ENVIRONMENT === 'production' || process.env.EFI_SANDBOX === 'false'
    ? 'production'
    : 'sandbox';
}

function getConfig() {
  const clientId = process.env.EFI_CLIENT_ID;
  const clientSecret = process.env.EFI_CLIENT_SECRET;
  const pixKey = process.env.EFI_PIX_KEY;
  const certPath = process.env.EFI_CERT_PATH;
  const certBase64 = process.env.EFI_CERT_BASE64;
  const sandbox = process.env.EFI_SANDBOX;
  const webhookSecret = process.env.EFI_WEBHOOK_SECRET;
  const environment = getEnvironment();

  if (!clientId) throw new AppError('EFI_CLIENT_ID nao configurado.', 500);
  if (!clientSecret) throw new AppError('EFI_CLIENT_SECRET nao configurado.', 500);
  if (!pixKey) throw new AppError('EFI_PIX_KEY nao configurada.', 500);
  if (!certPath && !certBase64) throw new AppError('EFI_CERT_PATH ou EFI_CERT_BASE64 nao configurado.', 500);
  if (!sandbox) throw new AppError('EFI_SANDBOX nao configurado.', 500);
  if (!webhookSecret) throw new AppError('EFI_WEBHOOK_SECRET nao configurado.', 500);

  return {
    clientId,
    clientSecret,
    pixKey,
    environment,
    pixBaseUrl: (process.env.EFI_PIX_BASE_URL || PIX_BASE_URLS[environment]).replace(/\/$/, ''),
    chargesBaseUrl: (process.env.EFI_CHARGES_BASE_URL || CHARGES_BASE_URLS[environment]).replace(/\/$/, ''),
    cert: certBase64 ? Buffer.from(certBase64, 'base64') : fs.readFileSync(certPath)
  };
}

function buildAgent(config) {
  return new https.Agent({
    pfx: config.cert,
    passphrase: process.env.EFI_CERT_PASSPHRASE || undefined
  });
}

function parseResponseBody(response, body) {
  if (!body) return null;
  const contentType = response.headers['content-type'] || '';
  if (!contentType.includes('application/json')) return body;

  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function httpsRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const request = https.request({
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: options.method || 'GET',
      headers: options.headers || {},
      agent: options.agent
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        responseBody += chunk;
      });
      response.on('end', () => {
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          headers: response.headers,
          data: parseResponseBody(response, responseBody)
        });
      });
    });

    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

async function request(baseUrl, path, { method = 'GET', body = null, headers = {}, auth = true } = {}) {
  const config = getConfig();
  const token = auth ? await getAccessToken(config, baseUrl) : null;
  const payload = body ? JSON.stringify(body) : null;

  let response;
  try {
    response = await httpsRequest(`${baseUrl}${path}`, {
      method,
      agent: buildAgent(config),
      headers: {
        accept: 'application/json',
        'User-Agent': 'FluxMEI/1.0.0',
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      }
    }, payload);
  } catch (error) {
    throw new AppError('Nao foi possivel conectar a EFI Bank.', 502, error.message);
  }

  if (!response.ok) {
    const data = response.data;
    const message = data?.mensagem
      || data?.message
      || data?.error_description
      || data?.error
      || data
      || 'Erro ao comunicar com a EFI Bank.';
    throw new AppError(String(message), response.status, data);
  }

  return response.data;
}

async function getAccessToken(config = getConfig(), baseUrl = config.pixBaseUrl) {
  const now = Date.now();
  if (tokenCache?.token && tokenCache.expiresAt > now && tokenCache.baseUrl === baseUrl) return tokenCache.token;

  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const payload = JSON.stringify({ grant_type: 'client_credentials' });
  let response;

  try {
    response = await httpsRequest(`${baseUrl}/oauth/token`, {
      method: 'POST',
      agent: buildAgent(config),
      headers: {
        accept: 'application/json',
        authorization: `Basic ${credentials}`,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload)
      }
    }, payload);
  } catch (error) {
    throw new AppError('Nao foi possivel autenticar na EFI Bank.', 502, error.message);
  }

  if (!response.ok || !response.data?.access_token) {
    throw new AppError('EFI Bank nao retornou token de acesso.', response.status || 502, response.data);
  }

  tokenCache = {
    token: response.data.access_token,
    baseUrl,
    expiresAt: now + Math.max(Number(response.data.expires_in || 300) - 60, 60) * 1000
  };

  return tokenCache.token;
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function moneyString(value) {
  return Number(value || 0).toFixed(2);
}

function moneyCents(value) {
  return Math.round(Number(value || 0) * 100);
}

function splitName(fullName = '') {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  return {
    name: parts[0] || '',
    surname: parts.slice(1).join(' ')
  };
}

function cleanObject(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, item]) => item !== undefined && item !== null && item !== '')
  );
}

function normalizeCustomer({ user, profile }) {
  const documentNumber = onlyDigits(profile?.cpf || profile?.cnpj);
  const ownerName = profile?.nome || user.user_metadata?.nome || user.email || 'Cliente FluxMEI';
  const { name, surname } = splitName(ownerName);

  return cleanObject({
    name: `${name}${surname ? ` ${surname}` : ''}`.trim(),
    email: user.email,
    cpf: documentNumber.length === 11 ? documentNumber : undefined,
    cnpj: documentNumber.length === 14 ? documentNumber : undefined,
    phone_number: onlyDigits(profile?.telefone || profile?.phone)
  });
}

function withFluxmeiMetadata(payment, metadata) {
  return {
    ...payment,
    metadata,
    fluxmei_metadata: metadata
  };
}

function buildTxid(assinaturaId, planId) {
  const base = `fx${String(assinaturaId || '').replace(/[^a-zA-Z0-9]/g, '')}${String(planId || '').replace(/[^a-zA-Z0-9]/g, '')}`;
  return base.slice(0, 35).padEnd(26, '0');
}

async function criarPix({ plan, user, profile, assinatura, idempotencyKey }) {
  const config = getConfig();
  if (!config.pixKey) throw new AppError('EFI_PIX_KEY nao configurada.', 500);

  const txid = buildTxid(`${assinatura.id}${Date.now()}`, plan.id);
  const customer = normalizeCustomer({ user, profile });
  const metadata = {
    user_id: user.id,
    assinatura_id: assinatura.id,
    plano: plan.id
  };

  const devedor = cleanObject({
    nome: customer.name,
    cpf: customer.cpf,
    cnpj: customer.cnpj
  });

  const charge = await request(config.pixBaseUrl, `/v2/cob/${txid}`, {
    method: 'PUT',
    headers: idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {},
    body: {
      calendario: { expiracao: 3600 },
      ...(Object.keys(devedor).length ? { devedor } : {}),
      valor: { original: moneyString(plan.value) },
      chave: config.pixKey,
      solicitacaoPagador: plan.description
    }
  });

  let qrcode = null;
  if (charge?.loc?.id) {
    qrcode = await request(config.pixBaseUrl, `/v2/loc/${encodeURIComponent(charge.loc.id)}/qrcode`);
  }

  return {
    payment: withFluxmeiMetadata({
      ...charge,
      id: charge?.txid || txid,
      txid: charge?.txid || txid,
      status: charge?.status || 'ATIVA',
      amount: plan.value,
      payment_method_id: 'pix',
      method: 'pix'
    }, metadata),
    qrcode
  };
}

async function criarBoleto({ plan, user, profile, assinatura, idempotencyKey }) {
  const config = getConfig();
  const customer = normalizeCustomer({ user, profile });
  const metadata = {
    user_id: user.id,
    assinatura_id: assinatura.id,
    plano: plan.id
  };

  const charge = await request(config.chargesBaseUrl, '/v1/charge/one-step', {
    method: 'POST',
    headers: idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {},
    body: {
      items: [{ name: plan.title, value: moneyCents(plan.value), amount: 1 }],
      metadata: { custom_id: `${user.id}:${assinatura.id}:${plan.id}`, notification_url: getWebhookUrl() },
      payment: {
        banking_billet: {
          expire_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          customer,
          message: plan.description
        }
      }
    }
  });

  return withFluxmeiMetadata({
    ...charge,
    id: charge?.charge_id || charge?.id,
    charge_id: charge?.charge_id || charge?.id,
    status: charge?.status || 'waiting',
    amount: plan.value,
    payment_method_id: 'boleto',
    method: 'boleto',
    custom_id: `${user.id}:${assinatura.id}:${plan.id}`
  }, metadata);
}

async function criarCartao({ plan, user, profile, assinatura, card, idempotencyKey }) {
  const paymentToken = card?.payment_token || card?.paymentToken || card?.token;
  if (!paymentToken) {
    throw new AppError('Token seguro do cartao nao informado. Tokenize o cartao pelo fluxo seguro da EFI antes de enviar ao backend.', 400);
  }

  const config = getConfig();
  const customer = normalizeCustomer({ user, profile });
  const metadata = {
    user_id: user.id,
    assinatura_id: assinatura.id,
    plano: plan.id
  };

  const charge = await request(config.chargesBaseUrl, '/v1/charge/one-step', {
    method: 'POST',
    headers: idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {},
    body: {
      items: [{ name: plan.title, value: moneyCents(plan.value), amount: 1 }],
      metadata: { custom_id: `${user.id}:${assinatura.id}:${plan.id}`, notification_url: getWebhookUrl() },
      payment: {
        credit_card: {
          installments: Number(card?.installments || 1),
          payment_token: paymentToken,
          customer,
          billing_address: card?.billing_address || card?.billingAddress || undefined
        }
      }
    }
  });

  return withFluxmeiMetadata({
    ...charge,
    id: charge?.charge_id || charge?.id,
    charge_id: charge?.charge_id || charge?.id,
    status: charge?.status || 'waiting',
    amount: plan.value,
    payment_method_id: 'cartao',
    method: 'cartao',
    custom_id: `${user.id}:${assinatura.id}:${plan.id}`
  }, metadata);
}

async function consultarPagamento(paymentId) {
  const config = getConfig();
  const normalizedId = String(paymentId || '');

  if (/^[A-Za-z0-9]{26,35}$/.test(normalizedId) && normalizedId.startsWith('fx')) {
    const payment = await request(config.pixBaseUrl, `/v2/cob/${encodeURIComponent(normalizedId)}`);
    return {
      ...payment,
      id: payment?.txid || normalizedId,
      txid: payment?.txid || normalizedId,
      payment_method_id: 'pix',
      method: 'pix',
      amount: Number(payment?.valor?.original || 0)
    };
  }

  const payment = await request(config.chargesBaseUrl, `/v1/charge/${encodeURIComponent(normalizedId)}`);
  return {
    ...payment,
    id: payment?.charge_id || payment?.id || normalizedId,
    charge_id: payment?.charge_id || payment?.id || normalizedId,
    amount: payment?.total ? Number(payment.total) / 100 : undefined
  };
}

function getWebhookUrl() {
  if (process.env.EFI_WEBHOOK_URL) return process.env.EFI_WEBHOOK_URL;
  const publicUrl = (process.env.PUBLIC_URL || process.env.APP_PUBLIC_URL || '').replace(/\/$/, '');
  return publicUrl ? `${publicUrl}/api/webhooks/efi` : undefined;
}

export const efiBankService = {
  criarPix,
  criarBoleto,
  criarCartao,
  consultarPagamento,
  onlyDigits
};
