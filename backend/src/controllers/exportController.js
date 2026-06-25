import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { safelyRecordAuditLog } from '../services/auditLogService.js';

const EXPORT_FIELDS = 'id,data,tipo,categoria,descricao,valor,forma_pagamento,observacao,created_at';

function todayFileDate() {
  return new Date().toISOString().slice(0, 10);
}

function moneyNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function sanitizeMovement(row = {}) {
  return {
    data: row.data || null,
    tipo: row.tipo || null,
    categoria: row.categoria || null,
    descricao: row.descricao || null,
    valor: moneyNumber(row.valor),
    forma_pagamento: row.forma_pagamento || null,
    observacao: row.observacao || null
  };
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n\r;]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(rows) {
  const headers = ['data', 'tipo', 'categoria', 'descricao', 'valor', 'forma_pagamento', 'observacao'];
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((field) => csvCell(row[field])).join(','))
  ];
  return lines.join('\n');
}

async function fetchMovements(userId) {
  const { data, error } = await supabaseAdmin
    .from('movimentacoes')
    .select(EXPORT_FIELDS)
    .eq('user_id', userId)
    .order('data', { ascending: true });

  if (error) throw new AppError('Erro ao exportar movimentacoes.', 500, error.message);
  return (data || []).map(sanitizeMovement);
}

function buildSummary(movements) {
  const totalReceitas = movements
    .filter((item) => item.tipo === 'entrada')
    .reduce((sum, item) => sum + moneyNumber(item.valor), 0);
  const totalDespesas = movements
    .filter((item) => item.tipo === 'saida')
    .reduce((sum, item) => sum + moneyNumber(item.valor), 0);
  const dates = movements.map((item) => item.data).filter(Boolean).sort();

  return {
    total_receitas: moneyNumber(totalReceitas),
    total_despesas: moneyNumber(totalDespesas),
    saldo: moneyNumber(totalReceitas - totalDespesas),
    quantidade_movimentacoes: movements.length,
    metas: [],
    periodo: {
      inicio: dates[0] || null,
      fim: dates[dates.length - 1] || null
    }
  };
}

function setAttachmentHeaders(res, { filename, contentType }) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
}

async function auditExport(req, action, metadata) {
  await safelyRecordAuditLog({
    req,
    userId: req.user.id,
    actorUserId: req.user.id,
    action,
    entityType: 'export',
    entityId: req.user.id,
    metadata
  });
}

export async function exportMovimentacoesCsv(req, res) {
  const movements = await fetchMovements(req.user.id);
  const filename = `fluxmei-movimentacoes-${todayFileDate()}.csv`;
  await auditExport(req, 'export.movimentacoes_csv', { quantidade_movimentacoes: movements.length });
  setAttachmentHeaders(res, { filename, contentType: 'text/csv; charset=utf-8' });
  res.send(`\uFEFF${toCsv(movements)}`);
}

export async function exportMovimentacoesJson(req, res) {
  const movements = await fetchMovements(req.user.id);
  const filename = `fluxmei-movimentacoes-${todayFileDate()}.json`;
  await auditExport(req, 'export.movimentacoes_json', { quantidade_movimentacoes: movements.length });
  setAttachmentHeaders(res, { filename, contentType: 'application/json; charset=utf-8' });
  res.send(JSON.stringify({ success: true, movimentacoes: movements }, null, 2));
}

export async function exportResumoJson(req, res) {
  const movements = await fetchMovements(req.user.id);
  const resumo = buildSummary(movements);
  const filename = `fluxmei-resumo-${todayFileDate()}.json`;
  await auditExport(req, 'export.resumo_json', {
    quantidade_movimentacoes: resumo.quantidade_movimentacoes,
    saldo: resumo.saldo
  });
  setAttachmentHeaders(res, { filename, contentType: 'application/json; charset=utf-8' });
  res.send(JSON.stringify({ success: true, resumo }, null, 2));
}

export const exportTestUtils = {
  sanitizeMovement,
  toCsv,
  buildSummary
};
