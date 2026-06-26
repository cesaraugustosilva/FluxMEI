import { aiProvider, geminiModel, geminiModelName } from '../config/gemini.js';
import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { fetchMovimentacoes, summarizeMovimentacoes } from './relatorioService.js';

export const INSUFFICIENT_FINANCIAL_DATA_MESSAGE = 'Ainda não há dados financeiros suficientes para uma análise completa.';
export const GEMINI_MISSING_KEY_MESSAGE = 'Assistente financeiro indisponível: chave Gemini não configurada.';
export const GEMINI_INVALID_MODEL_MESSAGE = 'Assistente financeiro indisponível: modelo Gemini inválido ou indisponível.';
export const GEMINI_RATE_LIMIT_MESSAGE = 'Limite temporário da IA atingido. Tente novamente em alguns minutos.';
export const GEMINI_GENERIC_ERROR_MESSAGE = 'Nao foi possivel gerar resposta agora. Tente novamente em instantes.';

const PROMPT = `Voce e um assistente financeiro para MEIs no Brasil.
Analise os dados financeiros fornecidos e gere um relatorio simples, claro e util.
Use linguagem facil, sem termos tecnicos.
Mostre:
1. resumo do periodo
2. total de entradas
3. total de saidas
4. saldo/lucro
5. maiores gastos
6. melhores dias de faturamento
7. alertas importantes
8. recomendacoes praticas
Nao invente dados. Se faltar informacao, avise.`;

export const FINANCIAL_ASSISTANT_PROMPT = `Voce e um consultor financeiro especializado em MEIs brasileiros dentro do FluxMEI.
Você é o Assistente Financeiro do FluxMEI, especializado em MEIs brasileiros. Responda de forma prática, objetiva e baseada apenas nos dados enviados.
Responda de forma profissional, objetiva e didatica.
Use somente os dados financeiros enviados no contexto.
Nao invente numeros, metas, despesas, receitas, datas ou eventos.
Quando faltar informacao, diga claramente que nao ha dados suficientes.
Nunca solicite nem mencione senha, token, CPF/CNPJ, dados de cartao, CVV, provider_raw ou secrets.
Priorize recomendacoes praticas, com proximos passos simples para o MEI.`;

function moneyNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function sanitizeText(value, max = 180) {
  return String(value || '')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[documento_removido]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[documento_removido]')
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[cartao_removido]')
    .replace(/\b\d{3,4}\b/g, (match) => (/(cvv|cvc|codigo|cartao)/i.test(value) ? '[codigo_removido]' : match))
    .replace(/(senha|token|secret|secrets|cvv|cvc)\s*[:=]\s*\S+/gi, '$1=[removido]')
    .slice(0, max);
}

function sanitizeLogText(value, max = 1200) {
  if (value === undefined || value === null) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text
    .replace(process.env.GEMINI_API_KEY || '__no_gemini_key__', '[gemini_key_redacted]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[documento_removido]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[documento_removido]')
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[cartao_removido]')
    .replace(/(authorization|token|api[_-]?key|secret|senha|cvv|cvc)\s*[:=]\s*["']?[^"',\s}]+/gi, '$1=[removido]')
    .slice(0, max);
}

function getGeminiStatus(error = {}) {
  return error.status
    || error.statusCode
    || error.code
    || error.response?.status
    || error.response?.statusCode
    || null;
}

function getGeminiResponseBody(error = {}) {
  return error.response?.data
    || error.response?.body
    || error.responseBody
    || error.body
    || error.details
    || null;
}

function getGeminiErrorSignal(error = {}) {
  return [
    error.message,
    error.name,
    error.code,
    error.status,
    error.statusCode,
    error.response?.status,
    getGeminiResponseBody(error)
  ].filter(Boolean).map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(' ');
}

function isGeminiRateLimitError(error = {}) {
  const status = Number(getGeminiStatus(error));
  const signal = getGeminiErrorSignal(error);
  return status === 429
    || /RESOURCE_EXHAUSTED|rate.?limit|quota|too many requests/i.test(signal);
}

function isGeminiInvalidModelError(error = {}) {
  const status = Number(getGeminiStatus(error));
  const signal = getGeminiErrorSignal(error);
  return [400, 404].includes(status)
    && /(model|models\/|not found|not_found|invalid|unsupported|indisponivel|unavailable)/i.test(signal);
}

function getGeminiModelLabel(model) {
  return model?.model || model?.modelName || model?._model || geminiModelName;
}

function logGeminiError(error, model) {
  console.error('[gemini:error]', {
    provider: 'gemini',
    operation: 'responderAssistenteFinanceiro',
    status: getGeminiStatus(error),
    statusCode: error?.statusCode || error?.response?.statusCode || null,
    message: sanitizeLogText(error?.message, 500),
    name: error?.name || null,
    response_body: sanitizeLogText(getGeminiResponseBody(error)),
    has_gemini_api_key: Boolean(process.env.GEMINI_API_KEY),
    model: getGeminiModelLabel(model)
  });
}

function monthKey(dateValue) {
  return String(dateValue || '').slice(0, 7);
}

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function previousMonthKey(anoMes = currentMonthKey()) {
  const [year, month] = anoMes.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function sanitizeMovement(item = {}) {
  return {
    data: item.data || null,
    tipo: item.tipo || null,
    categoria: sanitizeText(item.categoria, 80) || null,
    descricao: sanitizeText(item.descricao) || null,
    valor: moneyNumber(item.valor),
    forma_pagamento: sanitizeText(item.forma_pagamento, 40) || null,
    observacao: sanitizeText(item.observacao, 220) || null
  };
}

function sanitizeGoal(item = {}) {
  return {
    id: item.id || null,
    nome: sanitizeText(item.nome || item.titulo || item.title, 100) || null,
    descricao: sanitizeText(item.descricao || item.description, 180) || null,
    valor: moneyNumber(item.valor || item.valor_meta || item.valor_alvo || item.meta),
    valor_atual: moneyNumber(item.valor_atual || item.progresso || item.atual),
    prazo: item.prazo || item.data_limite || item.deadline || null,
    status: sanitizeText(item.status, 60) || null
  };
}

function summarizeSafeMovements(movimentacoes = []) {
  const totalReceitas = movimentacoes
    .filter((item) => item.tipo === 'entrada')
    .reduce((sum, item) => sum + moneyNumber(item.valor), 0);
  const totalDespesas = movimentacoes
    .filter((item) => item.tipo === 'saida')
    .reduce((sum, item) => sum + moneyNumber(item.valor), 0);
  const categorias = {};
  const receitasPorMes = {};
  const despesasPorMes = {};

  for (const item of movimentacoes) {
    const key = monthKey(item.data);
    if (item.tipo === 'saida') {
      const categoria = item.categoria || 'Sem categoria';
      categorias[categoria] = moneyNumber((categorias[categoria] || 0) + moneyNumber(item.valor));
      if (key) despesasPorMes[key] = moneyNumber((despesasPorMes[key] || 0) + moneyNumber(item.valor));
    }
    if (item.tipo === 'entrada' && key) {
      receitasPorMes[key] = moneyNumber((receitasPorMes[key] || 0) + moneyNumber(item.valor));
    }
  }

  return {
    total_receitas: moneyNumber(totalReceitas),
    total_despesas: moneyNumber(totalDespesas),
    saldo: moneyNumber(totalReceitas - totalDespesas),
    quantidade_movimentacoes: movimentacoes.length,
    categorias_despesas: Object.entries(categorias)
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor),
    receitas_por_mes: receitasPorMes,
    despesas_por_mes: despesasPorMes
  };
}

async function fetchOptionalRows(table, select, buildQuery = (query) => query) {
  try {
    const query = buildQuery(supabaseAdmin.from(table).select(select));
    const { data, error } = await query;
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

export async function buildFinancialAiContext(userId) {
  const [movimentacoesRaw, dasRaw, metasRaw] = await Promise.all([
    fetchOptionalRows('movimentacoes', 'data,tipo,categoria,descricao,valor,forma_pagamento,observacao', (query) => query
      .eq('user_id', userId)
      .order('data', { ascending: false })
      .limit(250)),
    fetchOptionalRows('das', 'mes_referencia,vencimento,valor,status', (query) => query
      .eq('user_id', userId)
      .order('vencimento', { ascending: true })
      .limit(12)),
    fetchOptionalRows('metas', '*', (query) => query
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20))
  ]);

  const movimentacoes = (movimentacoesRaw || []).map(sanitizeMovement);
  const dates = movimentacoes.map((item) => item.data).filter(Boolean).sort();
  const resumo = summarizeSafeMovements(movimentacoes);

  return {
    periodo: {
      inicio: dates[0] || null,
      fim: dates.at(-1) || null
    },
    resumo,
    movimentacoes,
    categorias: resumo.categorias_despesas,
    metas: (metasRaw || []).map(sanitizeGoal),
    das: (dasRaw || []).map((item) => ({
      mes_referencia: item.mes_referencia || null,
      vencimento: item.vencimento || null,
      valor: moneyNumber(item.valor),
      status: item.status || null
    }))
  };
}

function percentChange(current, previous) {
  if (!previous && !current) return 0;
  if (!previous) return current > 0 ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function formatPercent(value) {
  const rounded = Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${Math.abs(rounded).toLocaleString('pt-BR')}%`;
}

export function generateAutomaticInsights(context = {}) {
  const resumo = context.resumo || {};
  const currentMonth = currentMonthKey();
  const previousMonth = previousMonthKey(currentMonth);
  const receitasMes = moneyNumber(resumo.receitas_por_mes?.[currentMonth]);
  const receitasAnterior = moneyNumber(resumo.receitas_por_mes?.[previousMonth]);
  const despesasMes = moneyNumber(resumo.despesas_por_mes?.[currentMonth]);
  const despesasAnterior = moneyNumber(resumo.despesas_por_mes?.[previousMonth]);
  const receitaChange = percentChange(receitasMes, receitasAnterior);
  const despesaChange = percentChange(despesasMes, despesasAnterior);
  const topExpense = resumo.categorias_despesas?.[0];
  const nextDas = (context.das || [])
    .filter((item) => item.status !== 'pago')
    .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)))[0];
  const insights = [];

  if (receitasMes || receitasAnterior) {
    insights.push({
      type: receitaChange >= 0 ? 'positive' : 'warning',
      title: receitaChange >= 0
        ? `Receita aumentou ${formatPercent(receitaChange)} este mes.`
        : `Receita caiu ${formatPercent(receitaChange)} este mes.`,
      metric: receitasMes
    });
  }

  if (despesasMes || despesasAnterior) {
    insights.push({
      type: despesaChange > 0 ? 'warning' : 'positive',
      title: despesaChange > 0
        ? `Despesas cresceram ${formatPercent(despesaChange)} este mes.`
        : 'Despesas ficaram controladas este mes.',
      metric: despesasMes
    });
  }

  if (topExpense) {
    insights.push({
      type: 'info',
      title: `Sua maior despesa continua sendo ${topExpense.categoria}.`,
      metric: topExpense.valor
    });
  }

  insights.push({
    type: resumo.saldo >= 0 ? 'positive' : 'danger',
    title: resumo.saldo >= 0
      ? 'Seu saldo acumulado esta positivo.'
      : 'Seu lucro caiu e o saldo acumulado esta negativo.',
    metric: moneyNumber(resumo.saldo)
  });

  if ((context.metas || []).length) {
    insights.push({
      type: 'goal',
      title: 'Voce possui metas financeiras para acompanhar.',
      metric: context.metas.length
    });
  }

  if (nextDas) {
    insights.push({
      type: 'warning',
      title: `O DAS vence em breve: ${nextDas.vencimento}.`,
      metric: nextDas.valor
    });
  }

  if (!context.movimentacoes?.length) {
    insights.push({
      type: 'info',
      title: INSUFFICIENT_FINANCIAL_DATA_MESSAGE,
      metric: 0
    });
  }

  return insights.slice(0, 6);
}

export async function responderAssistenteFinanceiro({ userId, message, model = geminiModel }) {
  if (aiProvider !== 'gemini') {
    throw new AppError('Assistente financeiro indisponivel no momento.', 503, null, { expose: true });
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new AppError(GEMINI_MISSING_KEY_MESSAGE, 503, null, { expose: true });
  }

  const context = await buildFinancialAiContext(userId);
  const insights = generateAutomaticInsights(context);

  if (!context.resumo.quantidade_movimentacoes) {
    return {
      answer: INSUFFICIENT_FINANCIAL_DATA_MESSAGE,
      context,
      insights
    };
  }

  if (!model || typeof model.generateContent !== 'function') {
    throw new AppError(GEMINI_INVALID_MODEL_MESSAGE, 503, null, { expose: true });
  }
  const payload = {
    pergunta: message,
    contexto_financeiro: context
  };

  try {
    const result = await model.generateContent([
      FINANCIAL_ASSISTANT_PROMPT,
      JSON.stringify(payload, null, 2)
    ]);

    return {
      answer: result.response.text(),
      context,
      insights
    };
  } catch (error) {
    logGeminiError(error, model);
    if (isGeminiRateLimitError(error)) {
      throw new AppError(GEMINI_RATE_LIMIT_MESSAGE, 503, null, { expose: true });
    }
    if (isGeminiInvalidModelError(error)) {
      throw new AppError(GEMINI_INVALID_MODEL_MESSAGE, 503, null, { expose: true });
    }
    throw new AppError(GEMINI_GENERIC_ERROR_MESSAGE, 503, null, { expose: true });
  }
}

export async function gerarRelatorioIA(userId, periodo) {
  if (!geminiModel) throw new AppError('GEMINI_API_KEY nao configurada.', 500);

  const movimentacoes = await fetchMovimentacoes(userId, periodo.inicio, periodo.fim);
  const resumo = summarizeMovimentacoes(movimentacoes, periodo);

  const result = await geminiModel.generateContent([
    PROMPT,
    JSON.stringify({ resumo, movimentacoes }, null, 2)
  ]);

  const texto = result.response.text();

  const { data, error } = await supabaseAdmin
    .from('relatorios_ia')
    .insert({
      user_id: userId,
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim,
      prompt: PROMPT,
      resposta: texto,
      dados_base: { resumo, movimentacoes }
    })
    .select()
    .single();

  if (error) throw new AppError('Erro ao salvar relatorio de IA.', 500, error.message);

  return {
    relatorio: texto,
    resumo,
    registro: data
  };
}

export const geminiAssistantTestUtils = {
  sanitizeMovement,
  sanitizeGoal,
  summarizeSafeMovements,
  generateAutomaticInsights
};
