import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const adminRoutes = readFileSync(new URL('../backend/src/routes/adminRoutes.js', import.meta.url), 'utf8');
const adminHtml = readFileSync(new URL('../frontend/admin/index.html', import.meta.url), 'utf8');
const adminJs = readFileSync(new URL('../frontend/admin/admin.js', import.meta.url), 'utf8');

function createRes() {
  return {
    headers: {},
    body: null,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    send(body) {
      this.body = body;
      return this;
    }
  };
}

function createBackupMockFrom(rowsByTable, stats) {
  return (table) => {
    const rows = rowsByTable[table] || [];
    const chain = {
      table,
      selected: null,
      orderBy: null,
      limitValue: null,
      insertPayload: null,
      select(value) {
        this.selected = value || '*';
        return this;
      },
      order(column, options) {
        this.orderBy = [column, options];
        return this;
      },
      limit(value) {
        this.limitValue = value;
        return this;
      },
      insert(payload) {
        this.insertPayload = payload;
        stats.inserts.push({ table, payload });
        return this;
      },
      single() {
        return Promise.resolve({ data: { id: 'audit-backup' }, error: null });
      },
      then(resolve, reject) {
        stats.selects.push({
          table,
          selected: this.selected,
          orderBy: this.orderBy,
          limitValue: this.limitValue
        });
        const data = this.limitValue ? rows.slice(0, this.limitValue) : rows;
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      }
    };
    return chain;
  };
}

test('rota admin de backup fica protegida pelo middleware administrativo', () => {
  assert.match(adminRoutes, /router\.use\(authMiddleware, adminMiddleware\)/);
  assert.match(adminRoutes, /router\.get\('\/backup', asyncHandler\(adminBackup\)\)/);
});

test('frontend admin possui aba de seguranca e botao de backup manual', () => {
  assert.match(adminHtml, /data-admin-nav="security"/);
  assert.match(adminHtml, /id="backupDownloadButton"/);
  assert.match(adminHtml, /id="securityCriticalEventsBody"/);
  assert.match(adminJs, /fetchAdminBlob\('\/admin\/backup'\)/);
  assert.match(adminJs, /fluxmei-backup-\$\{todayDownloadDate\(\)\}\.json/);
});

test('admin gera backup com dados principais sanitizados e registra auditoria', async () => {
  const [{ supabaseAdmin }, { adminBackup }] = await Promise.all([
    import('../backend/src/config/supabase.js'),
    import('../backend/src/controllers/adminController.js?admin-backup-tests')
  ]);

  const originalFrom = supabaseAdmin.from;
  const stats = { selects: [], inserts: [] };
  supabaseAdmin.from = createBackupMockFrom({
    profiles: [{
      id: 'u1',
      nome: 'Ana',
      nome_negocio: 'Ana Studio',
      cpf: '12345678901',
      cnpj: '11222333000144',
      referral_code: 'ANA123',
      onboarding_completed: true,
      onboarding_step: 6,
      created_at: '2026-06-01T10:00:00Z'
    }],
    assinaturas: [{
      id: 's1',
      user_id: 'u1',
      plano: 'pro_mensal',
      status: 'ativo',
      valor: 49.9,
      tipo_cobranca: 'mensal',
      payment_provider: 'asaas',
      provider_payment_id: 'pay-1',
      provider_status: 'RECEIVED',
      provider_raw: { payment: { creditCardNumber: '4111111111111111' } },
      paid_at: '2026-06-24T10:00:00Z',
      created_at: '2026-06-24T10:00:00Z'
    }],
    movimentacoes: [{
      id: 'm1',
      user_id: 'u1',
      tipo: 'entrada',
      descricao: 'Venda',
      valor: 100,
      categoria: 'Servicos',
      forma_pagamento: 'pix',
      observacao: 'ok',
      data: '2026-06-24'
    }],
    coupons: [{ id: 'c1', code: 'ANUAL20', discount_type: 'FIXED', discount_value: 20, active: true }],
    referrals: [{ id: 'r1', referrer_user_id: 'u1', referred_user_id: 'u2', referral_code: 'ANA123', status: 'pending', reward_days: 15 }],
    audit_logs: [{
      id: 'log-1',
      user_id: 'u1',
      actor_user_id: 'u1',
      action: 'payment.created',
      entity_type: 'payment',
      entity_id: 'pay-1',
      metadata: { provider: 'asaas', card: { number: '4111111111111111' }, cpfCnpj: '12345678901' },
      created_at: '2026-06-24T10:00:00Z'
    }]
  }, stats);

  try {
    const res = createRes();
    await adminBackup({
      user: { id: 'admin-1' },
      headers: { 'user-agent': 'node-test' },
      ip: '127.0.0.1'
    }, res);

    const payload = JSON.parse(res.body);
    const serialized = JSON.stringify(payload);

    assert.equal(payload.success, true);
    assert.equal(payload.data.profiles.length, 1);
    assert.equal(payload.data.assinaturas.length, 1);
    assert.equal(payload.data.pagamentos.length, 1);
    assert.equal(payload.data.movimentacoes.length, 1);
    assert.equal(payload.data.cupons.length, 1);
    assert.equal(payload.data.referrals.length, 1);
    assert.equal(payload.data.audit_logs.length, 1);
    assert.equal(res.headers['Content-Type'], 'application/json; charset=utf-8');
    assert.match(res.headers['Content-Disposition'], /fluxmei-backup-\d{4}-\d{2}-\d{2}\.json/);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.ok(stats.selects.some((item) => item.table === 'audit_logs' && item.limitValue === 100));
    assert.ok(stats.inserts.some((item) => item.table === 'audit_logs' && item.payload.action === 'admin.backup.generated'));
    assert.doesNotMatch(serialized, /provider_raw|cpfCnpj|creditCardNumber|4111111111111111|12345678901|11222333000144|ASAAS_API_KEY|SUPABASE_SERVICE_ROLE_KEY/i);
  } finally {
    supabaseAdmin.from = originalFrom;
  }
});

