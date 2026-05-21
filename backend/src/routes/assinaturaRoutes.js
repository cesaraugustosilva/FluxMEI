import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/errorMiddleware.js';
import {
  cancelarAssinatura,
  createAssinatura,
  listAssinaturas,
  planos,
  updateAssinatura
} from '../controllers/assinaturaController.js';

const router = Router();

router.get('/planos', asyncHandler(planos));
router.get('/', authMiddleware, asyncHandler(listAssinaturas));
router.post('/', authMiddleware, asyncHandler(createAssinatura));
router.put('/:id', authMiddleware, asyncHandler(updateAssinatura));
router.patch('/:id/cancelar', authMiddleware, asyncHandler(cancelarAssinatura));

export default router;
