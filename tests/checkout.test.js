import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const checkoutHtml = readFileSync(new URL('../frontend/checkout/index.html', import.meta.url), 'utf8');
const checkoutJs = readFileSync(new URL('../frontend/checkout/checkout.js', import.meta.url), 'utf8');
const successHtml = readFileSync(new URL('../frontend/checkout/success.html', import.meta.url), 'utf8');
const successJs = readFileSync(new URL('../frontend/checkout/success.js', import.meta.url), 'utf8');

function createCheckoutHarness(options = {}) {
  const elements = new Map();
  let fetchData = {};
  const fetchCalls = [];

  function element(id) {
    if (!elements.has(id)) {
      const node = {
        id,
        hidden: false,
        _value: '',
        _innerHTML: '',
        options: [],
        textContent: '',
        className: '',
        src: '',
        href: '',
        disabled: false,
        get value() {
          return this._value;
        },
        set value(nextValue) {
          this._value = String(nextValue ?? '');
        },
        get innerHTML() {
          return this._innerHTML;
        },
        set innerHTML(nextValue) {
          this._innerHTML = String(nextValue ?? '');
          if (this.id === 'cardInstallments') this.options = [];
        },
        appendChild(child) {
          if (this.id === 'cardInstallments') this.options.push(child);
          return child;
        },
        querySelector() {
          return null;
        },
        removeAttribute(name) {
          delete this[name];
        },
        setAttribute(name, value) {
          this[name] = value;
        },
        addEventListener() {},
        select() {}
      };
      elements.set(id, node);
    }
    return elements.get(id);
  }

  [
    'checkoutAlert',
    'planName',
    'planPrice',
    'planCycle',
    'planEconomyBadge',
    'planSavingsBadge',
    'planEconomyText',
    'planInstallmentText',
    'planRenewalText',
    'billingDocument',
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
    'cardHolderEmail',
    'cardHolderPhone',
    'cardPostalCode',
    'cardAddressNumber',
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
  elements.get('billingDocument').value = options.billingDocument ?? '123.456.789-01';
  elements.get('cardHolderName').value = 'Cliente FluxMEI';
  elements.get('cardHolderDocument').value = '123.456.789-09';
  elements.get('cardHolderEmail').value = 'cliente@example.com';
  elements.get('cardHolderPhone').value = '11999998888';
  elements.get('cardPostalCode').value = '01310-000';
  elements.get('cardAddressNumber').value = '100';
  elements.get('cardNumber').value = '4111 1111 1111 1111';
  elements.get('cardExpiry').value = '12/2030';
  elements.get('cardCvv').value = '123';
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
      createElement(tagName) {
        return { tagName: String(tagName).toUpperCase(), value: '', textContent: '' };
      },
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
      location: { origin: 'http://127.0.0.1', hostname: '127.0.0.1', search: options.search || '', href: '' },
      addEventListener() {},
      setTimeout(callback) {
        if (options.runTimers && typeof callback === 'function') callback();
        return 1;
      },
      setInterval() { return 1; },
      clearInterval() {}
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${checkoutJs}\nglobalThis.__checkoutTest = { renderPlan, getSelectedPlanId, renderPixPanel, renderBoletoPanel, checkPaymentStatus, getStatusKeyFromPayment, generatePixPayment, generateBoletoPayment, configureCardAvailability, renderCardInstallments, isPlanSwitchCheckout, submitCardPayment, submitAsaasCardPayment, submitEfiCardPayment, getLoginUrl };`, context);

  return {
    elements,
    api: context.__checkoutTest,
    fetchCalls,
    location: context.window.location,
    setFetchData(data) {
      fetchData = data;
    }
  };
}

function createSuccessHarness(options = {}) {
  const elements = new Map();
  const session = new Map(Object.entries(options.session || {}));
  const local = new Map();
  if (options.token !== null) session.set('fluxmei_access_token', options.token || 'test-token');

  function element(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        textContent: '',
        href: '',
        setAttribute(name, value) {
          this[name] = value;
        },
        addEventListener() {}
      });
    }
    return elements.get(id);
  }

  [
    'successPlan',
    'successMethod',
    'successDate',
    'successStatus',
    'successNote',
    'dashboardButton',
    'accountButton'
  ].forEach(element);

  const context = {
    console,
    URL,
    localStorage: {
      getItem(key) { return local.get(key) || null; },
      setItem(key, value) { local.set(key, String(value)); },
      removeItem(key) { local.delete(key); }
    },
    sessionStorage: {
      getItem(key) { return session.get(key) || null; },
      setItem(key, value) { session.set(key, String(value)); },
      removeItem(key) { session.delete(key); }
    },
    fetch: async (url) => {
      if (String(url).endsWith('/auth/me')) {
        return {
          ok: true,
          status: 200,
          json: async () => options.me || { user: { email: 'cliente@example.com' } }
        };
      }
      if (String(url).endsWith('/assinaturas/status')) {
        return {
          ok: true,
          status: 200,
          json: async () => options.subscriptionStatus || { estado: 'ativo', status: 'ativo', plano: 'pro_mensal', payment_provider: 'asaas' }
        };
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({ message: 'not found' })
      };
    },
    document: {
      getElementById: element,
      addEventListener() {}
    },
    window: {
      FLUXMEI_CONFIG: { API_URL: 'http://127.0.0.1/api' },
      location: { origin: 'http://127.0.0.1', href: '' }
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${successJs}\nglobalThis.__successTest = { renderSuccess, initSuccessPage, getLoginUrl };`, context);

  return {
    elements,
    api: context.__successTest,
    location: context.window.location,
    session
  };
}

test('checkout principal usa Asaas para Pix e boleto ativos', () => {
  assert.match(checkoutHtml, /Pagamento seguro processado pelo Asaas\./);
  assert.match(checkoutHtml, /Pix, boleto e cartao estao ativos pelo Asaas/);
  assert.match(checkoutHtml, /id="boletoPanel"/);
  assert.match(checkoutHtml, /data-payment-method="pix"/);
  assert.match(checkoutHtml, /data-payment-method="boleto"/);
  assert.match(checkoutHtml, /data-payment-method="cartao"/);
  assert.match(checkoutHtml, /id="cardMethodButton"[^>]*hidden/);
  assert.match(checkoutHtml, /id="generatePixButton"/);
  assert.match(checkoutHtml, /id="generateBoletoButton"/);
  assert.match(checkoutHtml, /id="billingDocument"/);
  assert.match(checkoutHtml, /id="payCardButton"/);
  assert.match(checkoutHtml, /Gerar QR Code Pix/);
  assert.match(checkoutHtml, /Emitir boleto/);
  assert.match(checkoutHtml, /Pagar com cartao no ambiente seguro Asaas/);
  assert.match(checkoutHtml, /id="pixPanel"/);
  assert.match(checkoutHtml, /id="pixCode"/);
  assert.doesNotMatch(checkoutHtml, /name="paymentProvider"/);
});

test('checkout principal chama rotas Asaas quando PAYMENT_GATEWAY=asaas', () => {
  assert.match(checkoutJs, /\/pagamentos\/asaas\/criar-pix/);
  assert.match(checkoutJs, /\/pagamentos\/asaas\/criar-boleto/);
  assert.match(checkoutJs, /\/pagamentos\/asaas\/criar-cartao/);
  assert.match(checkoutJs, /\/pagamentos\/asaas\/status\/\$\{encodeURIComponent\(paymentId\)\}/);
  assert.match(checkoutJs, /generatePixPayment/);
  assert.match(checkoutJs, /generateBoletoPayment/);
  assert.match(checkoutJs, /submitAsaasCardPayment/);
  assert.match(checkoutJs, /ACTIVE_PAYMENT_METHODS = new Set\(\['pix', 'boleto'\]\)/);
  assert.match(checkoutJs, /copyPixButton/);
});

test('success.html renderiza tela premium de pagamento confirmado', () => {
  assert.match(successHtml, /Pagamento confirmado!/);
  assert.match(successHtml, /Seu acesso ao FluxMEI foi liberado com sucesso/);
  assert.match(successHtml, /id="successPlan"/);
  assert.match(successHtml, /id="successMethod"/);
  assert.match(successHtml, /id="successDate"/);
  assert.match(successHtml, /FluxMEI Pro Ativo/);
});

test('success sem login redireciona para login', async () => {
  const { api, location } = createSuccessHarness({ token: null });

  await api.initSuccessPage();

  assert.match(location.href, /\/auth\/login\.html/);
  assert.match(location.href, /redirect=%2Fcheckout%2Fsuccess\.html/);
});

test('success mostra dados de assinatura ativa autenticada', () => {
  const { api, elements } = createSuccessHarness({
    session: {
      fluxmei_payment_success_summary: JSON.stringify({
        method: 'pix',
        confirmed_at: '2026-06-24T12:30:00.000Z'
      })
    }
  });

  const rendered = api.renderSuccess({ estado: 'ativo', plano: 'pro_anual', payment_provider: 'asaas' }, {
    method: 'pix',
    confirmed_at: '2026-06-24T12:30:00.000Z'
  });

  assert.equal(rendered, true);
  assert.equal(elements.get('successPlan').textContent, 'Plano Pro Anual');
  assert.equal(elements.get('successMethod').textContent, 'Pix');
  assert.equal(elements.get('successStatus').textContent, 'Ativo');
});

test('success botoes apontam para dashboard e minha conta', () => {
  assert.match(successHtml, /id="dashboardButton" href="\/app\/"/);
  assert.match(successHtml, /id="accountButton" href="\/app\/#minha-conta"/);
});

test('success nao confirma assinatura pendente', () => {
  const { api, location } = createSuccessHarness();

  const rendered = api.renderSuccess({ estado: 'pendente', status: 'pendente', plano: 'pro_mensal' }, {});

  assert.equal(rendered, false);
  assert.equal(location.href, '/app/#minha-conta');
});

test('checkout exibe metodos com cards, descricoes e confianca', () => {
  assert.match(checkoutHtml, /class="method-icon"/);
  assert.match(checkoutHtml, /Aprovacao rapida/);
  assert.match(checkoutHtml, /Aprovacao imediata/);
  assert.match(checkoutHtml, /Pague em qualquer banco ou app/);
  assert.match(checkoutHtml, /Ate 12x sem complicacao/);
  assert.match(checkoutHtml, /Pagamento seguro/);
  assert.match(checkoutHtml, /Processado pelo Asaas/);
  assert.match(checkoutHtml, /Ambiente criptografado/);
  assert.match(checkoutHtml, /Liberacao automatica/);
  assert.match(checkoutHtml, /Dados protegidos/);
  assert.match(checkoutHtml, /Suporte disponivel/);
  assert.doesNotMatch(checkoutHtml, /<span class="method-icon" aria-hidden="true">[PCB]<\/span>/);
  assert.match(checkoutHtml, /<svg viewBox="0 0 24 24" focusable="false">/);
});

test('checkout exibe resumo premium do plano anual', () => {
  const { api, elements } = createCheckoutHarness();

  api.renderPlan({
    id: 'pro_anual',
    nome: 'Plano FluxMEI Anual',
    preco: 478.8,
    tipo_cobranca: 'anual'
  });

  assert.equal(elements.get('planName').textContent, 'Plano Pro Anual');
  assert.match(elements.get('planPrice').textContent, /478,80/);
  assert.equal(elements.get('planCycle').textContent, '/ano');
  assert.equal(elements.get('planEconomyBadge').hidden, false);
  assert.equal(elements.get('planSavingsBadge').hidden, false);
  assert.equal(elements.get('planInstallmentText').hidden, false);
  assert.match(elements.get('planEconomyText').textContent, /R\$ 478,80 por ano/);
  assert.match(elements.get('planEconomyText').textContent, /12x de R\$ 39,90/);
  assert.equal(elements.get('planRenewalText').textContent, 'Anual apos confirmacao');
});

test('checkout exibe resumo comercial do plano mensal', () => {
  const { api, elements } = createCheckoutHarness();

  api.renderPlan({
    id: 'pro_mensal',
    nome: 'Plano FluxMEI Mensal',
    preco: 49.9,
    tipo_cobranca: 'mensal'
  });

  assert.equal(elements.get('planName').textContent, 'Plano Pro Mensal');
  assert.match(elements.get('planPrice').textContent, /49,90/);
  assert.equal(elements.get('planCycle').textContent, '/mes');
  assert.equal(elements.get('planEconomyBadge').hidden, true);
  assert.equal(elements.get('planSavingsBadge').hidden, true);
  assert.equal(elements.get('planInstallmentText').hidden, true);
  assert.equal(elements.get('planEconomyText').textContent, 'Ideal para comecar com flexibilidade.');
});

test('checkout respeita plano informado na URL', () => {
  const anual = createCheckoutHarness({ search: '?plan=pro_anual' });
  const mensal = createCheckoutHarness({ search: '?plan=pro_mensal' });

  assert.equal(anual.api.getSelectedPlanId(), 'pro_anual');
  assert.equal(mensal.api.getSelectedPlanId(), 'pro_mensal');
});

test('checkout destaca a experiencia de Pix e boleto', () => {
  assert.match(checkoutHtml, /Abra o app do seu banco/);
  assert.match(checkoutHtml, /Escaneie ou copie o codigo Pix/);
  assert.match(checkoutHtml, /Copiar codigo Pix/);
  assert.match(checkoutHtml, /id="pixQrImage"/);
  assert.match(checkoutHtml, /Abrir boleto/);
  assert.match(checkoutHtml, /Copiar linha digitavel/);
  assert.match(checkoutHtml, /id="boletoDueDate"/);
  assert.match(checkoutHtml, /compensacao pode levar ate 3 dias uteis/);
  assert.match(checkoutHtml, /Verificacao automatica a cada 4s/);
  assert.match(checkoutHtml, /Visa/);
  assert.match(checkoutHtml, /Mastercard/);
  assert.match(checkoutHtml, /Elo/);
});

test('checkout permite pagamento de troca quando assinatura ativa usa outro plano', () => {
  const { api } = createCheckoutHarness();

  assert.equal(api.isPlanSwitchCheckout({ estado: 'ativo', plano: 'pro_mensal' }, 'pro_anual'), true);
  assert.equal(api.isPlanSwitchCheckout({ estado: 'ativo', plano: 'pro_anual' }, 'pro_mensal'), true);
  assert.equal(api.isPlanSwitchCheckout({ estado: 'ativo', plano: 'pro_mensal' }, 'pro_mensal'), false);
});

test('checkout exibe Cartao quando gateway ativo e Asaas', () => {
  const harness = createCheckoutHarness({ paymentGateway: 'asaas' });
  assert.equal(harness.api.configureCardAvailability(), true);
  assert.equal(harness.elements.get('cardMethodButton').hidden, false);
});

test('checkout HTML usa ambiente seguro Asaas para cartao', () => {
  assert.match(checkoutHtml, /ambiente seguro do Asaas/);
  assert.match(checkoutHtml, /nunca recebe numero, validade ou CVV/);
  assert.doesNotMatch(checkoutHtml, /id="cardNumber"/);
  assert.doesNotMatch(checkoutHtml, /id="cardExpiry"/);
  assert.doesNotMatch(checkoutHtml, /id="cardCvv"/);
  assert.doesNotMatch(checkoutHtml, /autocomplete="cc-number"/);
});

test('checkout gera parcelas do cartao com valor aproximado do plano anual', () => {
  const { api, elements } = createCheckoutHarness();

  api.renderCardInstallments({
    id: 'pro_anual',
    nome: 'Plano FluxMEI Anual',
    preco: 478.8,
    tipo_cobranca: 'anual'
  });

  const options = elements.get('cardInstallments').options;
  assert.equal(options.length, 12);
  assert.equal(options[0].value, '1');
  assert.equal(options[11].value, '12');
  assert.equal(options[11].textContent, '12x de R$ 39,90');
});

test('checkout mensal mantem 1x como recomendado', () => {
  const { api, elements } = createCheckoutHarness();

  api.renderCardInstallments({
    id: 'pro_mensal',
    nome: 'Plano FluxMEI Mensal',
    preco: 49.9,
    tipo_cobranca: 'mensal'
  });

  const options = elements.get('cardInstallments').options;
  assert.equal(options.length, 12);
  assert.equal(options[0].textContent, '1x de R$ 49,90 recomendado');
});

test('checkout oculta Cartao quando gateway ativo e EFI', () => {
  const harness = createCheckoutHarness({ paymentGateway: 'efi' });
  assert.equal(harness.api.configureCardAvailability(), false);
  assert.equal(harness.elements.get('cardMethodButton').hidden, true);
});

test('cartao Asaas chama backend sem dados crus e abre ambiente hospedado', async () => {
  const { api, elements, fetchCalls, location, setFetchData } = createCheckoutHarness({ paymentGateway: 'asaas' });
  setFetchData({
    success: true,
    provider: 'asaas',
    payment_id: 'pay_card_1',
    payment_status: 'PENDING',
    payment_method_id: 'CREDIT_CARD',
    invoice_url: 'https://asaas.example/invoice',
    assinatura: { status: 'pendente' }
  });

  await api.submitAsaasCardPayment();

  assert.equal(fetchCalls.at(-1).url, 'http://127.0.0.1/api/pagamentos/asaas/criar-cartao');
  const body = JSON.parse(fetchCalls.at(-1).options.body);
  assert.equal(body.cpfCnpj, '12345678901');
  assert.equal(body.payment, undefined);
  assert.doesNotMatch(JSON.stringify(body), /4111111111111111|12\/2030|cardNumber|cardCvv|cvv|number|expiry/i);
  assert.equal(location.href, 'https://asaas.example/invoice');
  assert.match(elements.get('checkoutAlert').textContent, /ambiente seguro do Asaas/i);
});

test('cartao Asaas aprovado abre tela de sucesso', async () => {
  const { api, fetchCalls, location, setFetchData } = createCheckoutHarness({ paymentGateway: 'asaas', runTimers: true });
  setFetchData({
    success: true,
    provider: 'asaas',
    payment_id: 'pay_card_1',
    payment_status: 'CONFIRMED',
    payment_method_id: 'CREDIT_CARD',
    assinatura: { status: 'ativo' }
  });

  await api.submitAsaasCardPayment();

  assert.equal(fetchCalls.at(-1).url, 'http://127.0.0.1/api/pagamentos/asaas/criar-cartao');
  assert.equal(location.href, '/checkout/success.html');
});

test('pagamento pendente nao abre tela de sucesso', async () => {
  const { api, location, setFetchData } = createCheckoutHarness({ paymentGateway: 'asaas', runTimers: true });
  setFetchData({
    success: true,
    provider: 'asaas',
    payment_id: 'pay_card_pending',
    payment_status: 'PENDING',
    payment_method_id: 'CREDIT_CARD',
    assinatura: { status: 'pendente' }
  });

  await api.submitAsaasCardPayment();

  assert.notEqual(location.href, '/checkout/success.html');
});

test('checkout nao salva dados de cartao em storage', () => {
  assert.doesNotMatch(checkoutJs, /(?:localStorage|sessionStorage)\.setItem\([^)]*(?:card|cartao|cvv|number|expiry|validade)/i);
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
  assert.equal(JSON.parse(fetchCalls.at(-1).options.body).cpfCnpj, '12345678901');
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

test('gerar Pix exige CPF ou CNPJ antes de chamar backend', async () => {
  const { api, elements, fetchCalls } = createCheckoutHarness({ billingDocument: '' });

  await api.generatePixPayment();

  assert.equal(fetchCalls.length, 0);
  assert.match(elements.get('checkoutAlert').textContent, /Informe seu CPF ou CNPJ para gerar a cobran/);
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
  assert.equal(JSON.parse(fetchCalls.at(-1).options.body).cpfCnpj, '12345678901');
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
  assert.match(checkoutJs, /if \(subscriptionStatus\?\.estado === 'ativo' && !isPlanSwitchCheckout\(subscriptionStatus, selectedPlan\.id\)\) \{\s*clearSubscribeIntent\(\);/);
  assert.match(checkoutJs, /showStatus\('active', 'Sua assinatura ja esta ativa\. Voce pode voltar ao app\.'\)/);
});
