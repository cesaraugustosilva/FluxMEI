import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSupabaseMock } from './helpers/supabaseMock.js';

const schemaSql = readFileSync(new URL('../backend/database/schema.sql', import.meta.url), 'utf8');
const appHtml = readFileSync(new URL('../frontend/app/index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../frontend/app/app.js', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../frontend/app/style.css', import.meta.url), 'utf8');

async function withNotificationService(rowsByTable, fn) {
  const [{ supabaseAdmin }, service] = await Promise.all([
    import('../backend/src/config/supabase.js'),
    import(`../backend/src/services/notificationCenterService.js?notifications-${Date.now()}-${Math.random()}`)
  ]);
  const originalFrom = supabaseAdmin.from;
  const mock = createSupabaseMock({ rowsByTable });
  supabaseAdmin.from = mock.from;

  try {
    await fn(service, mock);
  } finally {
    supabaseAdmin.from = originalFrom;
  }
}

test('schema possui tabela de notificacoes in-app com tipos e severidades', () => {
  assert.match(schemaSql, /create table if not exists public\.notifications/);
  assert.match(schemaSql, /type text not null check \(type in \('subscription', 'payment', 'import', 'goal', 'ai', 'security', 'system'\)\)/);
  assert.match(schemaSql, /severity text not null default 'info' check \(severity in \('info', 'success', 'warning', 'danger'\)\)/);
  assert.match(schemaSql, /notifications_select_own/);
  assert.match(schemaSql, /idx_notifications_user_unread/);
});

test('usuario so lista suas proprias notificacoes', async () => {
  await withNotificationService({
    notifications: [
      { id: 'n-1', user_id: 'user-1', title: 'Minha', message: 'ok', type: 'system', severity: 'info', created_at: '2026-07-03T10:00:00Z' },
      { id: 'n-2', user_id: 'user-2', title: 'Outra', message: 'ok', type: 'system', severity: 'info', created_at: '2026-07-03T10:00:00Z' }
    ]
  }, async (service, mock) => {
    const items = await service.listNotifications('user-1');
    assert.equal(items.length, 1);
    assert.equal(items[0].id, 'n-1');
    assert.deepEqual(mock.stats.filters.find((item) => item.column === 'user_id')?.value, 'user-1');
  });
});

test('unread count considera apenas notificacoes nao lidas do usuario', async () => {
  await withNotificationService({
    notifications: [
      { id: 'n-1', user_id: 'user-1', read_at: null },
      { id: 'n-2', user_id: 'user-1', read_at: '2026-07-03T10:00:00Z' },
      { id: 'n-3', user_id: 'user-2', read_at: null }
    ]
  }, async (service) => {
    const count = await service.getUnreadCount('user-1');
    assert.equal(count, 1);
  });
});

test('marcar notificacao como lida filtra por id e user_id', async () => {
  await withNotificationService({ notifications: [{ id: 'n-1', user_id: 'user-1', read_at: null }] }, async (service, mock) => {
    await service.markNotificationRead('n-1', 'user-1');
    assert.equal(mock.stats.updates[0].table, 'notifications');
    assert.ok(mock.stats.updates[0].payload.read_at);
    assert.deepEqual(mock.stats.filters.filter((item) => item.operator === 'eq').map((item) => [item.column, item.value]), [
      ['id', 'n-1'],
      ['user_id', 'user-1']
    ]);
  });
});

test('marcar todas como lidas filtra por usuario e read_at nulo', async () => {
  await withNotificationService({ notifications: [{ id: 'n-1', user_id: 'user-1', read_at: null }] }, async (service, mock) => {
    await service.markAllNotificationsRead('user-1');
    assert.equal(mock.stats.updates[0].table, 'notifications');
    assert.ok(mock.stats.updates[0].payload.read_at);
    assert.ok(mock.stats.filters.some((item) => item.column === 'user_id' && item.value === 'user-1'));
    assert.ok(mock.stats.filters.some((item) => item.operator === 'is' && item.column === 'read_at' && item.value === null));
  });
});

test('notificacao de pagamento confirmado e criada sem metadata sensivel', async () => {
  await withNotificationService({ notifications: [] }, async (service, mock) => {
    await service.createPaymentConfirmedNotification({
      assinatura: { id: 'ass-1', user_id: 'user-1', plano: 'pro_mensal', provider_raw: { token: 'secret' } },
      payment: { id: 'pay-1' }
    });

    const insert = mock.stats.inserts[0].payload;
    assert.equal(insert.type, 'payment');
    assert.equal(insert.severity, 'success');
    assert.equal(insert.user_id, 'user-1');
    assert.equal(Object.hasOwn(insert.metadata, 'provider_raw'), false);
  });
});

test('notificacao de importacao concluida e criada', async () => {
  await withNotificationService({ notifications: [] }, async (service, mock) => {
    await service.createImportCompletedNotification('user-1', {
      import: { id: 'imp-1' },
      imported_count: 12,
      skipped_count: 2,
      bank_name: 'Nubank'
    });

    const insert = mock.stats.inserts[0].payload;
    assert.equal(insert.type, 'import');
    assert.equal(insert.title, 'Importacao concluida');
    assert.match(insert.message, /12 movimentacoes/);
    assert.equal(insert.metadata.import_id, 'imp-1');
  });
});

test('score financeiro critico cria notificacao da FluxIA', async () => {
  await withNotificationService({ notifications: [] }, async (service, mock) => {
    await service.createForecastAlertNotifications('user-1', {
      financial_score: { score: 28, classification: 'Critico' },
      unusual_expenses: [],
      period: { month: 7, year: 2026 }
    });

    const insert = mock.stats.inserts[0].payload;
    assert.equal(insert.type, 'ai');
    assert.equal(insert.severity, 'danger');
    assert.equal(insert.title, 'Score financeiro critico');
  });
});

test('frontend renderiza sino, badge e painel de notificacoes', () => {
  assert.match(appHtml, /data-notification-toggle/);
  assert.match(appHtml, /data-notification-badge/);
  assert.match(appHtml, /notificationPanel/);
  assert.match(appHtml, /Voce esta em dia\. Nenhuma notificacao nova\./);
  assert.match(appJs, /apiRequest\('\/notifications'\)/);
  assert.match(appJs, /apiRequest\('\/notifications\/unread-count'\)/);
  assert.match(appJs, /markAllNotificationsAsRead/);
  assert.match(appCss, /\.notification-bell/);
  assert.match(appCss, /\.notification-badge/);
});
