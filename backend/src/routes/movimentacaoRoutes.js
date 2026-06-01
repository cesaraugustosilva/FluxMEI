import { Router } from 'express';
import { authMiddleware, checkSubscriptionAccess } from '../middlewares/authMiddleware.js';
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
router.use(checkSubscriptionAccess);
router.post('/', asyncHandler(createMovimentacao));
router.get('/', asyncHandler(listMovimentacoes));
router.get('/:id', asyncHandler(getMovimentacao));
router.put('/:id', asyncHandler(updateMovimentacao));
router.delete('/:id', asyncHandler(deleteMovimentacao));

export default router;
