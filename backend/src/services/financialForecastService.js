import { geminiModel } from '../config/gemini.js';
import { supabaseAdmin } from '../config/supabase.js';

const FORECAST_PROMPT = [
  'Voce e a FluxIA Pro do FluxMEI.',
  'Transforme as previsoes financeiras sanitizadas em recomendacoes curtas e praticas.',
  'Nao invente numeros, datas, metas ou valores. Use somente o JSON enviado.',
  'Nao mencione dados sensiveis, documentos, cartoes, tokens ou IDs.'
].join(' ');

function money(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function dateOnly(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

function monthKey(date = dateOnly()) {
  return String(date || '').slice(0, 7);
}

function previousMonth(date = new Date()) {
  const current = new Date(date);
  return new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 1));
}

function monthBounds(date = new Date()) {
  const current = new Date(date);
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(current.getUTCDate(), daysInMonth);
  return {
    month: `${year}-${String(month + 1).padStart(2, '0')}`,
    previous: monthKey(previousMonth(current).toISOString()),
    day,
    daysInMonth
  };
}

function percentChange(current, previous) {
  if (!previous && !current) return 0;
  if (!previous) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

function sumBy(items, predicate) {
  return money(items.filter(predicate).reduce((sum, item) => sum + money(item.valor), 0));
}

function groupExpensesByCategory(items) {
  const map = new Map();
  items.filter((item) => item.tipo === 'saida').forEach((item) => {
    const category = item.categoria || 'Outros';
    map.set(category, money((map.get(category) || 0) + money(item.valor)));
  });
  return [...map.entries()]
    .map(([categoria, valor]) => ({ categoria, valor }))
    .sort((a, b) => b.valor - a.valor);
}

function sanitizeRecommendationText(value = '') {
  return String(value || '')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[documento_removido]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[documento_removido]')
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[cartao_removido]')
    .replace(/(senha|token|secret|cvv|cvc)\s*[:=]\s*\S+/gi, '$1=[removido]')
    .slice(0, 1200);
}

async function fetchRows(table, select, buildQuery = (query) => query) {
  try {
    const { data, error } = await buildQuery(supabaseAdmin.from(table).select(select));
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

async function loadForecastData(userId) {
  const [movimentacoes, metas] = await Promise.all([
    fetchRows('movimentacoes', 'id,data,tipo,categoria,descricao,valor', (query) => query
      .eq('user_id', userId)
      .order('data', { ascending: false })
      .limit(500)),
    fetchRows('metas', '*', (query) => query
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30))
  ]);

  return { movimentacoes, metas };
}

function buildProjection(items, today = new Date()) {
  const bounds = monthBounds(today);
  const currentItems = items.filter((item) => monthKey(item.data) === bounds.month);
  const previousItems = items.filter((item) => monthKey(item.data) === bounds.previous);
  const currentRevenue = sumBy(currentItems, (item) => item.tipo === 'entrada');
  const currentExpenses = sumBy(currentItems, (item) => item.tipo === 'saida');
  const previousRevenue = sumBy(previousItems, (item) => item.tipo === 'entrada');
  const previousExpenses = sumBy(previousItems, (item) => item.tipo === 'saida');
  const revenueProjection = money((currentRevenue / bounds.day) * bounds.daysInMonth);
  const expensesProjection = money((currentExpenses / bounds.day) * bounds.daysInMonth);
  const profitProjection = money(revenueProjection - expensesProjection);

  return {
    period: bounds,
    current: {
      revenue: currentRevenue,
      expenses: currentExpenses,
      profit: money(currentRevenue - currentExpenses),
      days_elapsed: bounds.day,
      days_in_month: bounds.daysInMonth
    },
    previous: {
      revenue: previousRevenue,
      expenses: previousExpenses,
      profit: money(previousRevenue - previousExpenses)
    },
    revenue_forecast: {
      projected: revenueProjection,
      current: currentRevenue,
      previous: previousRevenue,
      change_vs_previous_percent: percentChange(revenueProjection, previousRevenue)
    },
    expenses_forecast: {
      projected: expensesProjection,
      current: currentExpenses,
      previous: previousExpenses,
      change_vs_previous_percent: percentChange(expensesProjection, previousExpenses),
      top_categories: groupExpensesByCategory(currentItems).slice(0, 5)
    },
    profit_forecast: {
      projected: profitProjection,
      current: money(currentRevenue - currentExpenses),
      previous: money(previousRevenue - previousExpenses),
      change_vs_previous_percent: percentChange(profitProjection, previousRevenue - previousExpenses)
    },
    balance_forecast: {
      estimated_end_of_month: profitProjection,
      status: profitProjection >= 0 ? 'positive' : 'negative'
    },
    has_enough_data: currentItems.length >= 2
  };
}

function detectUnusualFrom(items, today = new Date()) {
  const bounds = monthBounds(today);
  const currentExpenses = items.filter((item) => item.tipo === 'saida' && monthKey(item.data) === bounds.month);
  const previousExpenses = items.filter((item) => item.tipo === 'saida' && monthKey(item.data) !== bounds.month);
  const byCategory = new Map();

  previousExpenses.forEach((item) => {
    const category = item.categoria || 'Outros';
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(money(item.valor));
  });

  return currentExpenses
    .map((item) => {
      const values = byCategory.get(item.categoria || 'Outros') || [];
      const avg = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
      const unusual = avg > 0 ? money(item.valor) > avg * 1.8 : money(item.valor) >= 500;
      return unusual ? {
        data: item.data,
        categoria: item.categoria || 'Outros',
        descricao: String(item.descricao || '').slice(0, 100),
        valor: money(item.valor),
        average_reference: money(avg),
        reason: avg > 0 ? 'acima_da_media' : 'valor_alto_sem_historico'
      } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5);
}

function goalValue(item = {}) {
  return money(item.valor || item.valor_meta || item.valor_alvo || item.meta);
}

function goalCurrent(item = {}) {
  return money(item.valor_atual || item.progresso || item.atual);
}

function forecastGoalsFrom(goals, projection) {
  const monthlyProfit = Math.max(0, money(projection.profit_forecast.projected));
  const dailySaving = monthlyProfit > 0 ? monthlyProfit / projection.period.daysInMonth : 0;
  const items = (goals || []).map((goal) => {
    const target = goalValue(goal);
    const current = goalCurrent(goal);
    const missing = Math.max(0, money(target - current));
    const estimatedDays = missing <= 0 ? 0 : (dailySaving > 0 ? Math.ceil(missing / dailySaving) : null);
    return {
      nome: String(goal.nome || goal.titulo || goal.title || 'Meta financeira').slice(0, 100),
      target,
      current,
      missing,
      estimated_days: estimatedDays,
      likely_to_achieve: missing <= 0 || (estimatedDays !== null && estimatedDays <= 60)
    };
  });

  return {
    has_goals: items.length > 0,
    likely_goal: items.find((item) => item.likely_to_achieve) || null,
    goals: items.slice(0, 5),
    message: items.length ? 'Previsao calculada com base no lucro projetado.' : 'Nenhuma meta financeira cadastrada para prever.'
  };
}

function scoreFrom({ projection, unusualExpenses, goals }) {
  let score = 50;
  if (projection.balance_forecast.estimated_end_of_month > 0) score += 15;
  else score -= 15;
  if (projection.profit_forecast.projected > 0) score += 15;
  else score -= 15;
  if (projection.expenses_forecast.change_vs_previous_percent <= 10) score += 10;
  else if (projection.expenses_forecast.change_vs_previous_percent > 25) score -= 10;
  if (projection.revenue_forecast.change_vs_previous_percent > 0) score += 10;
  else if (projection.revenue_forecast.change_vs_previous_percent < -10) score -= 10;
  if (goals.has_goals && goals.goals.some((goal) => goal.likely_to_achieve)) score += 5;
  if (!unusualExpenses.length) score += 5;
  else score -= Math.min(15, unusualExpenses.length * 5);

  const value = Math.max(0, Math.min(100, Math.round(score)));
  const label = value >= 80 ? 'Excelente' : value >= 60 ? 'Saudavel' : value >= 40 ? 'Atencao' : 'Critico';
  return { value, label };
}

function localRecommendations({ projection, unusualExpenses, score }) {
  const recommendations = [];
  if (!projection.has_enough_data) {
    recommendations.push('Ainda ha poucos dados no mes atual. Cadastre mais receitas e despesas para melhorar a previsao.');
  }
  if (projection.expenses_forecast.change_vs_previous_percent > 10) {
    recommendations.push(`Se continuar nesse ritmo, suas despesas devem fechar ${Math.round(projection.expenses_forecast.change_vs_previous_percent)}% acima do mes passado.`);
  }
  if (projection.profit_forecast.projected < 0) {
    recommendations.push('O lucro previsto esta negativo. Revise as maiores categorias de despesa antes do fim do mes.');
  }
  if (unusualExpenses.length) {
    recommendations.push('Ha gastos fora da media. Revise os lancamentos destacados antes de assumir novos compromissos.');
  }
  if (score.value >= 80) recommendations.push('Seu financeiro esta em bom ritmo. Mantenha a rotina de revisao semanal.');
  return recommendations.slice(0, 4);
}

async function aiRecommendations(payload, model = geminiModel) {
  if (!process.env.GEMINI_API_KEY || !model || typeof model.generateContent !== 'function') return null;

  const safePayload = {
    revenue_forecast: payload.revenue_forecast,
    expenses_forecast: payload.expenses_forecast,
    profit_forecast: payload.profit_forecast,
    balance_forecast: payload.balance_forecast,
    goal_forecast: payload.goal_forecast,
    unusual_expenses: payload.unusual_expenses,
    financial_score: payload.financial_score
  };

  try {
    const result = await model.generateContent([
      FORECAST_PROMPT,
      JSON.stringify(safePayload, null, 2)
    ]);
    const text = sanitizeRecommendationText(result.response.text());
    return text ? text.split(/\n+/).map((line) => line.replace(/^[-*\d. )]+/, '').trim()).filter(Boolean).slice(0, 4) : null;
  } catch {
    return null;
  }
}

export async function calculateMonthlyProjection(userId, options = {}) {
  const { movimentacoes } = await loadForecastData(userId);
  return buildProjection(movimentacoes, options.today || new Date());
}

export async function forecastRevenue(userId, options = {}) {
  return (await calculateMonthlyProjection(userId, options)).revenue_forecast;
}

export async function forecastExpenses(userId, options = {}) {
  return (await calculateMonthlyProjection(userId, options)).expenses_forecast;
}

export async function forecastProfit(userId, options = {}) {
  return (await calculateMonthlyProjection(userId, options)).profit_forecast;
}

export async function forecastBalance(userId, options = {}) {
  return (await calculateMonthlyProjection(userId, options)).balance_forecast;
}

export async function forecastGoals(userId, options = {}) {
  const { movimentacoes, metas } = await loadForecastData(userId);
  const projection = buildProjection(movimentacoes, options.today || new Date());
  return forecastGoalsFrom(metas, projection);
}

export async function detectUnusualExpenses(userId, options = {}) {
  const { movimentacoes } = await loadForecastData(userId);
  return detectUnusualFrom(movimentacoes, options.today || new Date());
}

export async function calculateFinancialScore(userId, options = {}) {
  const { movimentacoes, metas } = await loadForecastData(userId);
  const projection = buildProjection(movimentacoes, options.today || new Date());
  const unusualExpenses = detectUnusualFrom(movimentacoes, options.today || new Date());
  const goalForecast = forecastGoalsFrom(metas, projection);
  return scoreFrom({ projection, unusualExpenses, goals: goalForecast });
}

export async function getFinancialForecast(userId, options = {}) {
  const { movimentacoes, metas } = await loadForecastData(userId);
  const projection = buildProjection(movimentacoes, options.today || new Date());
  const unusualExpenses = detectUnusualFrom(movimentacoes, options.today || new Date());
  const goalForecast = forecastGoalsFrom(metas, projection);
  const financialScore = scoreFrom({ projection, unusualExpenses, goals: goalForecast });
  const basePayload = {
    revenue_forecast: projection.revenue_forecast,
    expenses_forecast: projection.expenses_forecast,
    profit_forecast: projection.profit_forecast,
    balance_forecast: projection.balance_forecast,
    goal_forecast: goalForecast,
    unusual_expenses: unusualExpenses,
    financial_score: financialScore,
    recommendations: localRecommendations({ projection, unusualExpenses, score: financialScore }),
    insufficient_data: !projection.has_enough_data,
    period: projection.period
  };
  const ai = await aiRecommendations(basePayload, options.model || geminiModel);
  return {
    ...basePayload,
    recommendations: ai || basePayload.recommendations,
    recommendation_source: ai ? 'gemini' : 'local'
  };
}

export const financialForecastTestUtils = {
  buildProjection,
  detectUnusualFrom,
  forecastGoalsFrom,
  scoreFrom,
  localRecommendations
};
