import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { assinaturaService, PLANOS } from '../services/assinaturaService.js';

function payloadFromPlan(body, userId) {
  const plano = PLANOS[body.plano];
  if (!plano) throw new AppError('Plano inválido.');

  return {
    user_id: userId,
    plano: body.plano,
    status: body.status || 'ativo',
    valor: body.valor ?? plano.preco,
    tipo_cobranca: body.tipo_cobranca || plano.tipo_cobranca,
    data_inicio: body.data_inicio || new Date().toISOString().slice(0, 10),
    data_vencimento: body.data_vencimento || null,
    renovacao_automatica: body.renovacao_automatica ?? body.plano !== 'gratuito'
  };
}

function assertSelfManagedSubscriptionsEnabled() {
  if (process.env.ALLOW_SELF_MANAGED_SUBSCRIPTIONS === 'true') return;
  throw new AppError('AlteraÃ§Ãµes de assinatura estÃ£o desativadas nesta instalaÃ§Ã£o.', 403);
}

export async function planos(req, res) {
  res.json(Object.values(PLANOS));
}

export async function listAssinaturas(req, res) {
  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) throw new AppError('Erro ao listar assinaturas.', 500, error.message);
  res.json(data);
}

export async function createAssinatura(req, res) {
  assertSelfManagedSubscriptionsEnabled();
  const payload = payloadFromPlan(req.body, req.user.id);
  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .insert(payload)
    .select()
    .single();

  if (error) throw new AppError('Erro ao criar assinatura.', 500, error.message);
  res.status(201).json(data);
}

export async function updateAssinatura(req, res) {
  assertSelfManagedSubscriptionsEnabled();
  const allowed = ['plano', 'status', 'valor', 'tipo_cobranca', 'data_inicio', 'data_vencimento', 'renovacao_automatica'];
  const payload = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));

  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .update(payload)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) throw new AppError('Assinatura não encontrada ou não atualizada.', 404);
  res.json(data);
}

export async function cancelarAssinatura(req, res) {
  assertSelfManagedSubscriptionsEnabled();
  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .update({ status: 'cancelado', renovacao_automatica: false })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) throw new AppError('Assinatura não encontrada.', 404);
  res.json(data);
}
