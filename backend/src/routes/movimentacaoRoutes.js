import { Router } from 'express';
import { authMiddleware, requirePlanFeature } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/errorMiddleware.js';
import {
  createMovimentacao,
  deleteMovimentacao,
  getMovimentacao,
  listMovimentacoes,
  updateMovimentacao
} from '../controllers/movimentacaoController.js';

const router = Router();

router.use(authMiddleware);
router.post('/', requirePlanFeature('movimentacoes'), asyncHandler(createMovimentacao));
router.get('/', asyncHandler(listMovimentacoes));
router.get('/:id', asyncHandler(getMovimentacao));
router.put('/:id', asyncHandler(updateMovimentacao));
router.delete('/:id', asyncHandler(deleteMovimentacao));

export default router;
