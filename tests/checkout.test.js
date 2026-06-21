import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const checkoutHtml = readFileSync(new URL('../frontend/checkout/index.html', import.meta.url), 'utf8');
const checkoutJs = readFileSync(new URL('../frontend/checkout/checkout.js', import.meta.url), 'utf8');

function createCheckoutHarness() {
  const elements = new Map();
  let fetchData = {};

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
    'statusPanel',
    'statusIcon',
    'statusTitle',
    'statusText'
  ].forEach(element);
  elements.get('pixPanel').hidden = true;
  elements.get('boletoPanel').hidden = true;

  const context = {
    console,
    URL,
    URLSearchParams,
    localStorage: { getItem() { return 'test-token'; }, setItem() {}, removeItem() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    navigator: { clipboard: { writeText() {} } },
    fetch: async () => ({
      ok: true,
      status: 200,
      headers: { get(header) { return header === 'content-type' ? 'application/json' : ''; } },
      json: async () => ({ ...fetchData }),
      text: async () => ''
    }),
    document: {
      getElementById: element,
      querySelectorAll() { return []; },
      querySelector() { return element('queryResult'); },
      addEventListener() {}
    },
    window: {
      FLUXMEI_CONFIG: { API_URL: 'http://127.0.0.1/api' },
      location: { origin: 'http://127.0.0.1', hostname: '127.0.0.1', search: '', href: '' },
      addEventListener() {},
      setTimeout() {},
      setInterval() { return 1; },
      clearInterval() {}
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${checkoutJs}\nglobalThis.__checkoutTest = { renderPixPanel, renderBoletoPanel, checkPaymentStatus, getStatusKeyFromPayment };`, context);

  return {
    elements,
    api: context.__checkoutTest,
    setFetchData(data) {
      fetchData = data;
    }
  };
}

test('checkout principal usa EFI Bank para Pix, cartao e boleto', () => {
  assert.match(checkoutHtml, /Pagamento seguro processado pela EFI Bank\./);
  assert.match(checkoutHtml, /Token seguro EFI/);
  assert.match(checkoutHtml, /id="boletoPanel"/);
  assert.match(checkoutHtml, /data-payment-method="pix"/);
  assert.match(checkoutHtml, /id="generatePixButton"/);
  assert.match(checkoutHtml, /Gerar Pix/);
  assert.match(checkoutHtml, /id="pixPanel"/);
  assert.match(checkoutHtml, /id="pixCode"/);
  assert.doesNotMatch(checkoutHtml, /name="paymentProvider"/);
});

test('checkout principal chama somente rotas EFI', () => {
  assert.match(checkoutJs, /\/pagamentos\/efi\/criar-pix/);
  assert.match(checkoutJs, /\/pagamentos\/efi\/criar-cartao/);
  assert.match(checkoutJs, /\/pagamentos\/efi\/criar-boleto/);
  assert.match(checkoutJs, /\/pagamentos\/efi\/status\/\$\{encodeURIComponent\(paymentId\)\}/);
  assert.match(checkoutJs, /generatePixPayment/);
  assert.match(checkoutJs, /generateBoletoPayment/);
  assert.match(checkoutJs, /submitEfiCardPayment/);
  assert.match(checkoutJs, /copyPixButton/);
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
