import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { AppError, asyncHandler } from '../middlewares/errorMiddleware.js';

const router = Router();

function addDaysIso(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const DEV_PLANOS = {
  pro_mensal: { valor: 49.9, tipo_cobranca: 'mensal', dias: 30 },
  pro_anual: { valor: 478.8, tipo_cobranca: 'anual', dias: 365 }
};

router.post('/liberar-assinatura', authMiddleware, asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    throw new AppError('Rota indisponível em produção.', 404);
  }

  const plano = req.body?.plano || 'pro_mensal';
  const config = DEV_PLANOS[plano];
  if (!config) throw new AppError('Plano invalido.');

  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .update({
      plano,
      status: 'ativo',
      valor: config.valor,
      tipo_cobranca: config.tipo_cobranca,
      bloqueado: false,
      data_inicio: new Date().toISOString().slice(0, 10),
      data_vencimento: addDaysIso(config.dias),
      renovacao_automatica: true
    })
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) throw new AppError('Erro ao liberar assinatura.', 500, error.message);
  res.json(data);
}));

export default router;
