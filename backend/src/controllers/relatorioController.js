import { AppError } from '../middlewares/errorMiddleware.js';
import { buildReport, getPeriodRange } from '../services/relatorioService.js';
import { gerarRelatorioIA } from '../services/geminiService.js';

export async function diario(req, res) {
  res.json(await buildReport(req.user.id, 'diario', req.query));
}

export async function semanal(req, res) {
  res.json(await buildReport(req.user.id, 'semanal', req.query));
}

export async function mensal(req, res) {
  res.json(await buildReport(req.user.id, 'mensal', req.query));
}

export async function personalizado(req, res) {
  res.json(await buildReport(req.user.id, 'personalizado', req.query));
}

export async function relatorioIA(req, res) {
  const periodo = req.body?.inicio && req.body?.fim
    ? { inicio: req.body.inicio, fim: req.body.fim }
    : getPeriodRange('mensal', req.body || {});

  if (!periodo.inicio || !periodo.fim) throw new AppError('Informe inicio e fim para o relatório.');
  res.json(await gerarRelatorioIA(req.user.id, periodo));
}
