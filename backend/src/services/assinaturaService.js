import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';

export const PLANOS = {
  gratuito: {
    id: 'gratuito',
    nome: 'Plano Gratuito',
    preco: 0,
    tipo_cobranca: 'mensal',
    limites: { movimentacoes_mes: 30, clientes: 5, ia: false },
    recursos: ['Controle financeiro básico', 'Até 30 movimentações por mês', 'Até 5 clientes']
  },
  pro_mensal: {
    id: 'pro_mensal',
    nome: 'Plano Pro Mensal',
    preco: 39.9,
    tipo_cobranca: 'mensal',
    limites: { movimentacoes_mes: null, clientes: null, ia: true },
    recursos: ['Movimentações ilimitadas', 'Clientes ilimitados', 'DAS', 'Calendário', 'Relatórios', 'Exportação']
  },
  pro_anual: {
    id: 'pro_anual',
    nome: 'Plano Pro Anual',
    preco: 358.8,
    preco_equivalente_mensal: 29.9,
    economia_anual: 120,
    tipo_cobranca: 'anual',
    limites: { movimentacoes_mes: null, clientes: null, ia: true },
    recursos: ['Todos os recursos do Pro Mensal', 'Cobrança anual com desconto']
  }
};

function monthRange(referenceDate = new Date()) {
  const date = referenceDate instanceof Date ? referenceDate : new Date(`${referenceDate}T00:00:00`);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  return { start, end };
}

async function getActiveSubscription(userId) {
  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['ativo', 'teste_gratis'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new AppError('Erro ao consultar assinatura.', 500, error.message);
  return data || null;
}

async function ensureFreeSubscription(userId) {
  const active = await getActiveSubscription(userId);
  if (active) return active;

  const payload = {
    user_id: userId,
    plano: 'gratuito',
    status: 'ativo',
    valor: 0,
    tipo_cobranca: 'mensal',
    data_inicio: new Date().toISOString().slice(0, 10),
    renovacao_automatica: false
  };

  const { data, error } = await supabaseAdmin
    .from('assinaturas')
    .insert(payload)
    .select()
    .single();

  if (error) throw new AppError('Erro ao criar assinatura gratuita.', 500, error.message);
  return data;
}

async function checkFeature(userId, feature, context = {}) {
  const assinatura = await ensureFreeSubscription(userId);
  const plano = PLANOS[assinatura.plano] || PLANOS.gratuito;

  if (feature === 'ia' && !plano.limites.ia) {
    return { allowed: false, reason: 'Relatórios com IA estão disponíveis apenas nos planos Pro.', plano: plano.id };
  }

  if (feature === 'movimentacoes') {
    const limit = plano.limites.movimentacoes_mes;
    if (limit === null) return { allowed: true, plano: plano.id };

    const { start, end } = monthRange(context.data);
    const { count, error } = await supabaseAdmin
      .from('movimentacoes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('data', start)
      .lte('data', end);

    if (error) throw new AppError('Erro ao verificar limite de movimentações.', 500, error.message);
    return {
      allowed: count < limit,
      reason: `O plano gratuito permite até ${limit} movimentações por mês.`,
      plano: plano.id,
      usado: count,
      limite: limit
    };
  }

  if (feature === 'clientes') {
    const limit = plano.limites.clientes;
    if (limit === null) return { allowed: true, plano: plano.id };

    const { count, error } = await supabaseAdmin
      .from('clientes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) throw new AppError('Erro ao verificar limite de clientes.', 500, error.message);
    return {
      allowed: count < limit,
      reason: `O plano gratuito permite até ${limit} clientes.`,
      plano: plano.id,
      usado: count,
      limite: limit
    };
  }

  return { allowed: true, plano: plano.id };
}

export const assinaturaService = {
  PLANOS,
  getActiveSubscription,
  ensureFreeSubscription,
  checkFeature
};
