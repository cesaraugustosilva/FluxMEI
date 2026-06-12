import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { AppError, asyncHandler } from '../middlewares/errorMiddleware.js';
import { assinaturaService } from '../services/assinaturaService.js';

const router = Router();

const DEV_PLANOS = {
  pro_mensal: { valor: 49.9, tipo_cobranca: 'mensal', dias: 30 },
  pro_anual: { valor: 478.8, tipo_cobranca: 'anual', dias: 365 }
};

function assertDevRouteEnabled() {
  if (process.env.NODE_ENV === 'production') {
    throw new AppError('Rota indisponivel em producao.', 404);
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function updateUserAssinatura(userId, payload) {
  const assinatura = await assinaturaService.ensureTrialSubscription(userId);
  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .update(payload)
    .eq('id', assinatura.id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw new AppError('Erro ao atualizar assinatura de desenvolvimento.', 500, error.message);
  return data;
}

router.post('/liberar-assinatura', authMiddleware, asyncHandler(async (req, res) => {
  assertDevRouteEnabled();

  const plano = req.body?.plano || 'pro_mensal';
  const config = DEV_PLANOS[plano];
  if (!config) throw new AppError('Plano invalido.');

  const data = await updateUserAssinatura(req.user.id, {
    plano,
    status: 'ativo',
    valor: config.valor,
    tipo_cobranca: config.tipo_cobranca,
    bloqueado: false,
    data_inicio: todayIso(),
    data_vencimento: addDaysIso(config.dias),
    data_trial_fim: null,
    renovacao_automatica: true
  });

  res.json(data);
}));

router.post('/expirar-trial', authMiddleware, asyncHandler(async (req, res) => {
  assertDevRouteEnabled();

  const expiredDate = addDaysIso(-1);
  const data = await updateUserAssinatura(req.user.id, {
    plano: 'gratuito',
    status: 'teste_gratis',
    valor: 0,
    tipo_cobranca: 'mensal',
    bloqueado: false,
    data_inicio: addDaysIso(-8),
    data_vencimento: expiredDate,
    data_trial_fim: expiredDate,
    teste_gratis_usado: true,
    renovacao_automatica: false
  });

  res.json(data);
}));

router.post('/bloquear-assinatura', authMiddleware, asyncHandler(async (req, res) => {
  assertDevRouteEnabled();

  const status = req.body?.status || 'vencido';
  if (!['pendente', 'vencido', 'cancelado'].includes(status)) {
    throw new AppError('Status de bloqueio invalido.');
  }

  const data = await updateUserAssinatura(req.user.id, {
    status,
    bloqueado: true,
    renovacao_automatica: false
  });

  res.json(data);
}));

export default router;
