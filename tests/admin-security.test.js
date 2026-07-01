import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schemaSql = readFileSync(new URL('../backend/database/schema.sql', import.meta.url), 'utf8');
const migrationSql = readFileSync(new URL('../backend/database/migrate_protect_profiles_is_admin.sql', import.meta.url), 'utf8');
const adminMiddlewareSource = readFileSync(new URL('../backend/src/middlewares/adminMiddleware.js', import.meta.url), 'utf8');

const combinedSql = `${schemaSql}\n${migrationSql}`;

test('profiles.is_admin e bloqueado para alteracao direta por usuario autenticado', () => {
  assert.match(combinedSql, /create or replace function public\.prevent_profile_is_admin_client_change\(\)/);
  assert.match(combinedSql, /auth\.role\(\) = 'authenticated'/);
  assert.match(combinedSql, /tg_op = 'INSERT' and coalesce\(new\.is_admin, false\) is true/);
  assert.match(combinedSql, /tg_op = 'UPDATE' and new\.is_admin is distinct from old\.is_admin/);
  assert.match(combinedSql, /raise exception 'profiles\.is_admin can only be changed by service role or privileged SQL'/);
  assert.match(combinedSql, /create trigger prevent_profiles_is_admin_client_insert/);
  assert.match(combinedSql, /create trigger prevent_profiles_is_admin_client_update/);
});

test('profiles_update_own preserva atualizacao dos campos seguros do proprio perfil', () => {
  assert.match(schemaSql, /create policy "profiles_update_own" on public\.profiles\s+for update using \(auth\.uid\(\) = id\) with check \(auth\.uid\(\) = id\)/);
  assert.match(schemaSql, /nome text not null/);
  assert.match(schemaSql, /whatsapp text/);
  assert.match(schemaSql, /tipo_negocio text/);
});

test('adminMiddleware continua aceitando ADMIN_EMAILS e profiles.is_admin verdadeiro', () => {
  assert.match(adminMiddlewareSource, /process\.env\.ADMIN_EMAILS \|\| process\.env\.ADMIN_EMAIL/);
  assert.match(adminMiddlewareSource, /select\('is_admin'\)/);
  assert.match(adminMiddlewareSource, /return Boolean\(data\?\.is_admin\)/);
});
