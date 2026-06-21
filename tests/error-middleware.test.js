import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError, errorHandler, notFoundHandler } from '../backend/src/middlewares/errorMiddleware.js';

function createMockResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function withNodeEnv(value, fn) {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = value;
  const previousConsoleError = console.error;
  console.error = () => {};

  try {
    fn();
  } finally {
    console.error = previousConsoleError;
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
}

test('desenvolvimento retorna details para debugging local', () => {
  withNodeEnv('development', () => {
    const res = createMockResponse();
    const error = new AppError('Erro ao comunicar com provedor.', 502, { provider_payload: { id: 'pay_1' } });

    errorHandler(error, {}, res, () => {});

    assert.equal(res.statusCode, 502);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Erro ao comunicar com provedor.');
    assert.deepEqual(res.body.details, { provider_payload: { id: 'pay_1' } });
  });
});

test('producao nao retorna details nem payload externo', () => {
  withNodeEnv('production', () => {
    const res = createMockResponse();
    const error = new AppError('Gateway retornou erro bruto.', 502, { access_token: 'secret', sql: 'select * from assinaturas' });

    errorHandler(error, {}, res, () => {});

    assert.equal(res.statusCode, 502);
    assert.deepEqual(res.body, {
      success: false,
      message: 'Erro interno do servidor.'
    });
  });
});

test('producao preserva mensagem segura sem details', () => {
  withNodeEnv('production', () => {
    const res = createMockResponse();
    const error = new AppError('Preencha um e-mail válido.', 400);

    errorHandler(error, {}, res, () => {});

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
      success: false,
      message: 'Preencha um e-mail válido.'
    });
  });
});

test('not found usa formato seguro padronizado', () => {
  const res = createMockResponse();

  notFoundHandler({}, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    message: 'Rota não encontrada.'
  });
});
