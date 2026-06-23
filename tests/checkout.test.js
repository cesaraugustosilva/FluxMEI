import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const checkoutHtml = readFileSync(new URL('../frontend/checkout/index.html', import.meta.url), 'utf8');
const checkoutJs = readFileSync(new URL('../frontend/checkout/checkout.js', import.meta.url), 'utf8');

function createCheckoutHarness(options = {}) {
  const elements = new Map();
  let fetchData = {};
  const fetchCalls = [];

  function element(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        hidden: false,
        value: '',
        textContent: '',
        className: '',
        src: '',
        href: '',
        disabled: false,
        removeAttribute(name) {
          delete this[name];
        },
        setAttribute(name, value) {
          this[name] = value;
        },
        addEventListener() {},
        select() {}
      });
    }
    return elements.get(id);
  }

  [
    'checkoutAlert',
    'pixPanel',
    'pixQrImage',
    'pixCode',
    'boletoPanel',
    'boletoLink',
    'boletoLine',
    'boletoDueDate',
    'userEmail',
    'cardMethodButton',
    'efiCardPanel',
    'cardHolderName',
    'cardHolderDocument',
    'cardNumber',
    'cardExpiry',
    'cardCvv',
    'cardInstallments',
    'payCardButton',
    'statusPanel',
    'statusIcon',
    'statusTitle',
    'statusText'
  ].forEach(element);
  elements.get('pixPanel').hidden = true;
  elements.get('boletoPanel').hidden = true;
  elements.get('efiCardPanel').hidden = true;
  elements.get('cardMethodButton').hidden = true;
  elements.get('cardInstallments').value = '1';

  const context = {
    console,
    URL,
    URLSearchParams,
    localStorage: {
      getItem(key) {
        if (key === 'fluxmei_access_token') return options.localToken ?? 'test-token';
        return null;
      },
      setItem() {},
      removeItem() {}
    },
    sessionStorage: {
      getItem(key) {
        if (key === 'fluxmei_access_token') return options.sessionToken ?? null;
        return null;
      },
      setItem() {},
      removeItem() {}
    },
    navigator: { clipboard: { writeText() {} } },
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });
      return {
      ok: true,
      status: 200,
      headers: { get(header) { return header === 'content-type' ? 'application/json' : ''; } },
      json: async () => ({ ...fetchData }),
      text: async () => ''
      };
    },
    document: {
      getElementById: element,
      querySelectorAll() { return []; },
      querySelector() { return element('queryResult'); },
      addEventListener() {}
    },
    window: {
      FLUXMEI_CONFIG: {
        API_URL: 'http://127.0.0.1/api',
        PAYMENT_GATEWAY: options.paymentGateway || 'asaas',
        EFI_PAYEE_CODE: options.efiPayeeCode || '',
        EFI_ENVIRONMENT: options.efiEnvironment || 'sandbox'
      },
      EfiPay: options.efiPay || null,
      location: { origin: 'http://127.0.0.1', hostname: '127.0.0.1', search: '', href: '' },
      addEventListener() {},
      setTimeout() {},
      setInterval() { return 1; },
      clearInterval() {}
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${checkoutJs}\nglobalThis.__checkoutTest = { renderPixPanel, renderBoletoPanel, checkPaymentStatus, getStatusKeyFromPayment, generatePixPayment, generateBoletoPayment, configureCardAvailability, submitEfiCardPayment, getLoginUrl };`, context);

  return {
    elements,
    api: context.__checkoutTest,
    fetchCalls,
    setFetchData(data) {
      fetchData = data;
    }
  };
}

test('checkout principal usa Asaas para Pix e boleto ativos', () => {
  assert.match(checkoutHtml, /Pagamento seguro processado pelo Asaas\./);
  assert.match(checkoutHtml, /Cartao sera liberado em uma etapa futura/);
  assert.match(checkoutHtml, /id="boletoPanel"/);
  assert.match(checkoutHtml, /data-payment-method="pix"/);
  assert.match(checkoutHtml, /data-payment-method="boleto"/);
  assert.match(checkoutHtml, /data-payment-method="cartao"/);
  assert.match(checkoutHtml, /id="cardMethodButton"[^>]*hidden/);
  assert.match(checkoutHtml, /id="generatePixButton"/);
  assert.match(checkoutHtml, /id="generateBoletoButton"/);
  assert.match(checkoutHtml, /id="payCardButton"/);
  assert.match(checkoutHtml, /Gerar Pix/);
  assert.match(checkoutHtml, /id="pixPanel"/);
  assert.match(checkoutHtml, /id="pixCode"/);
  assert.doesNotMatch(checkoutHtml, /name="paymentProvider"/);
});

test('checkout principal chama rotas Asaas quando PAYMENT_GATEWAY=asaas', () => {
  assert.match(checkoutJs, /\/pagamentos\/asaas\/criar-pix/);
  assert.match(checkoutJs, /\/pagamentos\/asaas\/criar-boleto/);
  assert.match(checkoutJs, /\/pagamentos\/asaas\/status\/\$\{encodeURIComponent\(paymentId\)\}/);
  assert.match(checkoutJs, /generatePixPayment/);
  assert.match(checkoutJs, /generateBoletoPayment/);
  assert.match(checkoutJs, /submitEfiCardPayment/);
  assert.match(checkoutJs, /ACTIVE_PAYMENT_METHODS = new Set\(\['pix', 'boleto'\]\)/);
  assert.match(checkoutJs, /copyPixButton/);
});

test('checkout nao exibe Cartao mesmo com tokenizacao EFI configurada', () => {
  const disabled = createCheckoutHarness();
  assert.equal(disabled.api.configureCardAvailability(), false);
  assert.equal(disabled.elements.get('cardMethodButton').hidden, true);

  const CreditCard = {
    setCardNumber() { return this; },
    verifyCardBrand: async () => 'visa',
    setAccount() { return this; },
    setEnvironment() { return this; },
    setCreditCardData() { return this; },
    getPaymentToken: async () => ({ payment_token: 'token-seguro', card_mask: 'XXXXXXXXXXXX1111' })
  };
  const enabled = createCheckoutHarness({ efiPayeeCode: 'payee-1', efiPay: { CreditCard } });

  assert.equal(enabled.api.configureCardAvailability(), false);
  assert.equal(enabled.elements.get('cardMethodButton').hidden, true);
});

test('cartao permanece desativado e nao chama backend', async () => {
  const CreditCard = {
    setCardNumber() { return this; },
    verifyCardBrand: async () => 'visa',
    setAccount() { return this; },
    setEnvironment() { return this; },
    setCreditCardData() { return this; },
    getPaymentToken: async () => ({ payment_token: 'token-seguro', card_mask: 'XXXXXXXXXXXX1111' })
  };
  const { api, elements, fetchCalls } = createCheckoutHarness({ efiPayeeCode: 'payee-1', efiPay: { CreditCard } });

  await api.submitEfiCardPayment();

  assert.match(elements.get('checkoutAlert').textContent, /cartao ainda nao esta disponivel/i);
  assert.equal(fetchCalls.length, 0);
});

test('gerar Pix chama a rota Asaas de Pix', async () => {
  const { api, fetchCalls, setFetchData } = createCheckoutHarness();
  setFetchData({
    success: true,
    provider: 'asaas',
    payment_id: 'pix-1',
    payment_status: 'ATIVA',
    payment_method_id: 'pix',
    qr_code: '000201-pix'
  });

  await api.generatePixPayment();

  assert.equal(fetchCalls.at(-1).url, 'http://127.0.0.1/api/pagamentos/asaas/criar-pix');
  assert.equal(fetchCalls.at(-1).options.method, 'POST');
  assert.equal(fetchCalls.at(-1).options.headers.Authorization, 'Bearer test-token');
  assert.doesNotMatch(JSON.stringify(fetchCalls), /criar-cartao|payment_token|card_number|cvv/);
});

test('gerar Pix usa token da sessionStorage antes do localStorage', async () => {
  const { api, fetchCalls, setFetchData } = createCheckoutHarness({
    sessionToken: 'session-token',
    localToken: 'local-token'
  });
  setFetchData({
    success: true,
    provider: 'asaas',
    payment_id: 'pix-1',
    payment_status: 'ATIVA',
    payment_method_id: 'pix',
    qr_code: '000201-pix'
  });

  await api.generatePixPayment();

  assert.equal(fetchCalls.at(-1).options.headers.Authorization, 'Bearer session-token');
});

test('gerar boleto chama a rota Asaas de boleto', async () => {
  const { api, fetchCalls, setFetchData } = createCheckoutHarness();
  setFetchData({
    success: true,
    provider: 'asaas',
    payment_id: 'boleto-1',
    payment_status: 'waiting',
    payment_method_id: 'boleto',
    invoice_url: 'https://boleto.example/1',
    digitable_line: '00190.00009'
  });

  await api.generateBoletoPayment();

  assert.equal(fetchCalls.at(-1).url, 'http://127.0.0.1/api/pagamentos/asaas/criar-boleto');
  assert.equal(fetchCalls.at(-1).options.method, 'POST');
  assert.equal(fetchCalls.at(-1).options.headers.Authorization, 'Bearer test-token');
  assert.doesNotMatch(JSON.stringify(fetchCalls), /criar-cartao|payment_token|card_number|cvv/);
});

test('checkout sem token aponta para login com redirect para checkout', () => {
  const { api } = createCheckoutHarness({ localToken: null, sessionToken: null });

  assert.equal(
    api.getLoginUrl('pro_mensal'),
    'http://127.0.0.1/auth/login.html?redirect=%2Fcheckout%2F&intent=subscribe&plan=pro_mensal'
  );
});

test('Pix EFI com status ATIVA renderiza painel', () => {
  const { elements, api } = createCheckoutHarness();

  const rendered = api.renderPixPanel({
    payment_id: 'efi-pix-1',
    payment_status: 'ATIVA',
    payment_method_id: 'pix',
    payment_type_id: 'pix',
    pix: {
      qr_code: '000201-at iva',
      qr_code_base64: 'base64-image'
    }
  });

  assert.equal(rendered, true);
  assert.equal(elements.get('pixPanel').hidden, false);
  assert.equal(elements.get('pixCode').value, '000201-at iva');
  assert.equal(elements.get('pixQrImage').src, 'data:image/png;base64,base64-image');
  assert.equal(elements.get('statusTitle').textContent, '');
});

test('Pix EFI com status pending continua renderizando painel', () => {
  const { elements, api } = createCheckoutHarness();

  const rendered = api.renderPixPanel({
    payment_id: 'efi-pix-2',
    payment_status: 'pending',
    payment_method_id: 'pix',
    payment_type_id: 'pix',
    qr_code: '000201-pending',
    qr_code_base64: 'data:image/png;base64,ready'
  });

  assert.equal(rendered, true);
  assert.equal(elements.get('pixPanel').hidden, false);
  assert.equal(elements.get('pixCode').value, '000201-pending');
  assert.equal(elements.get('pixQrImage').src, 'data:image/png;base64,ready');
});

test('Pix aprovado nao renderiza painel como pendente', () => {
  const { elements, api } = createCheckoutHarness();

  const rendered = api.renderPixPanel({
    payment_id: 'efi-pix-3',
    payment_status: 'approved',
    payment_method_id: 'pix',
    payment_type_id: 'pix',
    qr_code: '000201-approved',
    qr_code_base64: 'base64-image'
  });

  assert.equal(api.getStatusKeyFromPayment({ payment_status: 'approved' }), 'approved');
  assert.equal(rendered, false);
  assert.equal(elements.get('pixPanel').hidden, true);
  assert.equal(elements.get('pixCode').value, '');
});

test('Pix EFI pendente sem QR Code mostra erro amigavel', () => {
  const { elements, api } = createCheckoutHarness();

  const rendered = api.renderPixPanel({
    payment_id: 'efi-pix-4',
    payment_status: 'ATIVA',
    payment_method_id: 'pix',
    payment_type_id: 'pix'
  });

  assert.equal(rendered, false);
  assert.equal(elements.get('pixPanel').hidden, true);
  assert.match(elements.get('checkoutAlert').textContent, /nao recebemos o QR Code/);
});

test('boleto EFI criado renderiza painel com link, linha e vencimento', () => {
  const { elements, api } = createCheckoutHarness();

  const rendered = api.renderBoletoPanel({
    payment_id: '12345',
    payment_status: 'waiting',
    payment_method_id: 'boleto',
    invoice_url: 'https://boleto.example/12345',
    digitable_line: '00190.00009 01234.567890',
    due_date: '2026-06-22'
  });

  assert.equal(rendered, true);
  assert.equal(elements.get('boletoPanel').hidden, false);
  assert.equal(elements.get('boletoLink').href, 'https://boleto.example/12345');
  assert.equal(elements.get('boletoLink').hidden, false);
  assert.equal(elements.get('boletoLine').value, '00190.00009 01234.567890');
  assert.equal(elements.get('boletoDueDate').textContent, 'Vencimento: 2026-06-22');
});

test('verificar boleto pendente nao troca para painel Pix e preserva linha e link', async () => {
  const { elements, api, setFetchData } = createCheckoutHarness();

  api.renderBoletoPanel({
    payment_id: '12345',
    payment_status: 'waiting',
    payment_method_id: 'boleto',
    invoice_url: 'https://boleto.example/12345',
    digitable_line: '00190.00009 01234.567890',
    due_date: '2026-06-22'
  });
  setFetchData({
    success: true,
    provider: 'efi',
    payment_id: '12345',
    payment_status: 'pending',
    payment_method_id: 'boleto'
  });

  await api.checkPaymentStatus();

  assert.equal(elements.get('pixPanel').hidden, true);
  assert.equal(elements.get('pixCode').value, '');
  assert.equal(elements.get('boletoPanel').hidden, false);
  assert.equal(elements.get('boletoLine').value, '00190.00009 01234.567890');
  assert.equal(elements.get('boletoLink').href, 'https://boleto.example/12345');
  assert.equal(elements.get('boletoDueDate').textContent, 'Vencimento: 2026-06-22');
  assert.match(elements.get('checkoutAlert').textContent, /boleto continua disponivel/);
});

test('boleto EFI pago muda estado para aprovado', async () => {
  const { elements, api, setFetchData } = createCheckoutHarness();

  api.renderBoletoPanel({
    payment_id: '12345',
    payment_status: 'waiting',
    payment_method_id: 'boleto',
    invoice_url: 'https://boleto.example/12345',
    digitable_line: '00190.00009 01234.567890'
  });
  setFetchData({
    success: true,
    provider: 'efi',
    payment_id: '12345',
    payment_status: 'paid',
    payment_method_id: 'boleto'
  });

  await api.checkPaymentStatus();

  assert.equal(elements.get('statusTitle').textContent, 'Pagamento aprovado');
  assert.equal(elements.get('boletoPanel').hidden, true);
  assert.match(elements.get('checkoutAlert').textContent, /Pagamento aprovado/);
});

test('boleto EFI vencido mostra aviso adequado', async () => {
  const { elements, api, setFetchData } = createCheckoutHarness();

  api.renderBoletoPanel({
    payment_id: '12345',
    payment_status: 'waiting',
    payment_method_id: 'boleto',
    invoice_url: 'https://boleto.example/12345',
    digitable_line: '00190.00009 01234.567890'
  });
  setFetchData({
    success: true,
    provider: 'efi',
    payment_id: '12345',
    payment_status: 'expired',
    payment_method_id: 'boleto'
  });

  await api.checkPaymentStatus();

  assert.equal(elements.get('statusTitle').textContent, 'Pagamento nao concluido');
  assert.match(elements.get('checkoutAlert').textContent, /boleto foi cancelado ou venceu/);
});

test('checkout nao rearma intent antiga sem query de assinatura', () => {
  assert.match(checkoutJs, /const INTENT_CREATED_AT_KEY = 'fluxmei_intent_created_at'/);
  assert.match(checkoutJs, /function isSubscribeIntentUrl\(\)/);
  assert.match(checkoutJs, /return params\.get\('intent'\) === SUBSCRIBE_INTENT/);
  assert.match(checkoutJs, /if \(isSubscribeIntentUrl\(\)\) saveSubscribeIntent\(planId\)/);
});

test('checkout com assinatura ativa limpa intent de assinatura', () => {
  assert.match(checkoutJs, /if \(subscriptionStatus\?\.estado === 'ativo'\) \{\s*clearSubscribeIntent\(\);/);
  assert.match(checkoutJs, /showStatus\('active', 'Sua assinatura ja esta ativa\. Voce pode voltar ao app\.'\)/);
});
