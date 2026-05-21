import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';

export function brDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function getPeriodRange(type, query = {}) {
  const now = new Date();
  const today = brDate(now);

  if (type === 'diario') return { inicio: query.data || today, fim: query.data || today };

  if (type === 'semanal') {
    const day = now.getUTCDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diffToMonday));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 6));
    return { inicio: brDate(start), fim: brDate(end) };
  }

  if (type === 'mensal') {
    const month = query.mes || `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const [year, monthIndex] = month.split('-').map(Number);
    const start = new Date(Date.UTC(year, monthIndex - 1, 1));
    const end = new Date(Date.UTC(year, monthIndex, 0));
    return { inicio: brDate(start), fim: brDate(end) };
  }

  if (type === 'personalizado') {
    if (!query.inicio || !query.fim) throw new AppError('Informe inicio e fim no formato YYYY-MM-DD.');
    return { inicio: query.inicio, fim: query.fim };
  }

  throw new AppError('Tipo de relatório inválido.');
}

export async function fetchMovimentacoes(userId, inicio, fim) {
  const { data, error } = await supabaseAdmin
    .from('movimentacoes')
    .select('*')
    .eq('user_id', userId)
    .gte('data', inicio)
    .lte('data', fim)
    .order('data', { ascending: true });

  if (error) throw new AppError('Erro ao buscar movimentações.', 500, error.message);
  return data || [];
}

export function summarizeMovimentacoes(movimentacoes, periodo) {
  const entradas = movimentacoes.filter((item) => item.tipo === 'entrada');
  const saidas = movimentacoes.filter((item) => item.tipo === 'saida');
  const totalEntradas = entradas.reduce((sum, item) => sum + Number(item.valor || 0), 0);
  const totalSaidas = saidas.reduce((sum, item) => sum + Number(item.valor || 0), 0);
  const saldo = totalEntradas - totalSaidas;

  const despesasPorCategoria = {};
  for (const item of saidas) {
    despesasPorCategoria[item.categoria] = (despesasPorCategoria[item.categoria] || 0) + Number(item.valor || 0);
  }

  const faturamentoPorDia = {};
  for (const item of entradas) {
    faturamentoPorDia[item.data] = (faturamentoPorDia[item.data] || 0) + Number(item.valor || 0);
  }

  const maioresDespesas = Object.entries(despesasPorCategoria)
    .map(([categoria, valor]) => ({ categoria, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5);

  const melhoresDias = Object.entries(faturamentoPorDia)
    .map(([data, valor]) => ({ data, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5);

  const resumoTextual = movimentacoes.length
    ? `No período de ${periodo.inicio} a ${periodo.fim}, você teve R$ ${totalEntradas.toFixed(2)} em entradas, R$ ${totalSaidas.toFixed(2)} em saídas e saldo de R$ ${saldo.toFixed(2)}.`
    : `Não há movimentações registradas no período de ${periodo.inicio} a ${periodo.fim}.`;

  return {
    periodo,
    total_entradas: totalEntradas,
    total_saidas: totalSaidas,
    saldo,
    maiores_despesas: maioresDespesas,
    melhores_dias: melhoresDias,
    resumo_textual: resumoTextual,
    quantidade_movimentacoes: movimentacoes.length
  };
}

export async function buildReport(userId, type, query = {}) {
  const periodo = getPeriodRange(type, query);
  const movimentacoes = await fetchMovimentacoes(userId, periodo.inicio, periodo.fim);
  return summarizeMovimentacoes(movimentacoes, periodo);
}
