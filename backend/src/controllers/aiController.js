import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { safelyRecordAuditLog } from '../services/auditLogService.js';
import { getFinancialForecast } from '../services/financialForecastService.js';
import { generateFinancialInsights } from '../services/financialIntelligenceService.js';
import {
  buildFinancialAiContext,
  generateAutomaticInsights,
  responderAssistenteFinanceiro
} from '../services/geminiService.js';

function cleanText(value, { max = 4000, required = true } = {}) {
  const text = String(value || '').trim();
  if (required && !text) throw new AppError('Mensagem obrigatoria.', 400);
  return text.slice(0, max);
}

function titleFromMessage(message) {
  const text = cleanText(message, { max: 60 });
  return text.length >= 8 ? text : 'Nova conversa';
}

function sanitizeMessage(row = {}) {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    role: row.role,
    content: row.content,
    created_at: row.created_at
  };
}

function sanitizeConversation(row = {}) {
  return {
    id: row.id,
    title: row.title || 'Nova conversa',
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function ensureConversation(userId, conversationId, firstMessage) {
  if (conversationId) {
    const { data, error } = await supabaseAdmin
      .from('ai_conversations')
      .select('id,user_id,title,created_at,updated_at')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw new AppError('Erro ao consultar conversa.', 500, error.message);
    if (!data) throw new AppError('Conversa nao encontrada.', 404);
    return data;
  }

  const { data, error } = await supabaseAdmin
    .from('ai_conversations')
    .insert({
      user_id: userId,
      title: titleFromMessage(firstMessage)
    })
    .select()
    .single();

  if (error) throw new AppError('Erro ao criar conversa.', 500, error.message);
  return data;
}

async function insertMessage({ conversationId, userId, role, content, metadata = {} }) {
  const { data, error } = await supabaseAdmin
    .from('ai_messages')
    .insert({
      conversation_id: conversationId,
      user_id: userId,
      role,
      content,
      metadata
    })
    .select()
    .single();

  if (error) throw new AppError('Erro ao salvar mensagem da IA.', 500, error.message);
  return data;
}

async function touchConversation(conversationId, userId) {
  await supabaseAdmin
    .from('ai_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('user_id', userId);
}

export async function aiInsights(req, res) {
  const context = await buildFinancialAiContext(req.user.id);
  const insights = generateAutomaticInsights(context);

  await safelyRecordAuditLog({
    req,
    userId: req.user.id,
    actorUserId: req.user.id,
    action: 'ai.analysis',
    entityType: 'ai',
    entityId: req.user.id,
    metadata: {
      quantidade_movimentacoes: context.resumo.quantidade_movimentacoes,
      insights: insights.length
    }
  });

  res.json({
    success: true,
    insights,
    resumo: context.resumo,
    periodo: context.periodo
  });
}

export async function aiForecast(req, res) {
  const forecast = await getFinancialForecast(req.user.id);

  await safelyRecordAuditLog({
    req,
    userId: req.user.id,
    actorUserId: req.user.id,
    action: 'ai.forecast',
    entityType: 'ai',
    entityId: req.user.id,
    metadata: {
      score: forecast.financial_score?.value ?? null,
      insufficient_data: forecast.insufficient_data
    }
  });

  res.json(forecast);
}

export async function aiIntelligence(req, res) {
  const intelligence = await generateFinancialInsights(req.user.id);

  await safelyRecordAuditLog({
    req,
    userId: req.user.id,
    actorUserId: req.user.id,
    action: 'ai.intelligence',
    entityType: 'ai',
    entityId: req.user.id,
    metadata: {
      score: intelligence.radar_score?.value ?? null,
      risk_level: intelligence.risk_level,
      insights: intelligence.insights?.length || 0,
      insufficient_data: intelligence.insufficient_data
    }
  });

  res.json(intelligence);
}

export async function aiChat(req, res) {
  const message = cleanText(req.body?.message || req.body?.pergunta, { max: 2000 });
  const conversation = await ensureConversation(req.user.id, req.body?.conversation_id, message);
  const aiResult = await responderAssistenteFinanceiro({ userId: req.user.id, message });

  const userMessage = await insertMessage({
    conversationId: conversation.id,
    userId: req.user.id,
    role: 'user',
    content: message
  });
  const assistantMessage = await insertMessage({
    conversationId: conversation.id,
    userId: req.user.id,
    role: 'assistant',
    content: aiResult.answer,
    metadata: {
      periodo: aiResult.context.periodo,
      quantidade_movimentacoes: aiResult.context.resumo.quantidade_movimentacoes,
      saldo: aiResult.context.resumo.saldo
    }
  });

  await touchConversation(conversation.id, req.user.id);
  await safelyRecordAuditLog({
    req,
    userId: req.user.id,
    actorUserId: req.user.id,
    action: 'ai.chat',
    entityType: 'ai_conversation',
    entityId: conversation.id,
    metadata: {
      question_length: message.length,
      quantidade_movimentacoes: aiResult.context.resumo.quantidade_movimentacoes
    }
  });

  res.json({
    success: true,
    conversation: sanitizeConversation(conversation),
    messages: [sanitizeMessage(userMessage), sanitizeMessage(assistantMessage)],
    answer: aiResult.answer,
    insights: aiResult.insights
  });
}

export async function listAiConversations(req, res) {
  const { data, error } = await supabaseAdmin
    .from('ai_conversations')
    .select('id,title,created_at,updated_at')
    .eq('user_id', req.user.id)
    .order('updated_at', { ascending: false })
    .limit(30);

  if (error) throw new AppError('Erro ao listar conversas.', 500, error.message);
  res.json({ success: true, conversations: (data || []).map(sanitizeConversation) });
}

export async function getAiConversation(req, res) {
  const { data: conversation, error: conversationError } = await supabaseAdmin
    .from('ai_conversations')
    .select('id,title,created_at,updated_at')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .maybeSingle();

  if (conversationError) throw new AppError('Erro ao consultar conversa.', 500, conversationError.message);
  if (!conversation) throw new AppError('Conversa nao encontrada.', 404);

  const { data: messages, error: messagesError } = await supabaseAdmin
    .from('ai_messages')
    .select('id,conversation_id,role,content,created_at')
    .eq('conversation_id', conversation.id)
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: true });

  if (messagesError) throw new AppError('Erro ao carregar mensagens.', 500, messagesError.message);
  res.json({
    success: true,
    conversation: sanitizeConversation(conversation),
    messages: (messages || []).map(sanitizeMessage)
  });
}

export async function renameAiConversation(req, res) {
  const title = cleanText(req.body?.title, { max: 80 });
  const { data, error } = await supabaseAdmin
    .from('ai_conversations')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select('id,title,created_at,updated_at')
    .single();

  if (error) throw new AppError('Conversa nao encontrada ou nao atualizada.', 404);
  res.json({ success: true, conversation: sanitizeConversation(data) });
}

export async function deleteAiConversation(req, res) {
  const { error } = await supabaseAdmin
    .from('ai_conversations')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) throw new AppError('Erro ao excluir conversa.', 500, error.message);
  res.status(204).send();
}
