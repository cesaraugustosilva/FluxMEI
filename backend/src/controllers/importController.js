import { importBankStatement, listBankImportHistory } from '../services/bankImportService.js';

export async function importBankStatementController(req, res) {
  const result = await importBankStatement(req.user.id, req.body || {});
  res.status(201).json(result);
}

export async function importHistory(req, res) {
  const history = await listBankImportHistory(req.user.id);
  res.json(history);
}
