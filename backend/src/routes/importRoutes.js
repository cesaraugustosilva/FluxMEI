import { Router } from 'express';
import { authMiddleware, checkSubscriptionAccess } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/errorMiddleware.js';
import {
  acceptImportCategory,
  ignoreImportedMovement,
  importAiReview,
  importBankStatementController,
  importHistory,
  importReview,
  reviewImportedMovement
} from '../controllers/importController.js';

const router = Router();

router.use(authMiddleware);
router.use(checkSubscriptionAccess);
router.post('/bank-statement', asyncHandler(importBankStatementController));
router.get('/history', asyncHandler(importHistory));
router.get('/:importId/review', asyncHandler(importReview));
router.post('/:importId/ai-review', asyncHandler(importAiReview));
router.post('/movimentacoes/:id/accept-category', asyncHandler(acceptImportCategory));
router.post('/movimentacoes/:id/ignore', asyncHandler(ignoreImportedMovement));
router.post('/movimentacoes/:id/reviewed', asyncHandler(reviewImportedMovement));

export default router;
