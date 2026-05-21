import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/errorMiddleware.js';
import { getDashboard } from '../controllers/dashboardController.js';

const router = Router();

router.get('/', authMiddleware, asyncHandler(getDashboard));

export default router;
