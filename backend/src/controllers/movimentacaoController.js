import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';

const allowedTipos = ['entrada', 'saida'];

function monthBounds(month) {
  const [year, monthIndex] = month.split('-').map(Number);
  const end = new Date(Date.UTC(year, monthIndex, 0)).toISOString().slice(0, 10);
  return { start: `${month}-01`, end };
}

function validatePayload(body, partial = false) {
  const required = ['tipo', 'descricao', 'valor', 'categoria', 'data'];
  if (!partial) {
    const missing = required.filter((field) => body[field] === undefined || body[field] === '');
    if (missing.length) throw new AppError(`Campos obrigatórios: ${missing.join(', ')}.`);
  }

  if (body.tipo && !allowedTipos.includes(body.tipo)) throw new AppError('tipo deve ser entrada ou saida.');
  if (body.valor !== undefined && Number(body.valor) < 0) throw new AppError('valor deve ser maior ou igual a zero.');
}

function buildPayload(body, userId) {
  const payload = {
    tipo: body.tipo,
    descricao: body.descricao,
    valor: body.valor,
    categoria: body.categoria,
    data: body.data
  };

  if (body.forma_pagamento) payload.forma_pagamento = body.forma_pagamento;
  if (body.observacao) payload.observacao = body.observacao;
  if (userId) payload.user_id = userId;
  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
  return payload;
}

export async function createMovimentacao(req, res) {
  validatePayload(req.body);
  const { data, error } = await supabaseAdmin
    .from('movimentacoes')
    .insert(buildPayload(req.body, req.user.id))
    .select()
    .single();

  if (error) throw new AppError(`Erro ao criar movimentacao: ${error.message}`, 500, error.message);
  res.status(201).json(data);
}

export async function listMovimentacoes(req, res) {
  let query = supabaseAdmin.from('movimentacoes').select('*').eq('user_id', req.user.id);

  if (req.query.mes) {
    const { start, end } = monthBounds(req.query.mes);
    query = query.gte('data', start).lte('data', end);
  }
  if (req.query.data) query = query.eq('data', req.query.data);
  if (req.query.tipo) query = query.eq('tipo', req.query.tipo);
  if (req.query.categoria) query = query.eq('categoria', req.query.categoria);

  const { data, error } = await query.order('data', { ascending: false });
  if (error) throw new AppError('Erro ao listar movimentações.', 500, error.message);
  res.json(data);
}

export async function getMovimentacao(req, res) {
  const { data, error } = await supabaseAdmin
    .from('movimentacoes')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (error) throw new AppError('Movimentação não encontrada.', 404);
  res.json(data);
}

export async function updateMovimentacao(req, res) {
  validatePayload(req.body, true);
  const { data, error } = await supabaseAdmin
    .from('movimentacoes')
    .update(buildPayload(req.body))
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) throw new AppError('Movimentação não encontrada ou não atualizada.', 404);
  res.json(data);
}

export async function deleteMovimentacao(req, res) {
  const { error } = await supabaseAdmin
    .from('movimentacoes')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) throw new AppError('Erro ao excluir movimentação.', 500, error.message);
  res.status(204).send();
}
