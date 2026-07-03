import { geminiModel } from '../config/gemini.js';
import { supabaseAdmin } from '../config/supabase.js';
import {
  createNotification,
  safelyCreateNotification
} from './notificationCenterService.js';

const INTELLIGENCE_PROMPT = [
  'Voce e a FluxIA do FluxMEI.',
  'Gere um resumo curto e pratico sobre a inteligencia financeira do usuario.',
  'Use somente o JSON sanitizado enviado.',
  'Nao invente valores, datas, metas ou eventos.',
  'Nao mencione CPF, CNPJ, cartao, tokens, secrets, IDs ou dados sensiveis.'
].join(' ');

const CRITICAL_TYPES = new Set([
  'score_critico',
  'cashflow_risk',
  'unusual_category_spending',
  'revenue_drop'
]);

function money(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function pct(current, previous) {
  if (!previous && !current) return 0;
  if (!previous) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

function monthKey(value) {
  return String(value || '').slice(0, 7);
}

function currentMonthKey(today = new Date()) {
  return today.toISOString().slice(0, 7);
}

function previousMonthKey(today = new Date()) {
  const date = new Date(today);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
}

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sanitizeSummary(value = '') {
  return String(value || '')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[documento]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[documento]')
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[cartao]')
    .replace(/(token|secret|senha|password|cvv|cvc)\s*[:=]\s*\S+/gi, '$1=[removido]')
    .slice(0, 900);
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

async function loadData(userId) {
  const [movimentacoes, metas] = await Promise.all([
    fetchRows('movimentacoes', 'id,user_id,data,tipo,categoria,descricao,valor', (query) => query
      .eq('user_id', userId)
      .order('data', { ascending: false })
      .limit(800)),
    fetchRows('metas', '*', (query) => query
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50))
  ]);
  return { movimentacoes, metas };
}

function periodStats(movimentacoes, today = new Date()) {
  const currentMonth = currentMonthKey(today);
  const previousMonth = previousMonthKey(today);
  const current = movimentacoes.filter((item) => monthKey(item.data) === currentMonth);
  const previous = movimentacoes.filter((item) => monthKey(item.data) === previousMonth);
  const revenue = (items) => money(items.filter((item) => item.tipo === 'entrada').reduce((sum, item) => sum + money(item.valor), 0));
  const expenses = (items) => money(items.filter((item) => item.tipo === 'saida').reduce((sum, item) => sum + money(item.valor), 0));
  const currentRevenue = revenue(current);
  const previousRevenue = revenue(previous);
  const currentExpenses = expenses(current);
  const previousExpenses = expenses(previous);

  return {
    currentMonth,
    previousMonth,
    current,
    previous,
    currentRevenue,
    previousRevenue,
    currentExpenses,
    previousExpenses,
    currentProfit: money(currentRevenue - currentExpenses),
    previousProfit: money(previousRevenue - previousExpenses),
    revenueChange: pct(currentRevenue, previousRevenue),
    expenseChange: pct(currentExpenses, previousExpenses),
    profitChange: pct(currentRevenue - currentExpenses, previousRevenue - previousExpenses),
    hasEnoughData: current.length >= 2 && previous.length >= 1
  };
}

function insight({ type, severity = 'info', title, message, recommendation, value = null, category = null, actionLabel = 'Ver movimentacoes', actionUrl = '/app/#movimentacoes' }) {
  return {
    type,
    severity,
    title,
    message,
    recommendation,
    value,
    category,
    action_label: actionLabel,
    action_url: actionUrl
  };
}

function groupByCategory(items) {
  const map = new Map();
  items.filter((item) => item.tipo === 'saida').forEach((item) => {
    const category = item.categoria || 'Outros';
    map.set(category, money((map.get(category) || 0) + money(item.valor)));
  });
  return map;
}

function targetValue(goal = {}) {
  return money(goal.valor || goal.valor_meta || goal.valor_alvo || goal.meta || goal.target);
}

function currentValue(goal = {}) {
  return money(goal.valor_atual || goal.progresso || goal.atual || goal.current);
}

function daysUntil(value, today = new Date()) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function localSummary(payload) {
  if (payload.insufficient_data) {
    return 'Ainda ha poucos dados para uma leitura completa. Registre mais movimentacoes para a FluxIA apontar riscos e oportunidades com mais precisao.';
  }
  const attention = payload.insights.filter((item) => ['warning', 'danger'].includes(item.severity)).length;
  return `Hoje a FluxIA encontrou ${attention} ponto${attention === 1 ? '' : 's'} de atencao. O radar esta ${payload.health_status.toLowerCase()} com risco ${payload.risk_level}.`;
}

async function aiSummary(payload, model = geminiModel) {
  if (!process.env.GEMINI_API_KEY || !model || typeof model.generateContent !== 'function') return null;
  const safePayload = {
    radar_score: payload.radar_score,
    health_status: payload.health_status,
    risk_level: payload.risk_level,
    cashflow_status: payload.cashflow_status,
    estimated_savings: payload.estimated_savings,
    insights: payload.insights.slice(0, 8).map((item) => ({
      type: item.type,
      severity: item.severity,
      title: item.title,
      value: item.value,
      category: item.category
    }))
  };

  try {
    const result = await model.generateContent([
      INTELLIGENCE_PROMPT,
      JSON.stringify(safePayload, null, 2)
    ]);
    return sanitizeSummary(result.response.text());
  } catch {
    return null;
  }
}

function buildExpenseIncrease(stats) {
  if (stats.expenseChange <= 20 || stats.currentExpenses < 100) return null;
  return insight({
    type: 'expense_increase',
    severity: stats.expenseChange >= 40 ? 'danger' : 'warning',
    title: `Despesas aumentaram ${Math.round(stats.expenseChange)}%`,
    message: `Suas saidas passaram de R$ ${stats.previousExpenses.toFixed(2)} para R$ ${stats.currentExpenses.toFixed(2)}.`,
    recommendation: 'Revise as maiores categorias antes de assumir novos gastos.',
    value: stats.currentExpenses
  });
}

function buildRevenueDrop(stats) {
  if (stats.revenueChange >= -15 || stats.previousRevenue < 100) return null;
  return insight({
    type: 'revenue_drop',
    severity: stats.revenueChange <= -30 ? 'danger' : 'warning',
    title: `Receita caiu ${Math.abs(Math.round(stats.revenueChange))}%`,
    message: `O faturamento atual ficou abaixo do mes anterior.`,
    recommendation: 'Acompanhe clientes em aberto e priorize entradas de caixa.',
    value: stats.currentRevenue
  });
}

function buildProfitDrop(stats) {
  if (stats.profitChange >= -20 || stats.previousProfit <= 0) return null;
  return insight({
    type: 'profit_drop',
    severity: stats.profitChange <= -40 ? 'danger' : 'warning',
    title: `Lucro caiu ${Math.abs(Math.round(stats.profitChange))}%`,
    message: 'O resultado do mes perdeu forca em relacao ao periodo anterior.',
    recommendation: 'Compare receita e despesas para identificar o que puxou a margem para baixo.',
    value: stats.currentProfit
  });
}

function buildCategorySpending(stats) {
  const current = groupByCategory(stats.current);
  const previous = groupByCategory(stats.previous);
  const insights = [];
  for (const [category, value] of current.entries()) {
    const previousValue = previous.get(category) || 0;
    const change = pct(value, previousValue);
    if (value >= 150 && change >= 35) {
      insights.push(insight({
        type: 'unusual_category_spending',
        severity: change >= 70 ? 'danger' : 'warning',
        title: `${category} aumentou ${Math.round(change)}%`,
        message: `A categoria ficou acima do padrao recente.`,
        recommendation: 'Confira lancamentos importados e veja se ha gasto pontual ou recorrente.',
        value,
        category
      }));
    }
  }
  return insights.sort((a, b) => b.value - a.value).slice(0, 3);
}

function buildRecurringExpenses(movimentacoes) {
  const map = new Map();
  movimentacoes.filter((item) => item.tipo === 'saida').forEach((item) => {
    const key = normalizeText(item.descricao || item.categoria || '');
    if (!key || key.length < 4) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });

  return [...map.values()]
    .filter((items) => new Set(items.map((item) => monthKey(item.data))).size >= 2)
    .map((items) => {
      const latest = [...items].sort((a, b) => String(b.data).localeCompare(String(a.data)))[0];
      return insight({
        type: 'recurring_expense',
        severity: 'info',
        title: 'Gasto recorrente detectado',
        message: `${latest.descricao || latest.categoria || 'Despesa'} aparece em mais de um mes.`,
        recommendation: 'Confira se e uma assinatura util ou uma cobranca esquecida.',
        value: money(latest.valor),
        category: latest.categoria || 'Outros'
      });
    })
    .slice(0, 2);
}

function buildCashflowRisk(stats) {
  if (stats.currentProfit >= 0) return null;
  return insight({
    type: 'cashflow_risk',
    severity: 'danger',
    title: 'Fluxo de caixa pode ficar negativo',
    message: `O saldo operacional do mes esta em R$ ${stats.currentProfit.toFixed(2)}.`,
    recommendation: 'Segure novas despesas e antecipe recebimentos importantes.',
    value: stats.currentProfit,
    actionLabel: 'Ver dashboard',
    actionUrl: '/app/#dashboard'
  });
}

function buildGoalInsights(metas, stats, today = new Date()) {
  return (metas || []).flatMap((goal) => {
    const target = targetValue(goal);
    const current = currentValue(goal);
    if (!target) return [];
    const progress = current / target;
    const dueIn = daysUntil(goal.data_limite || goal.prazo || goal.vencimento, today);
    const goalName = String(goal.nome || goal.titulo || 'Meta financeira').slice(0, 80);
    if (progress >= 0.9 && progress < 1) {
      return [insight({
        type: 'goal_near',
        severity: 'success',
        title: 'Meta proxima de conclusao',
        message: `${goalName} esta quase completa.`,
        recommendation: 'Mantenha o ritmo para concluir a meta.',
        value: money(target - current),
        actionLabel: 'Ver metas',
        actionUrl: '/app/#metas'
      })];
    }
    if ((dueIn !== null && dueIn <= 30 && progress < 0.75) || (stats.currentProfit < 0 && progress < 1)) {
      return [insight({
        type: 'goal_risk',
        severity: 'warning',
        title: 'Meta pode atrasar',
        message: `${goalName} precisa de atencao para nao sair do prazo.`,
        recommendation: 'Reduza gastos nao essenciais ou ajuste o prazo da meta.',
        value: money(target - current),
        actionLabel: 'Ver metas',
        actionUrl: '/app/#metas'
      })];
    }
    return [];
  }).slice(0, 3);
}

function savingsFromCategoryInsights(categoryInsights) {
  const total = categoryInsights.reduce((sum, item) => sum + Math.max(0, money(item.value) * 0.2), 0);
  return money(total);
}

function scoreFrom({ stats, categoryInsights, cashflowRisk, goalInsights, estimatedSavings }) {
  let score = 70;
  if (stats.currentProfit < 0) score -= 25;
  else score += 10;
  if (stats.revenueChange < -15) score -= Math.min(20, Math.abs(stats.revenueChange) / 2);
  if (stats.expenseChange > 20) score -= Math.min(20, stats.expenseChange / 3);
  if (stats.profitChange < -20) score -= 10;
  if (categoryInsights.some((item) => item.severity === 'danger')) score -= 10;
  if (cashflowRisk) score -= 10;
  if (goalInsights.some((item) => item.type === 'goal_near')) score += 5;
  if (estimatedSavings > 0) score += 3;
  const value = Math.max(0, Math.min(100, Math.round(score)));
  const label = value >= 80 ? 'Excelente' : value >= 60 ? 'Saudavel' : value >= 40 ? 'Atencao' : 'Critico';
  return { value, label };
}

function riskFromScore(score, hasDanger) {
  if (hasDanger || score.value < 40) return 'alto';
  if (score.value < 60) return 'medio';
  return 'baixo';
}

async function createCriticalNotifications(userId, payload) {
  const critical = payload.insights.filter((item) => item.severity === 'danger' && CRITICAL_TYPES.has(item.type));
  for (const item of critical.slice(0, 3)) {
    await safelyCreateNotification(createNotification, userId, {
      type: 'ai',
      severity: 'danger',
      title: item.title,
      message: item.message,
      action_label: item.action_label || 'Ver inteligencia',
      action_url: item.action_url || '/app/#fluxia',
      dedupe_key: `intelligence:${item.type}:${item.category || ''}:${payload.period || ''}`,
      metadata: {
        source: 'financial_intelligence',
        insight_type: item.type,
        category: item.category,
        value: item.value
      }
    });
  }

  if (payload.radar_score.value < 40) {
    await safelyCreateNotification(createNotification, userId, {
      type: 'ai',
      severity: 'danger',
      title: 'Radar financeiro critico',
      message: 'A FluxIA identificou um radar financeiro critico.',
      action_label: 'Ver inteligencia',
      action_url: '/app/#fluxia',
      dedupe_key: `intelligence:radar-critical:${payload.period || ''}`,
      metadata: { source: 'financial_intelligence', score: payload.radar_score.value }
    });
  }
}

async function intelligenceFromData(userId, { movimentacoes, metas }, options = {}) {
  const today = options.today || new Date();
  const stats = periodStats(movimentacoes || [], today);
  const expenseIncrease = buildExpenseIncrease(stats);
  const revenueDrop = buildRevenueDrop(stats);
  const profitDrop = buildProfitDrop(stats);
  const categoryInsights = buildCategorySpending(stats);
  const recurring = buildRecurringExpenses(movimentacoes || []);
  const cashflowRisk = buildCashflowRisk(stats);
  const goalInsights = buildGoalInsights(metas || [], stats, today);
  const estimatedSavings = savingsFromCategoryInsights(categoryInsights);

  const insights = [
    expenseIncrease,
    revenueDrop,
    profitDrop,
    ...categoryInsights,
    ...recurring,
    cashflowRisk,
    ...goalInsights
  ].filter(Boolean);

  if (estimatedSavings > 0) {
    insights.push(insight({
      type: 'savings_opportunity',
      severity: 'success',
      title: `Economia possivel de R$ ${estimatedSavings.toFixed(2)}`,
      message: 'A FluxIA encontrou categorias onde um ajuste leve pode aliviar o caixa.',
      recommendation: 'Defina um teto semanal para as categorias com maior aumento.',
      value: estimatedSavings
    }));
  }

  const radarScore = scoreFrom({ stats, categoryInsights, cashflowRisk, goalInsights, estimatedSavings });
  if (radarScore.value < 40) {
    insights.push(insight({
      type: 'score_critico',
      severity: 'danger',
      title: 'Score financeiro baixo',
      message: `Seu radar esta em ${radarScore.value}/100.`,
      recommendation: 'Priorize caixa positivo, reduza despesas variaveis e acompanhe entradas atrasadas.',
      value: radarScore.value,
      actionLabel: 'Abrir FluxIA',
      actionUrl: '/app/#fluxia'
    }));
  }

  const payload = {
    radar_score: radarScore,
    health_status: radarScore.label,
    risk_level: riskFromScore(radarScore, insights.some((item) => item.severity === 'danger')),
    cashflow_status: stats.currentProfit > 0 ? 'positivo' : (stats.currentProfit < 0 ? 'negativo' : 'neutro'),
    estimated_savings: estimatedSavings,
    insights: insights.slice(0, 12),
    summary: '',
    insufficient_data: !stats.hasEnoughData,
    period: stats.currentMonth
  };

  payload.summary = await aiSummary(payload, options.model || geminiModel) || localSummary(payload);
  await createCriticalNotifications(userId, payload);
  return payload;
}

export async function generateFinancialInsights(userId, options = {}) {
  const data = await loadData(userId);
  return intelligenceFromData(userId, data, options);
}

export async function detectExpenseIncrease(userId, options = {}) {
  const data = await loadData(userId);
  return buildExpenseIncrease(periodStats(data.movimentacoes, options.today || new Date()));
}

export async function detectRevenueDrop(userId, options = {}) {
  const data = await loadData(userId);
  return buildRevenueDrop(periodStats(data.movimentacoes, options.today || new Date()));
}

export async function detectProfitDrop(userId, options = {}) {
  const data = await loadData(userId);
  return buildProfitDrop(periodStats(data.movimentacoes, options.today || new Date()));
}

export async function detectUnusualCategorySpending(userId, options = {}) {
  const data = await loadData(userId);
  return buildCategorySpending(periodStats(data.movimentacoes, options.today || new Date()));
}

export async function detectRecurringExpenses(userId) {
  const data = await loadData(userId);
  return buildRecurringExpenses(data.movimentacoes);
}

export async function detectCashflowRisk(userId, options = {}) {
  const data = await loadData(userId);
  return buildCashflowRisk(periodStats(data.movimentacoes, options.today || new Date()));
}

export async function detectGoalRisks(userId, options = {}) {
  const data = await loadData(userId);
  return buildGoalInsights(data.metas, periodStats(data.movimentacoes, options.today || new Date()), options.today || new Date());
}

export async function calculateSavingsOpportunities(userId, options = {}) {
  const data = await loadData(userId);
  return savingsFromCategoryInsights(buildCategorySpending(periodStats(data.movimentacoes, options.today || new Date())));
}

export async function generateRadarScore(userId, options = {}) {
  const data = await loadData(userId);
  return (await intelligenceFromData(userId, data, options)).radar_score;
}

export const financialIntelligenceTestUtils = {
  periodStats,
  intelligenceFromData,
  buildExpenseIncrease,
  buildRevenueDrop,
  buildCategorySpending,
  buildCashflowRisk,
  scoreFrom,
  localSummary
};
