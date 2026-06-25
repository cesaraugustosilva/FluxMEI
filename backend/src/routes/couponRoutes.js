import { Router } from 'express';
import { validateCoupon } from '../controllers/couponController.js';
import { asyncHandler } from '../middlewares/errorMiddleware.js';

const router = Router();

router.get('/validate/:code', asyncHandler(validateCoupon));

export default router;
