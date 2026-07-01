import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const envOnly = process.argv.includes('--env-only');
const checks = [];

function ok(name, detail = '') {
  checks.push({ ok: true, name, detail });
}

function fail(name, detail = '') {
  checks.push({ ok: false, name, detail });
}

function hasFile(path) {
  return existsSync(resolve(root, path));
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

function hasAnyEnv(keys) {
  return keys.some((key) => Boolean(process.env[key]));
}

function checkFile(path, label = path) {
  if (hasFile(path)) ok(label);
  else fail(label, `${path} nao encontrado`);
}

function checkAnyFile(paths, label) {
  const foundPath = paths.find((path) => hasFile(path));
  if (foundPath) ok(label, foundPath);
  else fail(label, `${paths.join(' ou ')} nao encontrado`);
}

function checkPackageScripts(path, scripts) {
  const pkg = readJson(path);
  for (const script of scripts) {
    if (pkg.scripts?.[script]) ok(`${path} script:${script}`, pkg.scripts[script]);
    else fail(`${path} script:${script}`, 'script ausente');
  }
}

checkFile('package.json', 'package raiz');
checkFile('backend/package.json', 'package backend');
checkFile('frontend/package.json', 'package frontend');

if (!envOnly) {
  checkPackageScripts('package.json', ['dev', 'dev:backend', 'dev:frontend', 'build', 'build:frontend', 'test', 'test:backend', 'lint', 'check-env', 'deploy-check']);
  checkPackageScripts('backend/package.json', ['start', 'dev', 'test']);
  checkPackageScripts('frontend/package.json', ['dev', 'build']);

  checkAnyFile(['backend/node_modules', 'node_modules/@supabase/supabase-js'], 'backend instalado');
  checkFile('frontend/package.json', 'frontend instalado sem dependencias obrigatorias');
  checkFile('backend/src/server.js', 'Render backend entrypoint');
  checkFile('frontend/scripts/write-env.js', 'Vercel frontend build');
  checkFile('backend/database/schema.sql', 'Supabase schema');
}

const backendEnv = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'PAYMENT_GATEWAY',
  'ASAAS_API_KEY',
  'ASAAS_WEBHOOK_TOKEN',
  'GEMINI_API_KEY'
];
const frontendEnv = ['FLUXMEI_API_URL', 'FLUXMEI_PAYMENT_GATEWAY'];

for (const key of backendEnv) {
  if (process.env[key]) ok(`env backend:${key}`);
  else fail(`env backend:${key}`, 'configure no Render/backend');
}

for (const key of frontendEnv) {
  if (process.env[key]) ok(`env frontend:${key}`);
  else fail(`env frontend:${key}`, 'configure na Vercel/frontend');
}

if (hasAnyEnv(['RENDER', 'RENDER_SERVICE_ID', 'RENDER_EXTERNAL_URL'])) ok('Render', 'variavel Render detectada');
else fail('Render', 'sem variavel Render detectada; ok localmente, obrigatorio no deploy');

if (hasAnyEnv(['VERCEL', 'VERCEL_URL', 'FLUXMEI_API_URL'])) ok('Vercel', 'configuracao publica detectada');
else fail('Vercel', 'sem variavel Vercel/FLUXMEI_API_URL detectada');

const hasFailure = checks.some((check) => !check.ok);
for (const check of checks) {
  const prefix = check.ok ? 'OK' : 'FAIL';
  console.log(`${prefix} ${check.name}${check.detail ? ` - ${check.detail}` : ''}`);
}

if (hasFailure) process.exit(1);
