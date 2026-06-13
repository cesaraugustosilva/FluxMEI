import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { rejectUnexpectedFields, sanitizeText, validateEmail } from '../utils/validation.js';

const allowedFields = ['nome', 'telefone', 'email', 'observacao'];

function buildPayload(body, userId, { partial = false } = {}) {
  const payload = {};

  if (!partial || body.nome !== undefined) {
    payload.nome = sanitizeText(body.nome, { field: 'Nome', required: !partial, max: 120, rejectDangerous: true });
  }
  if (!partial || body.telefone !== undefined) {
    payload.telefone = sanitizeText(body.telefone, { field: 'Telefone', max: 30 });
  }
  if (!partial || body.email !== undefined) {
    payload.email = validateEmail(body.email, { required: false });
  }
  if (!partial || body.observacao !== undefined) {
    payload.observacao = sanitizeText(body.observacao, { field: 'Observação', max: 1000 });
  }

  if (userId) payload.user_id = userId;
  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
  return payload;
}

export async function createCliente(req, res) {
  rejectUnexpectedFields(req.body, allowedFields);

  const { data, error } = await supabaseAdmin
    .from('clientes')
    .insert(buildPayload(req.body, req.user.id))
    .select()
    .single();

  if (error) throw new AppError('Erro ao criar cliente.', 500, error.message);
  res.status(201).json(data);
}

export async function listClientes(req, res) {
  const { data, error } = await supabaseAdmin
    .from('clientes')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) throw new AppError('Erro ao listar clientes.', 500, error.message);
  res.json(data);
}

export async function getCliente(req, res) {
  const { data, error } = await supabaseAdmin
    .from('clientes')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (error) throw new AppError('Cliente não encontrado.', 404);
  res.json(data);
}

export async function updateCliente(req, res) {
  rejectUnexpectedFields(req.body, allowedFields);
  const payload = buildPayload(req.body, null, { partial: true });
  if (!Object.keys(payload).length) throw new AppError('Nenhum campo válido informado.');

  const { data, error } = await supabaseAdmin
    .from('clientes')
    .update(payload)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) throw new AppError('Cliente não encontrado ou não atualizado.', 404);
  res.json(data);
}

export async function deleteCliente(req, res) {
  const { error } = await supabaseAdmin
    .from('clientes')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) throw new AppError('Erro ao excluir cliente.', 500, error.message);
  res.status(204).send();
}
