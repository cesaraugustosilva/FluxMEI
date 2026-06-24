import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from './errorMiddleware.js';

function parseAdminEmails() {
  const raw = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '';
  return raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAuthorizedAdminEmail(email) {
  if (!email) return false;
  return parseAdminEmails().includes(String(email).trim().toLowerCase());
}

async function getProfileAdminFlag(userId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new AppError('Erro ao validar permissao administrativa.', 500, error.message);
  return Boolean(data?.is_admin);
}

export async function adminMiddleware(req, res, next) {
  try {
    if (!req.user?.id) throw new AppError('Usuario nao autenticado.', 401);

    if (isAuthorizedAdminEmail(req.user.email)) {
      req.admin = { source: 'email' };
      return next();
    }

    if (await getProfileAdminFlag(req.user.id)) {
      req.admin = { source: 'profile' };
      return next();
    }

    throw new AppError('Acesso administrativo restrito.', 403);
  } catch (error) {
    next(error);
  }
}
