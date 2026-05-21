import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';

export async function getCalendario(req, res) {
  const now = new Date();
  const mes = req.query.mes || `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const [year, monthIndex] = mes.split('-').map(Number);
  const inicio = req.query.inicio || `${mes}-01`;
  const fim = req.query.fim || new Date(Date.UTC(year, monthIndex, 0)).toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from('movimentacoes')
    .select('*')
    .eq('user_id', req.user.id)
    .gte('data', inicio)
    .lte('data', fim)
    .order('data', { ascending: true });

  if (error) throw new AppError('Erro ao buscar calendário financeiro.', 500, error.message);

  const grouped = {};
  for (const item of data || []) {
    if (!grouped[item.data]) {
      grouped[item.data] = { data: item.data, total_entradas: 0, total_saidas: 0, saldo_dia: 0, movimentacoes_do_dia: [] };
    }
    if (item.tipo === 'entrada') grouped[item.data].total_entradas += Number(item.valor);
    if (item.tipo === 'saida') grouped[item.data].total_saidas += Number(item.valor);
    grouped[item.data].movimentacoes_do_dia.push(item);
  }

  const dias = Object.values(grouped).map((dia) => ({
    ...dia,
    saldo_dia: dia.total_entradas - dia.total_saidas
  }));

  res.json({ periodo: { inicio, fim }, dias });
}
