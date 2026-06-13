import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import {
  rejectUnexpectedFields,
  sanitizeText,
  validateDate,
  validateMoney,
  validateMonthReference,
  validateOneOf
} from '../utils/validation.js';

const allowedTipos = ['entrada', 'saida'];
const allowedFields = ['tipo', 'descricao', 'valor', 'categoria', 'data', 'forma_pagamento', 'observacao'];

function monthBounds(month) {
  const validMonth = validateMonthReference(month);
  const [year, monthIndex] = validMonth.split('-').map(Number);
  const end = new Date(Date.UTC(year, monthIndex, 0)).toISOString().slice(0, 10);
  return { start: `${validMonth}-01`, end };
}

function validatePayload(body, partial = false) {
  rejectUnexpectedFields(body, allowedFields);

  const required = ['tipo', 'descricao', 'valor', 'categoria', 'data'];
  if (!partial) {
    const missing = required.filter((field) => body[field] === undefined || body[field] === '');
    if (missing.length) throw new AppError(`Campos obrigatórios: ${missing.join(', ')}.`);
  }

  if (body.tipo !== undefined) validateOneOf(body.tipo, allowedTipos, { required: !partial, field: 'Tipo' });
  if (body.valor !== undefined) validateMoney(body.valor, { required: !partial, field: 'Valor' });
  if (body.data !== undefined) validateDate(body.data, { required: !partial, field: 'Data' });
  if (body.descricao !== undefined) {
    sanitizeText(body.descricao, { field: 'Descrição', required: !partial, max: 180, rejectDangerous: true });
  }
  if (body.categoria !== undefined) {
    sanitizeText(body.categoria, { field: 'Categoria', required: !partial, max: 80, rejectDangerous: true });
  }
  if (body.forma_pagamento !== undefined) {
    sanitizeText(body.forma_pagamento, { field: 'Forma de pagamento', max: 80, rejectDangerous: true });
  }
  if (body.observacao !== undefined) {
    sanitizeText(body.observacao, { field: 'Observação', max: 1000 });
  }
}

function buildPayload(body, userId) {
  const payload = {};

  if (body.tipo !== undefined) payload.tipo = validateOneOf(body.tipo, allowedTipos, { field: 'Tipo' });
  if (body.descricao !== undefined) {
    payload.descricao = sanitizeText(body.descricao, { field: 'Descrição', required: true, max: 180, rejectDangerous: true });
  }
  if (body.valor !== undefined) payload.valor = validateMoney(body.valor, { field: 'Valor' });
  if (body.categoria !== undefined) {
    payload.categoria = sanitizeText(body.categoria, { field: 'Categoria', required: true, max: 80, rejectDangerous: true });
  }
  if (body.data !== undefined) payload.data = validateDate(body.data, { field: 'Data' });
  if (body.forma_pagamento !== undefined) {
    payload.forma_pagamento = sanitizeText(body.forma_pagamento, { field: 'Forma de pagamento', max: 80, rejectDangerous: true });
  }
  if (body.observacao !== undefined) {
    payload.observacao = sanitizeText(body.observacao, { field: 'Observação', max: 1000 });
  }
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

  if (error) throw new AppError(`Erro ao criar movimentação: ${error.message}`, 500, error.message);
  res.status(201).json(data);
}

export async function listMovimentacoes(req, res) {
  let query = supabaseAdmin.from('movimentacoes').select('*').eq('user_id', req.user.id);

  if (req.query.mes) {
    const { start, end } = monthBounds(req.query.mes);
    query = query.gte('data', start).lte('data', end);
  }
  if (req.query.data) query = query.eq('data', validateDate(req.query.data));
  if (req.query.tipo) query = query.eq('tipo', validateOneOf(req.query.tipo, allowedTipos, { field: 'Tipo' }));
  if (req.query.categoria) {
    query = query.eq('categoria', sanitizeText(req.query.categoria, { field: 'Categoria', max: 80, rejectDangerous: true }));
  }

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
  const payload = buildPayload(req.body);
  if (!Object.keys(payload).length) throw new AppError('Nenhum campo válido informado.');

  const { data, error } = await supabaseAdmin
    .from('movimentacoes')
    .update(payload)
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
