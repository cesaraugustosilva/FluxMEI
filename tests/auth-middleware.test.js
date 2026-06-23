import test from 'node:test';
import assert from 'node:assert/strict';

function createJwt(payload) {
  const encode = (value) => Buffer
    .from(JSON.stringify(value))
    .toString('base64url');

  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

async function withMockedGetUser(getUser, fn) {
  const [{ supabaseAdmin }, { authMiddleware }] = await Promise.all([
    import('../backend/src/config/supabase.js'),
    import('../backend/src/middlewares/authMiddleware.js?auth-middleware-tests')
  ]);

  const originalGetUser = supabaseAdmin.auth.getUser;
  supabaseAdmin.auth.getUser = getUser;

  try {
    await fn(authMiddleware);
  } finally {
    supabaseAdmin.auth.getUser = originalGetUser;
  }
}

function createResponse() {
  return {};
}

async function runMiddleware(authMiddleware, req) {
  let nextError = null;
  let nextCalled = false;

  await authMiddleware(req, createResponse(), (error) => {
    nextCalled = true;
    nextError = error || null;
  });

  return { nextCalled, nextError };
}

test('authMiddleware rejeita rota protegida sem token', async () => {
  await withMockedGetUser(async () => {
    throw new Error('getUser nao deveria ser chamado sem token');
  }, async (authMiddleware) => {
    const { nextCalled, nextError } = await runMiddleware(authMiddleware, { headers: {} });

    assert.equal(nextCalled, true);
    assert.equal(nextError.statusCode, 401);
    assert.match(nextError.message, /Token de autentica/);
  });
});

test('authMiddleware aceita token Supabase valido via getUser do admin client', async () => {
  const token = createJwt({
    iss: 'https://project-ref.supabase.co/auth/v1',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
    sub: 'user-1'
  });

  await withMockedGetUser(async (receivedToken) => {
    assert.equal(receivedToken, token);
    return {
      data: { user: { id: 'user-1', email: 'cliente@fluxmei.com.br' } },
      error: null
    };
  }, async (authMiddleware) => {
    const req = { headers: { authorization: `Bearer ${token}` } };
    const { nextCalled, nextError } = await runMiddleware(authMiddleware, req);

    assert.equal(nextCalled, true);
    assert.equal(nextError, null);
    assert.equal(req.user.id, 'user-1');
    assert.equal(req.accessToken, token);
  });
});

test('authMiddleware rejeita token expirado ou invalido retornado pelo Supabase', async () => {
  const token = createJwt({
    iss: 'https://project-ref.supabase.co/auth/v1',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) - 60,
    sub: 'user-1'
  });

  await withMockedGetUser(async () => ({
    data: { user: null },
    error: { message: 'JWT expired' }
  }), async (authMiddleware) => {
    const { nextCalled, nextError } = await runMiddleware(authMiddleware, {
      headers: { authorization: `Bearer ${token}` }
    });

    assert.equal(nextCalled, true);
    assert.equal(nextError.statusCode, 401);
    assert.equal(nextError.message, 'Token inválido ou expirado.');
  });
});

