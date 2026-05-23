import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from './errorMiddleware.js';
import { assinaturaService } from '../services/assinaturaService.js';

export async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) throw new AppError('Token de autenticação não informado.', 401);

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) throw new AppError('Token inválido ou expirado.', 401);

    req.user = data.user;
    req.accessToken = token;
    next();
  } catch (error) {
    next(error);
  }
}

export function requirePlanFeature(feature) {
  return async (req, res, next) => {
    try {
      const usage = await assinaturaService.checkFeature(req.user.id, feature, req.body || {});
      if (!usage.allowed) throw new AppError(usage.reason, 403, usage);
      req.planUsage = usage;
      next();
    } catch (error) {
      next(error);
    }
  };
}
