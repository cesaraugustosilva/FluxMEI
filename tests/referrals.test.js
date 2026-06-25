import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../backend/database/migrate_referrals.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../backend/database/schema.sql', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../backend/src/server.js', import.meta.url), 'utf8');
const authController = readFileSync(new URL('../backend/src/controllers/authController.js', import.meta.url), 'utf8');
const pagamentoController = readFileSync(new URL('../backend/src/controllers/pagamentoController.js', import.meta.url), 'utf8');
const referralServiceSource = readFileSync(new URL('../backend/src/services/referralService.js', import.meta.url), 'utf8');
const referralRoutes = readFileSync(new URL('../backend/src/routes/referralRoutes.js', import.meta.url), 'utf8');
const appHtml = readFileSync(new URL('../frontend/app/index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../frontend/app/app.js', import.meta.url), 'utf8');
const authJs = readFileSync(new URL('../frontend/auth/shared/auth.js', import.meta.url), 'utf8');
const registerAlias = readFileSync(new URL('../frontend/auth/register.html', import.meta.url), 'utf8');
const adminJs = readFileSync(new URL('../frontend/admin/admin.js', import.meta.url), 'utf8');

function createReferralMock({ profile = null, referral = null, assinatura = null } = {}) {
  const stats = { profileUpdate: null, referralUpsert: null, referralUpdate: null, assinaturaUpdate: null, tables: [] };

  const from = (table) => {
    stats.tables.push(table);
    const chain = {
      table,
      filters: [],
      payload: null,
      select() { return this; },
      order() { return this; },
      limit() { return this; },
      eq(column, value) {
        this.filters.push([column, value]);
        return this;
      },
      in(column, value) {
        this.filters.push([column, value]);
        return this;
      },
      is(column, value) {
        this.filters.push([column, value]);
        return this;
      },
      update(payload) {
        this.payload = payload;
        if (table === 'profiles') stats.profileUpdate = payload;
        if (table === 'referrals') stats.referralUpdate = payload;
        if (table === 'assinaturas') stats.assinaturaUpdate = payload;
        return this;
      },
      upsert(payload) {
        stats.referralUpsert = payload;
        return this;
      },
      maybeSingle() {
        if (table === 'profiles') {
          const codeFilter = this.filters.find(([column]) => column === 'referral_code');
          if (codeFilter) {
            const [, code] = codeFilter;
            return Promise.resolve({ data: profile?.referral_code === code ? profile : null, error: null });
          }
          return Promise.resolve({ data: { id: profile?.id || 'user-1', referral_code: profile?.referral_code || null }, error: null });
        }
        if (table === 'referrals') return Promise.resolve({ data: referral, error: null });
        if (table === 'assinaturas') return Promise.resolve({ data: assinatura, error: null });
        return Promise.resolve({ data: null, error: null });
      },
      single() {
        if (table === 'profiles') return Promise.resolve({ data: { referral_code: stats.profileUpdate.referral_code }, error: null });
        if (table === 'referrals') return Promise.resolve({ data: { ...referral, ...stats.referralUpdate }, error: null });
        if (table === 'assinaturas') return Promise.resolve({ data: { ...assinatura, ...stats.assinaturaUpdate }, error: null });
        return Promise.resolve({ data: null, error: null });
      }
    };
    return chain;
  };

  return { from, stats };
}

async function withSupabaseMock(mock, fn) {
  const [{ supabaseAdmin }, service] = await Promise.all([
    import('../backend/src/config/supabase.js'),
    import(`../backend/src/services/referralService.js?referrals-${Date.now()}-${Math.random()}`)
  ]);
  const originalFrom = supabaseAdmin.from;
  supabaseAdmin.from = mock.from;
  try {
    await fn(service, mock.stats);
  } finally {
    supabaseAdmin.from = originalFrom;
  }
}

test('migration e schema criam estrutura de indicacoes', () => {
  assert.match(migration, /create table if not exists public\.referrals/);
  assert.match(migration, /alter table public\.profiles[\s\S]*referral_code/);
  assert.match(migration, /constraint referrals_no_self_referral check \(referrer_user_id <> referred_user_id\)/);
  assert.match(migration, /referrals_referred_user_unique unique \(referred_user_id\)/);
  assert.match(migration, /referrals_no_client_access/);
  assert.match(schema, /create table if not exists public\.referrals/);
});

test('rotas de indicacao estao registradas e autenticadas', () => {
  assert.match(serverSource, /apiRouter\.use\('\/referrals', referralRoutes\)/);
  assert.match(referralRoutes, /router\.get\('\/me', authMiddleware, asyncHandler\(myReferral\)\)/);
  assert.match(referralRoutes, /router\.post\('\/apply', authMiddleware, asyncHandler\(applyReferral\)\)/);
});

test('usuario recebe codigo unico e link de indicacao e gerado', async () => {
  const mock = createReferralMock({ profile: { id: 'user-1', referral_code: null } });
  await withSupabaseMock(mock, async ({ ensureUserReferralCode }, stats) => {
    const code = await ensureUserReferralCode('user-1');
    assert.match(code, /^FLUX[A-F0-9]{8}$/);
    assert.equal(stats.profileUpdate.referral_code, code);
  });

  assert.match(appHtml, /Indique e ganhe/);
  assert.match(appHtml, /accountReferralLink/);
  assert.match(appJs, /new URL\('\/auth\/register\.html', window\.location\.origin\)/);
  assert.match(appJs, /url\.searchParams\.set\('ref', code\)/);
});

test('novo cadastro com ref cria referral pending sem quebrar codigo invalido', async () => {
  const mock = createReferralMock({ profile: { id: 'referrer-1', referral_code: 'FLUXABCD1234' }, referral: { id: 'ref-1', status: 'pending', reward_days: 15 } });
  await withSupabaseMock(mock, async ({ createReferralFromCode }, stats) => {
    const referral = await createReferralFromCode({ referralCode: 'FLUXABCD1234', referredUserId: 'new-user' });
    assert.equal(referral.status, 'pending');
    assert.equal(stats.referralUpsert.referrer_user_id, 'referrer-1');
    assert.equal(stats.referralUpsert.referred_user_id, 'new-user');
    assert.equal(stats.referralUpsert.reward_days, 15);

    const invalid = await createReferralFromCode({ referralCode: 'https://evil.example', referredUserId: 'new-user' });
    assert.equal(invalid, null);
  });

  assert.match(authController, /'ref'/);
  assert.match(authController, /createReferralFromCode\(\{/);
  assert.match(authJs, /const referralCode = getReferralCodeFromUrl\(\)/);
  assert.match(registerAlias, /\/auth\/cadastro\/index\.html/);
});

test('autoindicacao nao cria referral', async () => {
  const mock = createReferralMock({ profile: { id: 'same-user', referral_code: 'FLUXSELF1' } });
  await withSupabaseMock(mock, async ({ createReferralFromCode }, stats) => {
    const referral = await createReferralFromCode({ referralCode: 'FLUXSELF1', referredUserId: 'same-user' });
    assert.equal(referral, null);
    assert.equal(stats.referralUpsert, null);
  });
});

test('pagamento confirmado recompensa indicador com 15 dias e nao duplica sem referral pendente', async () => {
  const referral = {
    id: 'ref-1',
    referrer_user_id: 'referrer-1',
    referred_user_id: 'paid-user',
    referral_code: 'FLUXABCD1234',
    status: 'pending',
    reward_days: 15,
    rewarded_at: null
  };
  const assinatura = { id: 'sub-referrer', user_id: 'referrer-1', data_vencimento: '2026-07-10', status: 'ativo', bloqueado: false };
  const mock = createReferralMock({ referral, assinatura });

  await withSupabaseMock(mock, async ({ rewardReferralForPaidUser }, stats) => {
    const result = await rewardReferralForPaidUser('paid-user', { paymentId: 'pay-1', provider: 'asaas' });
    assert.equal(result.referral.status, 'rewarded');
    assert.equal(stats.assinaturaUpdate.data_vencimento, '2026-07-25');
    assert.equal(stats.assinaturaUpdate.status, 'ativo');
    assert.equal(stats.referralUpdate.status, 'rewarded');
    assert.ok(stats.referralUpdate.rewarded_at);
  });

  const noPendingMock = createReferralMock({ referral: null, assinatura });
  await withSupabaseMock(noPendingMock, async ({ rewardReferralForPaidUser }, stats) => {
    const result = await rewardReferralForPaidUser('paid-user', { paymentId: 'pay-1', provider: 'asaas' });
    assert.equal(result, null);
    assert.equal(stats.assinaturaUpdate, null);
  });

  assert.match(pagamentoController, /safelyRewardReferral\(updated\.user_id/);
  assert.match(referralServiceSource, /action: 'referral\.rewarded'/);
});

test('admin exibe metricas de indicacoes', () => {
  assert.match(adminJs, /metricPendingReferrals/);
  assert.match(adminJs, /metrics\.indicacoes_pendentes/);
  assert.match(adminJs, /metrics\.indicacoes_convertidas/);
  assert.match(adminJs, /metrics\.indicacoes_recompensadas/);
});
