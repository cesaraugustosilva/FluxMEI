import { geminiModel } from '../config/gemini.js';
import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { sanitizeText } from '../utils/validation.js';

const RECONCILIATION_STATUSES = new Set(['imported', 'reviewed', 'ignored', 'duplicated', 'reconciled']);

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function dateDiffDays(a, b) {
  const first = Date.parse(`${a}T00:00:00Z`);
  const second = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return Number.POSITIVE_INFINITY;
  return Math.abs(first - second) / 86400000;
}

function tokenSimilarity(a = '', b = '') {
  const left = new Set(normalizeText(a).split(' ').filter(Boolean));
  const right = new Set(normalizeText(b).split(' ').filter(Boolean));
  if (!left.size || !right.size) return 0;

  let intersection = 0;
  left.forEach((word) => {
    if (right.has(word)) intersection += 1;
  });

  const union = new Set([...left, ...right]).size;
  const jaccard = intersection / union;
  const leftText = [...left].join(' ');
  const rightText = [...right].join(' ');
  const contains = leftText.includes(rightText) || rightText.includes(leftText) ? 0.35 : 0;
  return Math.min(1, jaccard + contains);
}

export function suggestCategory(movimentacao = {}) {
  const text = normalizeText(movimentacao.descricao || movimentacao.desc || '');
  const rules = [
    ['Combustivel', ['posto', 'gasolina', 'etanol', 'ipiranga', 'shell', 'petrobras']],
    ['Alimentacao', ['ifood', 'mercado', 'restaurante', 'padaria', 'acougue', 'atacadao']],
    ['Transporte', ['uber', '99', 'taxi', 'estacionamento', 'pedagio']],
    ['Software', ['google', 'microsoft', 'adobe', 'canva', 'github', 'vercel', 'render']],
    ['Impostos', ['das', 'mei', 'receita federal', 'simples nacional']],
    ['Bancos/Taxas', ['tarifa', 'juros', 'anuidade', 'manutencao']]
  ];

  for (const [category, words] of rules) {
    if (words.some((word) => text.includes(word))) return category;
  }
  return 'Outros';
}

export function calculateConfidence(movimentacao = {}) {
  const description = normalizeText(movimentacao.descricao || movimentacao.desc || '');
  const suggestion = suggestCategory(movimentacao);
  if (suggestion === 'Outros') return 0.35;

  const exactWords = {
    Combustivel: ['posto', 'gasolina', 'etanol', 'ipiranga', 'shell', 'petrobras'],
    Alimentacao: ['ifood', 'mercado', 'restaurante', 'padaria', 'acougue', 'atacadao'],
    Transporte: ['uber', '99', 'taxi', 'estacionamento', 'pedagio'],
    Software: ['google', 'microsoft', 'adobe', 'canva', 'github', 'vercel', 'render'],
    Impostos: ['das', 'mei', 'receita federal', 'simples nacional'],
    'Bancos/Taxas': ['tarifa', 'juros', 'anuidade', 'manutencao']
  }[suggestion] || [];

  const hits = exactWords.filter((word) => description.includes(word)).length;
  return Math.min(0.95, 0.58 + (hits * 0.15));
}

function duplicateScore(candidate, movimentacao) {
  if (candidate.id && movimentacao.id && candidate.id === movimentacao.id) return 0;
  if (candidate.tipo !== movimentacao.tipo) return 0;
  if (Number(candidate.valor).toFixed(2) !== Number(movimentacao.valor).toFixed(2)) return 0;
  if (dateDiffDays(candidate.data, movimentacao.data) > 1) return 0;

  const similarity = tokenSimilarity(candidate.descricao, movimentacao.descricao);
  if (similarity < 0.45) return 0;
  return Number(Math.min(0.98, 0.45 + (similarity * 0.45)).toFixed(2));
}

export async function findPossibleDuplicates(userId, movimentacao) {
  const { data, error } = await supabaseAdmin
    .from('movimentacoes')
    .select('id,data,descricao,valor,tipo,categoria,import_id,reconciliation_status')
    .eq('user_id', userId);

  if (error) throw new AppError('Erro ao buscar possiveis duplicatas.', 500, error.message);

  return (data || [])
    .map((candidate) => ({ ...candidate, score: duplicateScore(candidate, movimentacao) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

async function assertOwnedImport(importId, userId) {
  const { data, error } = await supabaseAdmin
    .from('bank_imports')
    .select('id,filename,created_at,user_id,bank_name,parser_used,confidence')
    .eq('id', importId)
    .eq('user_id', userId)
    .single();

  if (error || !data) throw new AppError('Importacao nao encontrada.', 404);
  return data;
}

async function getOwnedMovement(id, userId) {
  const { data, error } = await supabaseAdmin
    .from('movimentacoes')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error || !data) throw new AppError('Movimentacao nao encontrada.', 404);
  return data;
}

function withSuggestion(movimentacao) {
  const aiSuggestion = movimentacao.ai_category_suggestion || suggestCategory(movimentacao);
  const confidence = movimentacao.category_confidence ?? calculateConfidence(movimentacao);
  return {
    ...movimentacao,
    reconciliation_status: movimentacao.reconciliation_status || 'imported',
    ai_category_suggestion: aiSuggestion,
    category_confidence: confidence
  };
}

export async function getImportReview(userId, importId) {
  const importRecord = await assertOwnedImport(importId, userId);
  const { data, error } = await supabaseAdmin
    .from('movimentacoes')
    .select('*')
    .eq('user_id', userId)
    .eq('import_id', importId)
    .order('data', { ascending: false });

  if (error) throw new AppError('Erro ao carregar revisao da importacao.', 500, error.message);

  const movimentacoes = [];
  for (const item of data || []) {
    const movement = withSuggestion(item);
    movimentacoes.push({
      ...movement,
      possible_duplicates: await findPossibleDuplicates(userId, movement)
    });
  }

  return { import: importRecord, movimentacoes };
}

async function updateMovementStatus(id, userId, status) {
  if (!RECONCILIATION_STATUSES.has(status)) throw new AppError('Status de conciliacao invalido.');

  const { data, error } = await supabaseAdmin
    .from('movimentacoes')
    .update({ reconciliation_status: status })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error || !data) throw new AppError('Movimentacao nao encontrada ou nao atualizada.', 404);
  return data;
}

export async function markAsReviewed(id, userId) {
  return updateMovementStatus(id, userId, 'reviewed');
}

export async function markAsIgnored(id, userId) {
  return updateMovementStatus(id, userId, 'ignored');
}

export async function acceptCategorySuggestion(id, userId) {
  const movement = withSuggestion(await getOwnedMovement(id, userId));
  const categoria = sanitizeText(movement.ai_category_suggestion, {
    field: 'Categoria sugerida',
    required: true,
    max: 80,
    rejectDangerous: true
  });

  const { data, error } = await supabaseAdmin
    .from('movimentacoes')
    .update({
      categoria,
      ai_category_suggestion: categoria,
      category_confidence: movement.category_confidence,
      reconciliation_status: 'reviewed'
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error || !data) throw new AppError('Movimentacao nao encontrada ou nao atualizada.', 404);
  return data;
}

function summarizeForAi(movimentacoes) {
  return movimentacoes.slice(0, 50).map((item) => ({
    data: item.data,
    descricao: sanitizeText(item.descricao || '', { field: 'Descricao', max: 120 }),
    valor: Number(item.valor),
    tipo: item.tipo,
    categoria_atual: item.categoria || 'Outros',
    categoria_sugerida: item.ai_category_suggestion,
    confianca: item.category_confidence,
    possiveis_duplicatas: (item.possible_duplicates || []).length
  }));
}

function fallbackAiReview(review) {
  const total = review.movimentacoes.length;
  const bankName = review.import?.bank_name || 'banco nao identificado';
  const despesas = review.movimentacoes.filter((item) => item.tipo === 'saida');
  const porCategoria = new Map();
  despesas.forEach((item) => {
    const key = item.ai_category_suggestion || item.categoria || 'Outros';
    porCategoria.set(key, (porCategoria.get(key) || 0) + Number(item.valor || 0));
  });
  const principais = [...porCategoria.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([categoria, valor]) => `${categoria}: R$ ${valor.toFixed(2)}`)
    .join('; ') || 'sem despesas relevantes';
  const duplicatas = review.movimentacoes.filter((item) => (item.possible_duplicates || []).length).length;

  return `Extrato identificado como ${bankName}. Analise segura da importacao: ${total} movimentacoes revisaveis. Principais categorias: ${principais}. Possiveis duplicatas: ${duplicatas}. Recomendacao: aceite categorias com alta confianca e revise manualmente itens duplicados antes de ignorar.`;
}

export async function analyzeImportWithAi(userId, importId, model = geminiModel) {
  const review = await getImportReview(userId, importId);
  const safeMovements = summarizeForAi(review.movimentacoes);
  const fallback = fallbackAiReview(review);

  if (!process.env.GEMINI_API_KEY || !model || typeof model.generateContent !== 'function') {
    return { analysis: fallback, provider: 'local', movimentacoes_analisadas: safeMovements.length };
  }

  const prompt = [
    'Voce e a FluxIA do FluxMEI. Analise somente o resumo financeiro sanitizado.',
    'Responda em portugues com: principais categorias, maiores gastos, possiveis duplicatas e recomendacoes.',
    'Nao invente dados pessoais e nao cite IDs.'
  ].join(' ');

  try {
    const result = await model.generateContent([
      prompt,
      JSON.stringify({
        banco_identificado: review.import?.bank_name || 'Banco nao identificado',
        parser: review.import?.parser_used || 'Parser Generico',
        movimentacoes: safeMovements
      }, null, 2)
    ]);
    return { analysis: result.response.text(), provider: 'gemini', movimentacoes_analisadas: safeMovements.length };
  } catch {
    return { analysis: fallback, provider: 'local', movimentacoes_analisadas: safeMovements.length };
  }
}
