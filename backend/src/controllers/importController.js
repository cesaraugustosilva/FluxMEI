import { getImportDashboard, importBankStatement, listBankImportHistory } from '../services/bankImportService.js';
import {
  acceptCategorySuggestion,
  analyzeImportWithAi,
  getImportReview,
  markAsIgnored,
  markAsReviewed
} from '../services/reconciliationService.js';

export async function importBankStatementController(req, res) {
  const result = await importBankStatement(req.user.id, req.body || {});
  res.status(201).json(result);
}

export async function importHistory(req, res) {
  const history = await listBankImportHistory(req.user.id);
  res.json(history);
}

export async function importDashboard(req, res) {
  const dashboard = await getImportDashboard(req.user.id);
  res.json(dashboard);
}

export async function importReview(req, res) {
  const review = await getImportReview(req.user.id, req.params.importId);
  res.json(review);
}

export async function acceptImportCategory(req, res) {
  const movimentacao = await acceptCategorySuggestion(req.params.id, req.user.id);
  res.json(movimentacao);
}

export async function ignoreImportedMovement(req, res) {
  const movimentacao = await markAsIgnored(req.params.id, req.user.id);
  res.json(movimentacao);
}

export async function reviewImportedMovement(req, res) {
  const movimentacao = await markAsReviewed(req.params.id, req.user.id);
  res.json(movimentacao);
}

export async function importAiReview(req, res) {
  const result = await analyzeImportWithAi(req.user.id, req.params.importId);
  res.json(result);
}
