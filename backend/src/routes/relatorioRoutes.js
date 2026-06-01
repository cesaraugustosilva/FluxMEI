import { Router } from 'express';
import { authMiddleware, checkSubscriptionAccess } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/errorMiddleware.js';
import { diario, mensal, personalizado, relatorioIA, semanal } from '../controllers/relatorioController.js';

const router = Router();

router.use(authMiddleware);
router.use(checkSubscriptionAccess);
router.get('/diario', asyncHandler(diario));
router.get('/semanal', asyncHandler(semanal));
router.get('/mensal', asyncHandler(mensal));
router.get('/personalizado', asyncHandler(personalizado));
router.post('/ia', asyncHandler(relatorioIA));

export default router;
