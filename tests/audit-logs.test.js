import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schema = readFileSync(new URL('../backend/database/schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../backend/database/migrate_audit_logs.sql', import.meta.url), 'utf8');
const pagamentoController = readFileSync(new URL('../backend/src/controllers/pagamentoController.js', import.meta.url), 'utf8');
const assinaturaController = readFileSync(new URL('../backend/src/controllers/assinaturaController.js', import.meta.url), 'utf8');
const authController = readFileSync(new URL('../backend/src/controllers/authController.js', import.meta.url), 'utf8');
const adminMiddleware = readFileSync(new URL('../backend/src/middlewares/adminMiddleware.js', import.meta.url), 'utf8');

test('migration e schema criam audit_logs com RLS fechado', () => {
  for (const source of [schema, migration]) {
    assert.match(source, /create table if not exists public\.audit_logs/);
    assert.match(source, /user_id uuid references auth\.users/);
    assert.match(source, /actor_user_id uuid references auth\.users/);
    assert.match(source, /metadata jsonb/);
    assert.match(source, /alter table public\.audit_logs enable row level security/);
  }
  assert.match(migration, /audit_logs_no_client_access/);
});

test('sanitizeAuditMetadata remove documentos cartao provider_raw e secrets', async () => {
  const { sanitizeAuditMetadata } = await import('../backend/src/services/auditLogService.js?sanitize-tests');
  const sanitized = sanitizeAuditMetadata({
    provider_raw: { any: 'thing' },
    cpfCnpj: '12345678901',
    card: { number: '4111111111111111', cvv: '123' },
    token: 'secret-token',
    safe: 'Pagamento 4111111111111111 do documento 12345678901',
    nested: { plan: 'pro_mensal', cnpj: '11222333000144' }
  });

  const json = JSON.stringify(sanitized);
  assert.equal(sanitized.provider_raw, undefined);
  assert.equal(sanitized.cpfCnpj, undefined);
  assert.equal(sanitized.card, undefined);
  assert.equal(sanitized.token, undefined);
  assert.equal(sanitized.nested.cnpj, undefined);
  assert.match(sanitized.safe, /\[redacted-card\]/);
  assert.match(sanitized.safe, /\[redacted-document\]/);
  assert.doesNotMatch(json, /4111111111111111|12345678901|11222333000144|secret-token/);
});

test('recordAuditLog insere payload sanitizado com ip e user agent', async () => {
  const [{ supabaseAdmin }, { recordAuditLog }] = await Promise.all([
    import('../backend/src/config/supabase.js'),
    import('../backend/src/services/auditLogService.js?record-tests')
  ]);

  const originalFrom = supabaseAdmin.from;
  let inserted = null;
  supabaseAdmin.from = (table) => {
    assert.equal(table, 'audit_logs');
    return {
      insert(payload) {
        inserted = payload;
        return this;
      },
      select() {
        return this;
      },
      single() {
        return Promise.resolve({ data: { id: 'log-1', ...inserted }, error: null });
      }
    };
  };

  try {
    await recordAuditLog({
      req: {
        ip: '10.0.0.1',
        headers: {
          'user-agent': 'FluxMEI Test',
          'x-forwarded-for': '203.0.113.10, 10.0.0.1'
        }
      },
      userId: 'user-1',
      actorUserId: 'actor-1',
      action: 'payment.created',
      entityType: 'payment',
      entityId: 'pay-1',
      metadata: {
        provider: 'asaas',
        cardNumber: '4111111111111111',
        cpf: '12345678901'
      }
    });

    assert.equal(inserted.user_id, 'user-1');
    assert.equal(inserted.actor_user_id, 'actor-1');
    assert.equal(inserted.action, 'payment.created');
    assert.equal(inserted.ip_address, '203.0.113.10');
    assert.equal(inserted.user_agent, 'FluxMEI Test');
    assert.doesNotMatch(JSON.stringify(inserted), /4111111111111111|12345678901|cardNumber|cpf/);
  } finally {
    supabaseAdmin.from = originalFrom;
  }
});

test('controllers registram eventos de auditoria principais', () => {
  assert.match(authController, /action: 'auth\.login'/);
  assert.match(pagamentoController, /action: 'payment\.created'/);
  assert.match(pagamentoController, /action: 'payment\.confirmed'/);
  assert.match(pagamentoController, /action: 'webhook\.received'/);
  assert.match(pagamentoController, /action: 'subscription\.activated'/);
  assert.match(pagamentoController, /action: 'plan_switch\.initiated'/);
  assert.match(pagamentoController, /action: 'plan_switch\.completed'/);
  assert.match(pagamentoController, /action: 'receipt\.viewed'/);
  assert.match(assinaturaController, /action: 'subscription\.cancel_scheduled'/);
  assert.match(assinaturaController, /action: 'subscription\.reactivated'/);
  assert.match(adminMiddleware, /action: 'admin\.access_denied'/);
});
