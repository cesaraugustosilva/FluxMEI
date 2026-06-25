import { Router } from 'express';
import {
  exportMovimentacoesCsv,
  exportMovimentacoesJson,
  exportResumoJson
} from '../controllers/exportController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/errorMiddleware.js';

const router = Router();

router.use(authMiddleware);
router.get('/movimentacoes.csv', asyncHandler(exportMovimentacoesCsv));
router.get('/movimentacoes.json', asyncHandler(exportMovimentacoesJson));
router.get('/resumo.json', asyncHandler(exportResumoJson));

export default router;
