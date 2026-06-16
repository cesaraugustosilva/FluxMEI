import test from 'node:test';
import assert from 'node:assert/strict';
import { supabase } from '../backend/src/config/supabase.js';
import { getPasswordResetRedirectUrl, resetPassword } from '../backend/src/controllers/authController.js';

const originalEnv = {
  FRONTEND_URL: process.env.FRONTEND_URL,
  NODE_ENV: process.env.NODE_ENV
};

function restoreEnv() {
  if (originalEnv.FRONTEND_URL === undefined) {
    delete process.env.FRONTEND_URL;
  } else {
    process.env.FRONTEND_URL = originalEnv.FRONTEND_URL;
  }

  if (originalEnv.NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalEnv.NODE_ENV;
  }
}

test.afterEach(() => {
  restoreEnv();
});

test('reset de senha usa redirect oficial e ignora redirect_to externo do cliente', async () => {
  process.env.NODE_ENV = 'production';
  process.env.FRONTEND_URL = 'https://www.fluxmei.com.br';

  const originalReset = supabase.auth.resetPasswordForEmail;
  let capturedEmail = null;
  let capturedOptions = null;

  supabase.auth.resetPasswordForEmail = async (email, options) => {
    capturedEmail = email;
    capturedOptions = options;
    return { data: {}, error: null };
  };

  try {
    const response = {
      payload: null,
      json(payload) {
        this.payload = payload;
      }
    };

    await resetPassword({
      body: {
        email: 'CLIENTE@EXEMPLO.COM',
        redirect_to: 'https://evil.example/reset'
      }
    }, response);

    assert.equal(capturedEmail, 'cliente@exemplo.com');
    assert.equal(capturedOptions.redirectTo, 'https://www.fluxmei.com.br/auth/recovery/nova-senha.html');
    assert.equal(response.payload.message, 'Link de recuperação enviado.');
  } finally {
    supabase.auth.resetPasswordForEmail = originalReset;
  }
});

test('reset de senha usa a primeira URL publica valida do FluxMEI', () => {
  process.env.NODE_ENV = 'production';
  process.env.FRONTEND_URL = 'https://evil.example, https://www.fluxmei.com.br, https://app.fluxmei.com.br';

  assert.equal(
    getPasswordResetRedirectUrl(),
    'https://www.fluxmei.com.br/auth/recovery/nova-senha.html'
  );
});

test('reset de senha rejeita configuracao insegura em producao', () => {
  process.env.NODE_ENV = 'production';
  process.env.FRONTEND_URL = 'https://evil.example';

  assert.throws(
    () => getPasswordResetRedirectUrl(),
    /URL de recuperacao de senha nao configurada/
  );
});

test('reset de senha rejeita ausencia de FRONTEND_URL em producao', () => {
  process.env.NODE_ENV = 'production';
  delete process.env.FRONTEND_URL;

  assert.throws(
    () => getPasswordResetRedirectUrl(),
    /URL de recuperacao de senha nao configurada/
  );
});

test('reset de senha continua funcionando em dev sem FRONTEND_URL', () => {
  process.env.NODE_ENV = 'development';
  delete process.env.FRONTEND_URL;

  assert.equal(
    getPasswordResetRedirectUrl(),
    'http://localhost:3000/auth/recovery/nova-senha.html'
  );
});
