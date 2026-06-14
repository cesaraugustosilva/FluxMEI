import rateLimit from 'express-rate-limit';

const RATE_LIMIT_MESSAGE = 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';

function createRateLimiter({ windowMs, limit }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: RATE_LIMIT_MESSAGE
    }
  });
}

export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10
});

export const registerRateLimiter = createRateLimiter({
  windowMs: 30 * 60 * 1000,
  limit: 5
});

export const passwordResetRateLimiter = createRateLimiter({
  windowMs: 30 * 60 * 1000,
  limit: 3
});

export const paymentRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20
});
