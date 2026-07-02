import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAllowedCorsOrigins,
  isCorsOriginAllowed,
  normalizeCorsOrigin
} from '../backend/src/server.js';

test('CORS permite dominio oficial sem depender de FRONTEND_URL', () => {
  const env = { NODE_ENV: 'production' };

  assert.equal(isCorsOriginAllowed('https://fluxmei.com.br', env).allowed, true);
});

test('CORS permite dominio oficial com www', () => {
  const env = { NODE_ENV: 'production' };

  assert.equal(isCorsOriginAllowed('https://www.fluxmei.com.br', env).allowed, true);
});

test('CORS permite dominio Vercel oficial configurado', () => {
  const env = {
    NODE_ENV: 'production',
    VERCEL_URL: 'fluxmei-oficial.vercel.app'
  };

  assert.equal(isCorsOriginAllowed('https://fluxmei-oficial.vercel.app', env).allowed, true);
});

test('CORS normaliza origem e configuracoes com barra final', () => {
  const env = {
    NODE_ENV: 'production',
    FRONTEND_URL: 'https://app.fluxmei.com.br/, https://cliente.fluxmei.com.br'
  };

  assert.equal(normalizeCorsOrigin('https://app.fluxmei.com.br/'), 'https://app.fluxmei.com.br');
  assert.deepEqual(getAllowedCorsOrigins(env), [
    'https://fluxmei.com.br',
    'https://www.fluxmei.com.br',
    'https://app.fluxmei.com.br',
    'https://cliente.fluxmei.com.br'
  ]);
  assert.equal(isCorsOriginAllowed('https://app.fluxmei.com.br/', env).allowed, true);
});

test('CORS bloqueia origem desconhecida em producao', () => {
  const env = {
    NODE_ENV: 'production',
    FRONTEND_URL: 'https://www.fluxmei.com.br',
    VERCEL_URL: 'fluxmei-oficial.vercel.app'
  };

  const result = isCorsOriginAllowed('https://evil.example', env);

  assert.equal(result.allowed, false);
  assert.deepEqual(result.allowedOrigins, [
    'https://fluxmei.com.br',
    'https://www.fluxmei.com.br',
    'https://fluxmei-oficial.vercel.app'
  ]);
});

test('CORS permite localhost somente em desenvolvimento', () => {
  assert.equal(isCorsOriginAllowed('http://localhost:5173', { NODE_ENV: 'development' }).allowed, true);
  assert.equal(isCorsOriginAllowed('http://127.0.0.1:3002', { NODE_ENV: 'test' }).allowed, true);
  assert.equal(isCorsOriginAllowed('http://localhost:5173', { NODE_ENV: 'production' }).allowed, false);
});
