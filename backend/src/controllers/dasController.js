import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import {
  rejectUnexpectedFields,
  validateDate,
  validateMoney,
  validateMonthReference,
  validateOneOf
} from '../utils/validation.js';

const statuses = ['pendente', 'pago', 'vencido'];
const allowedFields = ['mes_referencia', 'vencimento', 'valor', 'status'];

function buildPayload(body, userId, { partial = false } = {}) {
  const payload = {};

  if (!partial || body.mes_referencia !== undefined) {
    payload.mes_referencia = validateMonthReference(body.mes_referencia, { required: !partial });
  }
  if (!partial || body.vencimento !== undefined) {
    payload.vencimento = validateDate(body.vencimento, { required: !partial, field: 'Vencimento' });
  }
  if (!partial || body.valor !== undefined) {
    payload.valor = validateMoney(body.valor, { required: !partial, field: 'Valor' });
  }
  if (body.status !== undefined) {
    payload.status = validateOneOf(body.status, statuses, { field: 'Status' });
  } else if (!partial) {
    payload.status = 'pendente';
  }

  if (userId) payload.user_id = userId;
  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
  return payload;
}

function validate(body, partial = false) {
  rejectUnexpectedFields(body, allowedFields);
  if (!partial) {
    const missing = ['mes_referencia', 'vencimento', 'valor'].filter((field) => !body[field]);
    if (missing.length) throw new AppError(`Campos obrigatórios: ${missing.join(', ')}.`);
  }
  buildPayload(body, null, { partial });
}

function enrichDasAlerts(items) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return items.map((item) => {
    const vencimento = new Date(`${item.vencimento}T00:00:00`);
    const dias = Math.ceil((vencimento - today) / 86400000);
    const alertas = [];

    if (item.status !== 'pago' && dias < 0) alertas.push('DAS vencido');
    if (item.status !== 'pago' && dias >= 0 && dias <= 7) alertas.push('DAS vence em até 7 dias');

    return { ...item, dias_para_vencimento: dias, alertas };
  });
}

export async function createDas(req, res) {
  validate(req.body);
  const { data, error } = await supabaseAdmin
    .from('das')
    .insert(buildPayload(req.body, req.user.id))
    .select()
    .single();

  if (error) throw new AppError('Erro ao criar DAS.', 500, error.message);
  res.status(201).json(enrichDasAlerts([data])[0]);
}

export async function listDas(req, res) {
  let query = supabaseAdmin.from('das').select('*').eq('user_id', req.user.id);
  if (req.query.status) query = query.eq('status', validateOneOf(req.query.status, statuses, { field: 'Status' }));
  if (req.query.mes_referencia) {
    query = query.eq('mes_referencia', validateMonthReference(req.query.mes_referencia));
  }

  const { data, error } = await query.order('vencimento', { ascending: true });
  if (error) throw new AppError('Erro ao listar DAS.', 500, error.message);
  res.json(enrichDasAlerts(data || []));
}

export async function updateDas(req, res) {
  validate(req.body, true);
  const payload = buildPayload(req.body, null, { partial: true });
  if (!Object.keys(payload).length) throw new AppError('Nenhum campo válido informado.');

  const { data, error } = await supabaseAdmin
    .from('das')
    .update(payload)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) throw new AppError('DAS não encontrado ou não atualizado.', 404);
  res.json(enrichDasAlerts([data])[0]);
}

export async function deleteDas(req, res) {
  const { error } = await supabaseAdmin
    .from('das')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) throw new AppError('Erro ao excluir DAS.', 500, error.message);
  res.status(204).send();
}

export async function pagarDas(req, res) {
  const { data, error } = await supabaseAdmin
    .from('das')
    .update({ status: 'pago' })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) throw new AppError('DAS não encontrado.', 404);
  res.json(enrichDasAlerts([data])[0]);
}
