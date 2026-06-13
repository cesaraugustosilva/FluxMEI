import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { validateMonthReference } from '../utils/validation.js';

function monthRange(query) {
  const now = new Date();
  const mes = query.mes
    ? validateMonthReference(query.mes)
    : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const [year, monthIndex] = mes.split('-').map(Number);
  const fim = new Date(Date.UTC(year, monthIndex, 0)).toISOString().slice(0, 10);
  return { inicio: `${mes}-01`, fim, mes };
}

export async function getDashboard(req, res) {
  const { inicio, fim, mes } = monthRange(req.query);

  const [{ data: allMovs, error: allError }, { data: movsMes, error: mesError }, clientes, das] = await Promise.all([
    supabaseAdmin.from('movimentacoes').select('*').eq('user_id', req.user.id),
    supabaseAdmin.from('movimentacoes').select('*').eq('user_id', req.user.id).gte('data', inicio).lte('data', fim),
    supabaseAdmin.from('clientes').select('id', { count: 'exact', head: true }).eq('user_id', req.user.id),
    supabaseAdmin.from('das').select('*').eq('user_id', req.user.id).neq('status', 'pago').order('vencimento', { ascending: true }).limit(1)
  ]);

  if (allError || mesError || clientes.error || das.error) {
    throw new AppError('Erro ao carregar dashboard.', 500, allError?.message || mesError?.message || clientes.error?.message || das.error?.message);
  }

  const saldoAtual = (allMovs || []).reduce((sum, item) => sum + (item.tipo === 'entrada' ? Number(item.valor) : -Number(item.valor)), 0);
  const entradasMes = (movsMes || []).filter((item) => item.tipo === 'entrada').reduce((sum, item) => sum + Number(item.valor), 0);
  const saidasMes = (movsMes || []).filter((item) => item.tipo === 'saida').reduce((sum, item) => sum + Number(item.valor), 0);
  const maiorDespesa = (movsMes || []).filter((item) => item.tipo === 'saida').sort((a, b) => Number(b.valor) - Number(a.valor))[0] || null;

  const faturamentoPorDia = {};
  for (const item of (movsMes || []).filter((mov) => mov.tipo === 'entrada')) {
    faturamentoPorDia[item.data] = (faturamentoPorDia[item.data] || 0) + Number(item.valor);
  }
  const melhorDia = Object.entries(faturamentoPorDia).sort((a, b) => b[1] - a[1])[0] || null;

  const proximoDas = das.data?.[0] || null;
  const alertas = [];
  if (proximoDas) {
    const dias = Math.ceil((new Date(`${proximoDas.vencimento}T00:00:00`) - new Date()) / 86400000);
    if (dias < 0) alertas.push({ tipo: 'das_vencido', mensagem: 'Existe DAS vencido.' });
    if (dias >= 0 && dias <= 7) alertas.push({ tipo: 'das_proximo', mensagem: 'Existe DAS vencendo em até 7 dias.' });
  }

  res.json({
    mes,
    saldo_atual: saldoAtual,
    entradas_mes: entradasMes,
    saidas_mes: saidasMes,
    lucro_prejuizo_mes: entradasMes - saidasMes,
    quantidade_clientes: clientes.count || 0,
    maior_despesa: maiorDespesa,
    melhor_dia_faturamento: melhorDia ? { data: melhorDia[0], valor: melhorDia[1] } : null,
    proximo_das: proximoDas,
    alertas
  });
}
