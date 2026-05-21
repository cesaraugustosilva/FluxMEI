import { geminiModel } from '../config/gemini.js';
import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { fetchMovimentacoes, summarizeMovimentacoes } from './relatorioService.js';

const PROMPT = `Você é um assistente financeiro para MEIs no Brasil.
Analise os dados financeiros fornecidos e gere um relatório simples, claro e útil.
Use linguagem fácil, sem termos técnicos.
Mostre:
1. resumo do período
2. total de entradas
3. total de saídas
4. saldo/lucro
5. maiores gastos
6. melhores dias de faturamento
7. alertas importantes
8. recomendações práticas
Não invente dados. Se faltar informação, avise.`;

export async function gerarRelatorioIA(userId, periodo) {
  if (!geminiModel) throw new AppError('GEMINI_API_KEY não configurada.', 500);

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

  if (error) throw new AppError('Erro ao salvar relatório de IA.', 500, error.message);

  return {
    relatorio: texto,
    resumo,
    registro: data
  };
}
