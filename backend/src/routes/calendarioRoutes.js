import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/errorMiddleware.js';
import { getCalendario } from '../controllers/calendarioController.js';

const router = Router();

router.get('/', authMiddleware, asyncHandler(getCalendario));

export default router;
