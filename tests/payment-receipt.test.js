import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pagamentoRoutes = readFileSync(new URL('../backend/src/routes/pagamentoRoutes.js', import.meta.url), 'utf8');
const appHtml = readFileSync(new URL('../frontend/app/index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../frontend/app/app.js', import.meta.url), 'utf8');

function createRes() {
  return {
    payload: null,
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

async function withMockedReceipt(row, fn) {
  const [{ supabaseAdmin }, controller] = await Promise.all([
    import('../backend/src/config/supabase.js'),
    import(`../backend/src/controllers/pagamentoController.js?payment-receipt-${Date.now()}-${Math.random()}`)
  ]);

  const originalFrom = supabaseAdmin.from;
  const originalAuth = supabaseAdmin.auth;
  const stats = { table: null, tables: [], select: null, eq: [] };

  supabaseAdmin.from = (table) => {
    stats.tables.push(table);
    if (table === 'audit_logs') {
      return {
        insert() {
          return this;
        },
        select() {
          return this;
        },
        single() {
          return Promise.resolve({ data: { id: 'audit-1' }, error: null });
        }
      };
    }
    stats.table = table;
    return {
      select(columns) {
        stats.select = columns;
        return this;
      },
      eq(column, value) {
        stats.eq.push([column, value]);
        return this;
      },
      maybeSingle() {
        return Promise.resolve({ data: row, error: null });
      }
    };
  };
  supabaseAdmin.auth = {
    admin: {
      getUserById: async () => ({ data: { user: { email: 'cliente@fluxmei.com.br' } }, error: null })
    }
  };

  try {
    await fn({ reciboPagamento: controller.reciboPagamento, stats });
  } finally {
    supabaseAdmin.from = originalFrom;
    supabaseAdmin.auth = originalAuth;
  }
}

const paidRow = {
  id: 'sub-1',
  user_id: 'user-1',
  created_at: '2026-06-24T10:00:00Z',
  paid_at: '2026-06-24T10:05:00Z',
  plano: 'pro_mensal',
  valor: 49.9,
  status: 'ativo',
  payment_provider: 'asaas',
  provider_payment_id: 'pay-1',
  provider_status: 'RECEIVED',
  provider_raw: {
    attempt: { method: 'pix', plano_original: 'pro_mensal', valor_original: 49.9 },
    payment: { status: 'RECEIVED', cpfCnpj: '12345678901', card: { number: '4111111111111111' } }
  }
};

test('rota de recibo exige autenticacao e esta registrada', () => {
  assert.match(pagamentoRoutes, /router\.get\('\/:paymentId\/recibo', authMiddleware, asyncHandler\(reciboPagamento\)\)/);
});

test('pagamento aprovado gera recibo seguro', async () => {
  await withMockedReceipt(paidRow, async ({ reciboPagamento, stats }) => {
    const res = createRes();
    await reciboPagamento({ params: { paymentId: 'pay-1' }, user: { id: 'user-1' } }, res);

    assert.equal(stats.table, 'assinaturas');
    assert.ok(stats.tables.includes('audit_logs'));
    assert.deepEqual(stats.eq, [['user_id', 'user-1'], ['provider_payment_id', 'pay-1']]);
    assert.equal(res.payload.success, true);
    assert.deepEqual(res.payload.receipt, {
      payment_id: 'pay-1',
      paid_at: '2026-06-24T10:05:00Z',
      plano: 'pro_mensal',
      method: 'pix',
      provider: 'asaas',
      status: 'paid',
      valor: 49.9,
      user_email: 'cliente@fluxmei.com.br'
    });
    assert.doesNotMatch(JSON.stringify(res.payload), /provider_raw|cpfCnpj|12345678901|4111111111111111|cvv|validade/i);
  });
});

test('pagamento pendente nao gera recibo', async () => {
  await withMockedReceipt({ ...paidRow, provider_status: 'PENDING', paid_at: null }, async ({ reciboPagamento }) => {
    await assert.rejects(
      () => reciboPagamento({ params: { paymentId: 'pay-1' }, user: { id: 'user-1' } }, createRes()),
      /Recibo disponivel apenas para pagamentos confirmados/
    );
  });
});

test('frontend mostra recibo apenas para pagamentos pagos e abre modal', () => {
  assert.match(appHtml, /id="modalRecibo"/);
  assert.match(appHtml, /id="receiptContent"/);
  assert.match(appHtml, /id="receiptPrintAction"/);
  assert.match(appJs, /function isReceiptEligible\(status\)/);
  assert.match(appJs, /data-receipt-id/);
  assert.match(appJs, /Ver recibo/);
  assert.match(appJs, /apiRequest\(`\/pagamentos\/\$\{encodeURIComponent\(paymentId\)\}\/recibo`\)/);
  assert.match(appJs, /function renderReceipt\(receipt\)/);
  assert.match(appJs, /function printReceipt\(\)/);
});
