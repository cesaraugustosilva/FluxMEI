import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../backend/database/migrate_onboarding.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../backend/database/schema.sql', import.meta.url), 'utf8');
const authRoutes = readFileSync(new URL('../backend/src/routes/authRoutes.js', import.meta.url), 'utf8');
const authControllerSource = readFileSync(new URL('../backend/src/controllers/authController.js', import.meta.url), 'utf8');
const adminController = readFileSync(new URL('../backend/src/controllers/adminController.js', import.meta.url), 'utf8');
const adminHtml = readFileSync(new URL('../frontend/admin/index.html', import.meta.url), 'utf8');
const adminJs = readFileSync(new URL('../frontend/admin/admin.js', import.meta.url), 'utf8');
const appHtml = readFileSync(new URL('../frontend/app/index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../frontend/app/app.js', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../frontend/app/style.css', import.meta.url), 'utf8');

function createRes() {
  return {
    payload: null,
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

function createProfileMock(current = { id: 'user-1', onboarding_step: 0, onboarding_completed: false }) {
  const stats = { updates: [], auditLogs: [] };
  return {
    stats,
    from(table) {
      return {
        payload: null,
        select() { return this; },
        eq() { return this; },
        update(payload) {
          this.payload = payload;
          stats.updates.push(payload);
          return this;
        },
        maybeSingle() {
          if (table === 'profiles') return Promise.resolve({ data: current, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        single() {
          if (table === 'profiles') {
            return Promise.resolve({
              data: { id: current.id, ...current, ...this.payload },
              error: null
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert(payload) {
          if (table === 'audit_logs') stats.auditLogs.push(payload);
          this.payload = payload;
          return this;
        }
      };
    }
  };
}

async function withSupabaseMock(mock, fn) {
  const [{ supabaseAdmin }, controller] = await Promise.all([
    import('../backend/src/config/supabase.js'),
    import(`../backend/src/controllers/authController.js?onboarding-${Date.now()}-${Math.random()}`)
  ]);
  const originalFrom = supabaseAdmin.from;
  supabaseAdmin.from = mock.from;
  try {
    await fn(controller, mock.stats);
  } finally {
    supabaseAdmin.from = originalFrom;
  }
}

test('migration e schema adicionam campos de onboarding em profiles', () => {
  assert.match(migration, /onboarding_completed boolean not null default false/);
  assert.match(migration, /onboarding_step integer not null default 0/);
  assert.match(migration, /profiles_onboarding_step_check/);
  assert.match(schema, /onboarding_completed boolean not null default false/);
  assert.match(schema, /idx_profiles_onboarding_completed/);
});

test('rota autenticada salva progresso de onboarding', () => {
  assert.match(authRoutes, /router\.patch\('\/me\/onboarding', authMiddleware, asyncHandler\(updateOnboarding\)\)/);
  assert.match(authControllerSource, /export async function updateOnboarding/);
  assert.match(authControllerSource, /action: 'onboarding\.started'/);
  assert.match(authControllerSource, /action: 'onboarding\.completed'/);
});

test('primeiro acesso abre onboarding e segundo acesso nao abre', () => {
  assert.match(appHtml, /id="onboardingModal"/);
  assert.match(appHtml, /Bem-vindo ao FluxMEI!/);
  assert.match(appJs, /function shouldShowOnboarding\(\)/);
  assert.match(appJs, /state\.profile && state\.profile\.onboarding_completed !== true/);
  assert.match(appJs, /window\.setTimeout\(openOnboarding, 180\)/);
});

test('frontend salva progresso e conclusao do onboarding', () => {
  assert.match(appJs, /apiRequest\('\/auth\/me\/onboarding', \{/);
  assert.match(appJs, /method: 'PATCH'/);
  assert.match(appJs, /onboarding_completed: true/);
  assert.match(appJs, /onboarding_step: ONBOARDING_TOTAL_STEPS/);
  assert.match(appJs, /closeOnboarding/);
  assert.match(appCss, /onboarding-progress-track/);
  assert.match(appCss, /@keyframes onboardingFade/);
});

test('controller marca progresso e conclusao', async () => {
  const progressMock = createProfileMock({ id: 'user-1', onboarding_step: 0, onboarding_completed: false });
  await withSupabaseMock(progressMock, async ({ updateOnboarding }, stats) => {
    const res = createRes();
    await updateOnboarding(
      { user: { id: 'user-1' }, body: { onboarding_step: 3, onboarding_completed: false }, headers: {}, ip: '127.0.0.1' },
      res
    );
    assert.equal(res.payload.success, true);
    assert.equal(stats.updates[0].onboarding_step, 3);
    assert.equal(stats.updates[0].onboarding_completed, false);
    assert.equal(stats.auditLogs[0].action, 'onboarding.started');
  });

  const completeMock = createProfileMock({ id: 'user-1', onboarding_step: 3, onboarding_completed: false });
  await withSupabaseMock(completeMock, async ({ updateOnboarding }, stats) => {
    const res = createRes();
    await updateOnboarding(
      { user: { id: 'user-1' }, body: { onboarding_completed: true }, headers: {}, ip: '127.0.0.1' },
      res
    );
    assert.equal(res.payload.profile.onboarding_completed, true);
    assert.equal(stats.updates[0].onboarding_step, 6);
    assert.equal(stats.auditLogs[0].action, 'onboarding.completed');
  });
});

test('admin mostra metricas de onboarding', () => {
  assert.match(adminController, /onboarding_concluidos/);
  assert.match(adminController, /onboarding_pendentes/);
  assert.match(adminHtml, /metricOnboardingCompleted/);
  assert.match(adminHtml, /metricOnboardingPending/);
  assert.match(adminJs, /metrics\.onboarding_concluidos/);
  assert.match(adminJs, /metrics\.onboarding_pendentes/);
});
