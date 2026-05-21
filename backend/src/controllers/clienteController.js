import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';

function buildPayload(body, userId) {
  const payload = {
    nome: body.nome,
    telefone: body.telefone || null,
    email: body.email || null,
    observacao: body.observacao || null
  };
  if (userId) payload.user_id = userId;
  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
  return payload;
}

export async function createCliente(req, res) {
  if (!req.body.nome) throw new AppError('nome é obrigatório.');

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
  const { data, error } = await supabaseAdmin
    .from('clientes')
    .update(buildPayload(req.body))
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
