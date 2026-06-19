import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const authRoutes = readFileSync(new URL('../backend/src/routes/authRoutes.js', import.meta.url), 'utf8');
const pagamentoRoutes = readFileSync(new URL('../backend/src/routes/pagamentoRoutes.js', import.meta.url), 'utf8');
const rateLimitMiddleware = readFileSync(new URL('../backend/src/middlewares/rateLimitMiddleware.js', import.meta.url), 'utf8');

test('rotas de autenticacao usam rate limits especificos', () => {
  assert.match(authRoutes, /router\.post\('\/login', authRateLimiter, asyncHandler\(login\)\)/);
  assert.match(authRoutes, /router\.post\('\/register', registerRateLimiter, asyncHandler\(register\)\)/);
  assert.match(authRoutes, /router\.post\('\/reset-password', passwordResetRateLimiter, asyncHandler\(resetPassword\)\)/);
  assert.match(authRoutes, /router\.post\('\/update-password', passwordResetRateLimiter, authMiddleware, asyncHandler\(updatePassword\)\)/);
});

test('rotas sensiveis de pagamento usam paymentRateLimiter', () => {
  assert.match(pagamentoRoutes, /\/mercado-pago\/criar-pix', paymentRateLimiter, authMiddleware/);
  assert.match(pagamentoRoutes, /\/mercado-pago\/processar-brick', paymentRateLimiter, authMiddleware/);
  assert.match(pagamentoRoutes, /\/mercado-pago\/status\/:paymentId', paymentRateLimiter, authMiddleware/);
  assert.match(pagamentoRoutes, /\/efi\/criar-pix', paymentRateLimiter, authMiddleware/);
  assert.match(pagamentoRoutes, /\/efi\/criar-cartao', paymentRateLimiter, authMiddleware/);
  assert.match(pagamentoRoutes, /\/efi\/criar-boleto', paymentRateLimiter, authMiddleware/);
  assert.match(pagamentoRoutes, /\/efi\/status\/:paymentId', paymentRateLimiter, authMiddleware/);
  assert.match(pagamentoRoutes, /\/asaas\/criar-cobranca', paymentRateLimiter, authMiddleware/);
});

test('rate limiters usam mensagem segura e limites esperados', () => {
  assert.match(rateLimitMiddleware, /Muitas tentativas\. Aguarde alguns minutos e tente novamente\./);
  assert.match(rateLimitMiddleware, /export const authRateLimiter[\s\S]*limit: 10/);
  assert.match(rateLimitMiddleware, /export const registerRateLimiter[\s\S]*limit: 5/);
  assert.match(rateLimitMiddleware, /export const passwordResetRateLimiter[\s\S]*limit: 3/);
  assert.match(rateLimitMiddleware, /export const paymentRateLimiter[\s\S]*limit: 20/);
});
