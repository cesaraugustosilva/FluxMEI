import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from './errorMiddleware.js';
import { assinaturaService } from '../services/assinaturaService.js';

function decodeJwtPayload(token) {
  const [, payload] = String(token || '').split('.');
  if (!payload) return {};

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return {};
  }
}

function sanitizeValidationError(error) {
  if (!error) return null;
  if (typeof error === 'string') return error;
  return error.message || error.name || 'unknown_validation_error';
}

function logAuthTokenInspection({ token, outcome, validationError = null }) {
  const payload = decodeJwtPayload(token);
  const logPayload = {
    token_present: Boolean(token),
    iss: payload.iss || null,
    aud: payload.aud || null,
    exp: payload.exp || null,
    outcome
  };

  if (validationError) {
    logPayload.validation_error = sanitizeValidationError(validationError);
    console.warn('[auth:token]', logPayload);
    return;
  }

  console.info('[auth:token]', logPayload);
}

export async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      logAuthTokenInspection({ token: null, outcome: 'missing_token' });
      throw new AppError('Token de autenticação não informado.', 401);
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      logAuthTokenInspection({
        token,
        outcome: 'rejected',
        validationError: error || 'user_not_returned'
      });
      throw new AppError('Token inválido ou expirado.', 401);
    }

    req.user = data.user;
    req.accessToken = token;
    logAuthTokenInspection({ token, outcome: 'accepted' });
    next();
  } catch (error) {
    next(error);
  }
}

export function requirePlanFeature(feature) {
  return async (req, res, next) => {
    try {
      const usage = await assinaturaService.checkFeature(req.user.id, feature, req.body || {});
      if (!usage.allowed) {
        return res.status(402).json({
          success: false,
          message: usage.error || 'Teste grátis expirado',
          error: usage.error || 'Teste grátis expirado',
          code: usage.code || 'TRIAL_EXPIRED',
          estado: usage.estado || 'bloqueado',
          redirectTo: usage.redirectTo || '/checkout/'
        });
      }
      req.planUsage = usage;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function checkSubscriptionAccess(req, res, next) {
  return requirePlanFeature('access')(req, res, next);
}
