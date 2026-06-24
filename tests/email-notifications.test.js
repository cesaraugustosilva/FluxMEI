import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pagamentoController = readFileSync(new URL('../backend/src/controllers/pagamentoController.js', import.meta.url), 'utf8');
const assinaturaController = readFileSync(new URL('../backend/src/controllers/assinaturaController.js', import.meta.url), 'utf8');
const schemaSql = readFileSync(new URL('../backend/database/schema.sql', import.meta.url), 'utf8');
const envExample = readFileSync(new URL('../backend/.env.example', import.meta.url), 'utf8');

function mockNotificationSupabase({ duplicate = false } = {}) {
  return {
    rows: [],
    updates: [],
    from(table) {
      assert.equal(table, 'notification_events');
      const query = {
        payload: null,
        insert: (payload) => {
          query.payload = payload;
          return query;
        },
        select: () => query,
        single: () => {
          if (duplicate) {
            return Promise.resolve({ data: null, error: { code: '23505' } });
          }
          const row = { id: `evt-${this.rows.length + 1}`, ...query.payload };
          this.rows.push(row);
          return Promise.resolve({ data: row, error: null });
        },
        update: (payload) => {
          this.updates.push(payload);
          return query;
        },
        eq: () => Promise.resolve({ data: null, error: null })
      };
      return query;
    },
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: { email: 'cliente@fluxmei.com.br' } }, error: null })
      }
    }
  };
}

async function withNotificationMocks(fn, options = {}) {
  const [{ supabaseAdmin }, notificationService] = await Promise.all([
    import('../backend/src/config/supabase.js'),
    import(`../backend/src/services/notificationService.js?email-notifications-${Date.now()}-${Math.random()}`)
  ]);

  const originalFrom = supabaseAdmin.from;
  const originalAuth = supabaseAdmin.auth;
  const originalFetch = global.fetch;
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalProvider = process.env.EMAIL_PROVIDER;
  const originalFromEmail = process.env.EMAIL_FROM;
  const mock = mockNotificationSupabase(options);
  const sent = [];

  supabaseAdmin.from = mock.from.bind(mock);
  supabaseAdmin.auth = mock.auth;
  process.env.EMAIL_PROVIDER = 'resend';
  process.env.RESEND_API_KEY = 'resend-test-key';
  process.env.EMAIL_FROM = 'FluxMEI <no-reply@fluxmei.test>';
  global.fetch = async (url, options = {}) => {
    const payload = JSON.parse(options.body || '{}');
    sent.push(payload);
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: `email-${sent.length}` })
    };
  };

  try {
    await fn({ notificationService, mock, sent });
  } finally {
    supabaseAdmin.from = originalFrom;
    supabaseAdmin.auth = originalAuth;
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalProvider === undefined) delete process.env.EMAIL_PROVIDER;
    else process.env.EMAIL_PROVIDER = originalProvider;
    if (originalFromEmail === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = originalFromEmail;
  }
}

test('schema e env possuem suporte a eventos de notificacao e Resend', () => {
  assert.match(schemaSql, /create table if not exists public\.notification_events/);
  assert.match(schemaSql, /notification_events_user_type_event_key unique/);
  assert.match(envExample, /EMAIL_PROVIDER=resend/);
  assert.match(envExample, /RESEND_API_KEY=/);
  assert.match(envExample, /EMAIL_FROM=/);
});

test('pagamento confirmado envia e-mail com template correto', async () => {
  await withNotificationMocks(async ({ notificationService, mock, sent }) => {
    await notificationService.notifyPaymentConfirmed({
      assinatura: {
        id: 'sub-1',
        user_id: 'user-1',
        plano: 'pro_mensal',
        valor: 49.9,
        payment_provider: 'asaas',
        provider_payment_id: 'pay-1',
        paid_at: '2026-06-24T10:00:00Z',
        provider_raw: { attempt: { method: 'pix' } }
      },
      payment: { id: 'pay-1', billingType: 'PIX' }
    });

    assert.equal(mock.rows[0].type, 'payment_confirmed');
    assert.equal(mock.rows[0].event_key, 'asaas:pay-1');
    assert.equal(sent[0].subject, 'Pagamento confirmado - FluxMEI');
    assert.match(sent[0].text, /Plano Pro Mensal/);
    assert.match(sent[0].text, /R\$\s*49,90/);
    assert.match(sent[0].text, /Pix/);
  });
});

test('pagamento pendente envia e-mail', async () => {
  await withNotificationMocks(async ({ notificationService, mock, sent }) => {
    await notificationService.notifyPaymentPending({
      assinatura: { id: 'sub-1', user_id: 'user-1', plano: 'pro_anual', valor: 478.8, payment_provider: 'asaas', provider_payment_id: 'pay-2' },
      payment: { id: 'pay-2' },
      method: 'boleto'
    });

    assert.equal(mock.rows[0].type, 'payment_pending');
    assert.equal(sent[0].subject, 'Estamos aguardando a confirmação do seu pagamento');
    assert.match(sent[0].text, /Boleto/);
  });
});

test('cancelamento e reativacao enviam e-mail', async () => {
  await withNotificationMocks(async ({ notificationService, sent }) => {
    await notificationService.notifyCancellationScheduled({
      assinatura: { id: 'sub-1', user_id: 'user-1', plano: 'pro_mensal', data_vencimento: '2026-07-24', cancelled_at: '2026-06-24T10:00:00Z' }
    });
    await notificationService.notifySubscriptionReactivated({
      assinatura: { id: 'sub-1', user_id: 'user-1', plano: 'pro_mensal', reactivated_at: '2026-06-24T11:00:00Z' }
    });

    assert.equal(sent[0].subject, 'Recebemos sua solicitação de cancelamento');
    assert.equal(sent[1].subject, 'Assinatura reativada com sucesso');
  });
});

test('renovacao e assinatura vencida enviam e-mail por lifecycle', async () => {
  await withNotificationMocks(async ({ notificationService, sent }) => {
    await notificationService.notifySubscriptionLifecycle({
      estado: 'ativo',
      plano: 'pro_mensal',
      dias_restantes: 7,
      data_vencimento: '2026-07-01'
    }, 'user-1');
    await notificationService.notifySubscriptionLifecycle({
      estado: 'ativo',
      plano: 'pro_mensal',
      dias_restantes: 3,
      data_vencimento: '2026-07-01'
    }, 'user-1');
    await notificationService.notifySubscriptionLifecycle({
      estado: 'expirado',
      plano: 'pro_mensal',
      data_vencimento: '2026-07-01'
    }, 'user-1');

    assert.equal(sent[0].subject, 'Sua assinatura vence em breve');
    assert.equal(sent[1].subject, 'Últimos dias para renovar sua assinatura');
    assert.equal(sent[2].subject, 'Seu acesso foi pausado');
  });
});

test('nao duplica envios para o mesmo evento', async () => {
  await withNotificationMocks(async ({ notificationService, sent }) => {
    const result = await notificationService.notifyPaymentConfirmed({
      assinatura: { id: 'sub-1', user_id: 'user-1', plano: 'pro_mensal', payment_provider: 'asaas', provider_payment_id: 'pay-1' },
      payment: { id: 'pay-1' }
    });

    assert.equal(result.duplicate, true);
    assert.equal(sent.length, 0);
  }, { duplicate: true });
});

test('controllers disparam notificacoes nos eventos principais', () => {
  assert.match(pagamentoController, /notifyPaymentConfirmed/);
  assert.match(pagamentoController, /notifyPaymentPending/);
  assert.match(pagamentoController, /notifySubscriptionCreated/);
  assert.match(assinaturaController, /notifyCancellationScheduled/);
  assert.match(assinaturaController, /notifySubscriptionReactivated/);
  assert.match(assinaturaController, /notifySubscriptionLifecycle/);
});
