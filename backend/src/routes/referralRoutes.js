import { Router } from 'express';
import { myReferral, applyReferral } from '../controllers/referralController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/errorMiddleware.js';

const router = Router();

router.get('/me', authMiddleware, asyncHandler(myReferral));
router.post('/apply', authMiddleware, asyncHandler(applyReferral));

export default router;
