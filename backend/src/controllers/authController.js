import { createUserSupabaseClient, supabase, supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { assinaturaService } from '../services/assinaturaService.js';
import { rejectUnexpectedFields, sanitizeText, validateEmail } from '../utils/validation.js';

function shouldAutoConfirmEmail() {
  return process.env.AUTH_AUTO_CONFIRM_EMAIL === 'true';
}

function getFrontendUrl() {
  const frontendUrl = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((url) => url.trim().replace(/\/$/, ''))
    .find(Boolean);

  if (!frontendUrl) throw new AppError('FRONTEND_URL não configurada.', 500);
  return frontendUrl;
}

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function isAllowedFluxmeiOrigin(url) {
  return url.protocol === 'https:'
    && (url.hostname === 'fluxmei.com.br' || url.hostname.endsWith('.fluxmei.com.br'));
}

function isAllowedDevOrigin(url) {
  return !isProduction()
    && ['http:', 'https:'].includes(url.protocol)
    && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
}

function getConfiguredFrontendUrls() {
  return (process.env.FRONTEND_URL || '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
}

function getSafeResetFrontendUrl() {
  const allowedUrl = getConfiguredFrontendUrls()
    .map((value) => {
      try {
        return new URL(value);
      } catch {
        return null;
      }
    })
    .find((url) => url && (isAllowedFluxmeiOrigin(url) || isAllowedDevOrigin(url)));

  if (allowedUrl) {
    allowedUrl.pathname = allowedUrl.pathname.replace(/\/$/, '');
    allowedUrl.search = '';
    allowedUrl.hash = '';
    return allowedUrl.toString().replace(/\/$/, '');
  }

  if (!isProduction()) return 'http://localhost:3002';
  throw new AppError('URL de recuperacao de senha nao configurada.', 500, null, { expose: false });
}

export function getPasswordResetRedirectUrl() {
  return `${getSafeResetFrontendUrl()}/auth/recovery/nova-senha.html`;
}

function isEmailNotConfirmedError(error) {
  return /email.*not.*confirmed|confirm/i.test(error?.message || '');
}

async function confirmUserEmailByAddress(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  let page = 1;

  while (page <= 20) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new AppError(error.message, 400);

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === normalizedEmail);
    if (user) {
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        email_confirm: true
      });
      if (updateError) throw new AppError(updateError.message, 400);
      return true;
    }

    if (data.users.length < 1000) break;
    page += 1;
  }

  return false;
}

function requireFields(body, fields) {
  const missing = fields.filter((field) => !body[field]);
  if (missing.length) throw new AppError(`Campos obrigatórios: ${missing.join(', ')}.`);
}

function isDirectSubscriptionIntent(body) {
  return body.subscription_intent === 'subscribe';
}

function getDirectSubscriptionPlan(body) {
  const plano = sanitizeText(body.plano || 'pro_mensal', { field: 'Plano', max: 80 });
  if (!assinaturaService.PLANOS[plano] || plano === 'gratuito') {
    throw new AppError('Plano inválido.');
  }
  return plano;
}

function profilePayloadFromBody(body, userId) {
  const payload = {
    nome: sanitizeText(body.nome, { field: 'Nome', required: true, max: 120, rejectDangerous: true }),
    nome_negocio: sanitizeText(body.nome_negocio, { field: 'Nome do negócio', max: 120, rejectDangerous: true }),
    whatsapp: sanitizeText(body.whatsapp, { field: 'WhatsApp', required: true, max: 30 }),
    tipo_negocio: sanitizeText(body.tipo_negocio, { field: 'Tipo de negócio', required: true, max: 120, rejectDangerous: true })
  };

  if (userId) payload.id = userId;
  return payload;
}

export async function updatePassword(req, res) {
  rejectUnexpectedFields(req.body, ['password']);
  requireFields(req.body, ['password']);

  if (typeof req.body.password !== 'string' || req.body.password.length < 8) {
    throw new AppError('A senha precisa ter pelo menos 8 caracteres.');
  }

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, {
    password: req.body.password
  });

  if (error) throw new AppError(error.message, 400);
  res.json({ user: data.user, message: 'Senha atualizada com sucesso.' });
}

export async function register(req, res) {
  rejectUnexpectedFields(req.body, [
    'email',
    'password',
    'nome',
    'nome_negocio',
    'whatsapp',
    'tipo_negocio',
    'subscription_intent',
    'plano'
  ]);
  requireFields(req.body, ['email', 'password', 'nome', 'whatsapp', 'tipo_negocio']);

  const email = validateEmail(req.body.email);
  const password = req.body.password;
  if (typeof password !== 'string' || password.length < 8) {
    throw new AppError('A senha precisa ter pelo menos 8 caracteres.');
  }

  const directSubscriptionPlan = isDirectSubscriptionIntent(req.body)
    ? getDirectSubscriptionPlan(req.body)
    : null;
  const profilePayload = profilePayloadFromBody(req.body);
  const metadata = { ...profilePayload };
  const autoConfirmEmail = shouldAutoConfirmEmail();
  const redirectTo = `${getFrontendUrl()}/auth/login/index.html`;
  const { data, error } = autoConfirmEmail
    ? await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: metadata
      })
    : await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata,
          emailRedirectTo: redirectTo
        }
      });

  if (error) throw new AppError(error.message, 400);
  if (!data.user) throw new AppError('Não foi possível criar o usuário.', 400);

  profilePayload.id = data.user.id;
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert(profilePayload, { onConflict: 'id' });

  if (profileError) throw new AppError('Usuário criado, mas houve erro ao salvar o perfil.', 500, profileError.message);
  if (isDirectSubscriptionIntent(req.body)) {
    await assinaturaService.createPendingSubscription(data.user.id, directSubscriptionPlan);
  } else {
    await assinaturaService.createTrialSubscription(data.user.id);
  }

  res.status(201).json({
    user: data.user,
    profile: profilePayload,
    email_confirmation_required: !autoConfirmEmail
  });
}

export async function login(req, res) {
  rejectUnexpectedFields(req.body, ['email', 'password']);
  requireFields(req.body, ['email', 'password']);

  const email = validateEmail(req.body.email);
  let { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: req.body.password
  });

  if (error && shouldAutoConfirmEmail() && isEmailNotConfirmedError(error)) {
    const confirmed = await confirmUserEmailByAddress(email);
    if (confirmed) {
      const retry = await supabase.auth.signInWithPassword({
        email,
        password: req.body.password
      });
      data = retry.data;
      error = retry.error;
    }
  }

  if (error && isEmailNotConfirmedError(error)) {
    throw new AppError('Confirme seu email antes de entrar. Verifique sua caixa de entrada.', 403);
  }

  if (error) throw new AppError('Email ou senha inválidos.', 401);
  res.json(data);
}

export async function logout(req, res) {
  const userClient = createUserSupabaseClient(req.accessToken);
  const { error } = await userClient.auth.signOut();
  if (error) throw new AppError(error.message, 400);
  res.json({ message: 'Logout realizado com sucesso.' });
}

export async function me(req, res) {
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', req.user.id)
    .maybeSingle();

  if (error) throw new AppError('Erro ao buscar perfil.', 500, error.message);
  const assinatura = await assinaturaService.ensureTrialSubscription(req.user.id);

  res.json({ user: req.user, profile, assinatura });
}

export async function updateProfile(req, res) {
  const allowed = ['nome', 'nome_negocio', 'cpf', 'cnpj', 'ramo', 'whatsapp', 'tipo_negocio'];
  rejectUnexpectedFields(req.body, allowed);

  const payload = {};
  if (req.body.nome !== undefined) {
    payload.nome = sanitizeText(req.body.nome, { field: 'Nome', required: true, max: 120, rejectDangerous: true });
  }
  if (req.body.nome_negocio !== undefined) {
    payload.nome_negocio = sanitizeText(req.body.nome_negocio, { field: 'Nome do negócio', max: 120, rejectDangerous: true });
  }
  if (req.body.cpf !== undefined) payload.cpf = sanitizeText(req.body.cpf, { field: 'CPF', max: 20 });
  if (req.body.cnpj !== undefined) payload.cnpj = sanitizeText(req.body.cnpj, { field: 'CNPJ', max: 24 });
  if (req.body.ramo !== undefined) {
    payload.ramo = sanitizeText(req.body.ramo, { field: 'Ramo', max: 120, rejectDangerous: true });
  }
  if (req.body.whatsapp !== undefined) payload.whatsapp = sanitizeText(req.body.whatsapp, { field: 'WhatsApp', max: 30 });
  if (req.body.tipo_negocio !== undefined) {
    payload.tipo_negocio = sanitizeText(req.body.tipo_negocio, { field: 'Tipo de negócio', max: 120, rejectDangerous: true });
  }

  if (!Object.keys(payload).length) throw new AppError('Nenhum campo válido informado.');

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(payload)
    .eq('id', req.user.id)
    .select()
    .single();

  if (error) throw new AppError('Erro ao atualizar perfil.', 500, error.message);
  res.json(data);
}

export async function resetPassword(req, res) {
  rejectUnexpectedFields(req.body, ['email', 'redirect_to']);
  requireFields(req.body, ['email']);

  const email = validateEmail(req.body.email);
  const redirectTo = getPasswordResetRedirectUrl();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  if (error) throw new AppError(error.message, 400);
  res.json({ message: 'Link de recuperação enviado.' });
}
