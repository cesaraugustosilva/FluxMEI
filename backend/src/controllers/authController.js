import { createUserSupabaseClient, supabase, supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { assinaturaService } from '../services/assinaturaService.js';

function shouldAutoConfirmEmail() {
  return process.env.AUTH_AUTO_CONFIRM_EMAIL === 'true';
}

function getFrontendUrl() {
  const frontendUrl = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((url) => url.trim().replace(/\/$/, ''))
    .find(Boolean);

  if (!frontendUrl) throw new AppError('FRONTEND_URL nao configurada.', 500);
  return frontendUrl;
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

export async function updatePassword(req, res) {
  requireFields(req.body, ['password']);

  if (String(req.body.password).length < 8) {
    throw new AppError('A senha precisa ter pelo menos 8 caracteres.');
  }

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, {
    password: req.body.password
  });

  if (error) throw new AppError(error.message, 400);
  res.json({ user: data.user, message: 'Senha atualizada com sucesso.' });
}

export async function register(req, res) {
  requireFields(req.body, ['email', 'password', 'nome', 'whatsapp', 'tipo_negocio']);

  const { email, password, nome, nome_negocio, whatsapp, tipo_negocio } = req.body;
  const metadata = { nome, nome_negocio, whatsapp, tipo_negocio };
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
  if (!data.user) throw new AppError('NÃ£o foi possÃ­vel criar o usuÃ¡rio.', 400);

  const profilePayload = {
    id: data.user.id,
    nome,
    nome_negocio: nome_negocio || null,
    whatsapp,
    tipo_negocio
  };

  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert(profilePayload, { onConflict: 'id' });

  if (profileError) throw new AppError('Usuário criado, mas houve erro ao salvar o perfil.', 500, profileError.message);
  await assinaturaService.createTrialSubscription(data.user.id);

  res.status(201).json({
    user: data.user,
    profile: profilePayload,
    email_confirmation_required: !autoConfirmEmail
  });
}

export async function login(req, res) {
  requireFields(req.body, ['email', 'password']);

  let { data, error } = await supabase.auth.signInWithPassword({
    email: req.body.email,
    password: req.body.password
  });

  if (error && shouldAutoConfirmEmail() && isEmailNotConfirmedError(error)) {
    const confirmed = await confirmUserEmailByAddress(req.body.email);
    if (confirmed) {
      const retry = await supabase.auth.signInWithPassword({
        email: req.body.email,
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
  const payload = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));

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
  requireFields(req.body, ['email']);

  const redirectTo = req.body.redirect_to || `${getFrontendUrl()}/auth/recovery/nova-senha.html`;
  const { error } = await supabase.auth.resetPasswordForEmail(req.body.email, { redirectTo });

  if (error) throw new AppError(error.message, 400);
  res.json({ message: 'Link de recuperação enviado.' });
}
