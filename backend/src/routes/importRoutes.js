import { Router } from 'express';
import { authMiddleware, checkSubscriptionAccess } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/errorMiddleware.js';
import { importBankStatementController, importHistory } from '../controllers/importController.js';

const router = Router();

router.use(authMiddleware);
router.use(checkSubscriptionAccess);
router.post('/bank-statement', asyncHandler(importBankStatementController));
router.get('/history', asyncHandler(importHistory));

export default router;
