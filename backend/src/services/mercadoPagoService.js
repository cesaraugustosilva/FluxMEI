import { AppError } from '../middlewares/errorMiddleware.js';

const DEFAULT_BASE_URL = 'https://api.mercadopago.com';

function getConfig() {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  const baseUrl = (process.env.MERCADO_PAGO_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');

  if (!accessToken) throw new AppError('MERCADO_PAGO_ACCESS_TOKEN nao configurado.', 500);
  return { accessToken, baseUrl };
}

async function request(path, options = {}) {
  const { accessToken, baseUrl } = getConfig();
  let response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'FluxMEI/1.0.0',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
  } catch (error) {
    throw new AppError('Nao foi possivel conectar ao Mercado Pago.', 502, error.message);
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const causeMessage = Array.isArray(data?.cause)
      ? data.cause.map((item) => item.description || item.message).filter(Boolean).join(' ')
      : '';
    const message = data?.message
      || data?.error
      || causeMessage
      || data
      || 'Erro ao comunicar com o Mercado Pago.';
    throw new AppError(message, response.status, data);
  }

  return data;
}

function splitName(fullName = '') {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  return {
    name: parts[0] || '',
    surname: parts.slice(1).join(' ')
  };
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function cleanObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== '')
  );
}

async function criarPreferencia({ plan, user, profile, assinatura, backUrls, notificationUrl }) {
  const ownerName = profile?.nome || user.user_metadata?.nome || user.email || '';
  const payerName = splitName(ownerName);
  const documentNumber = onlyDigits(profile?.cpf || profile?.cnpj);

  const preference = {
    items: [
      {
        id: plan.id,
        title: plan.title,
        description: plan.description,
        quantity: 1,
        currency_id: 'BRL',
        unit_price: plan.value
      }
    ],
    payer: {
      email: user.email,
      name: payerName.name,
      surname: payerName.surname,
      ...(documentNumber ? {
        identification: {
          type: documentNumber.length > 11 ? 'CNPJ' : 'CPF',
          number: documentNumber
        }
      } : {})
    },
    external_reference: assinatura.id,
    metadata: {
      user_id: user.id,
      assinatura_id: assinatura.id,
      plano: plan.id
    },
    payment_methods: {
      installments: 12
    },
    statement_descriptor: 'FLUXMEI',
    binary_mode: false
  };

  preference.payer = cleanObject(preference.payer);

  if (backUrls?.success) {
    preference.back_urls = backUrls;
    preference.auto_return = 'approved';
  }

  if (notificationUrl) preference.notification_url = notificationUrl;

  return request('/checkout/preferences', {
    method: 'POST',
    headers: {
      'X-Idempotency-Key': `${assinatura.id}-${plan.id}-${Date.now()}`
    },
    body: JSON.stringify(preference)
  });
}

async function consultarPagamento(paymentId) {
  return request(`/v1/payments/${paymentId}`, { method: 'GET' });
}

export const mercadoPagoService = {
  criarPreferencia,
  consultarPagamento,
  onlyDigits
};
